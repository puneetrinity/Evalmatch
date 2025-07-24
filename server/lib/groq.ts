import Groq from "groq-sdk";
import crypto from 'crypto';
import { logger } from './logger';
import { 
  generateConsistentScoringPrompt,
  deterministicCache,
  normalizeScore,
  calculateConfidenceLevel,
  validateScoreConsistency
} from './consistent-scoring';
import {
  type AnalyzeResumeResponse,
  type AnalyzeJobDescriptionResponse,
  type MatchAnalysisResponse,
  type InterviewQuestionsResponse,
  type BiasAnalysisResponse,
} from "@shared/schema";

// Initialize Groq client only if API key is available
const groq = process.env.GROQ_API_KEY ? new Groq({
  apiKey: process.env.GROQ_API_KEY,
}) : null;

// Model configuration with different models for different use cases
const MODELS = {
  // Best for complex reasoning and analysis (recommended for resume/job analysis)
  ANALYSIS: "moonshot-v1-auto", // Kimi K2 Instruct
  
  // Fast and efficient for simpler tasks
  FAST: "qwen2.5-32b-instruct", // Qwen 3 32B
  
  // Most capable for complex matching and bias detection
  PREMIUM: "llama-3.3-70b-versatile", // Llama 3.3 70B
  
  // Default fallback
  DEFAULT: "moonshot-v1-auto"
};

// Pricing per 1M tokens (approximate)
const PRICING = {
  "moonshot-v1-auto": { input: 0.30, output: 0.30 },
  "qwen2.5-32b-instruct": { input: 0.20, output: 0.20 },
  "llama-3.3-70b-versatile": { input: 0.59, output: 0.79 },
};

// Cache for API responses to reduce duplicate calls
interface CacheItem<T> {
  timestamp: number;
  data: T;
}

interface ApiUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

// In-memory cache with 1 hour TTL
const responseCache: Record<string, CacheItem<any>> = {};
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Token usage tracking
let apiUsage: ApiUsage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  estimatedCost: 0
};

// Calculate hash for cache key
function calculateHash(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

// Get cached response if available and not expired
function getCachedResponse<T>(key: string): T | null {
  const cached = responseCache[key];
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    logger.debug('Cache hit for Groq request');
    return cached.data;
  }
  return null;
}

// Cache response
function setCachedResponse<T>(key: string, data: T): void {
  responseCache[key] = {
    timestamp: Date.now(),
    data
  };
}

// Calculate estimated cost
function calculateCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = PRICING[model as keyof typeof PRICING] || PRICING["moonshot-v1-auto"];
  return (promptTokens * pricing.input + completionTokens * pricing.output) / 1000000;
}

// Update API usage statistics
function updateUsage(model: string, promptTokens: number, completionTokens: number): void {
  const cost = calculateCost(model, promptTokens, completionTokens);
  apiUsage.promptTokens += promptTokens;
  apiUsage.completionTokens += completionTokens;
  apiUsage.totalTokens += promptTokens + completionTokens;
  apiUsage.estimatedCost += cost;
  
  logger.debug('Groq API usage updated', {
    model,
    promptTokens,
    completionTokens,
    cost: cost.toFixed(6),
    totalCost: apiUsage.estimatedCost.toFixed(6)
  });
}

// Generic function to call Groq API with deterministic settings
async function callGroqAPI(
  prompt: string,
  model: string = MODELS.DEFAULT,
  temperature: number = 0.0,  // Zero temperature for consistency
  seed?: number
): Promise<string> {
  if (!groq) {
    throw new Error("Groq API key is not configured");
  }

  try {
    const requestParams: any = {
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      model,
      temperature,
      max_tokens: 4000,
      stream: false,
      top_p: 1.0,  // Deterministic sampling
    };
    
    // Add seed for deterministic results if provided
    if (seed !== undefined) {
      requestParams.seed = seed;
    }

    const response = await groq.chat.completions.create(requestParams);

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response content from Groq API");
    }

    // Update usage statistics
    if (response.usage) {
      updateUsage(
        model,
        response.usage.prompt_tokens || 0,
        response.usage.completion_tokens || 0
      );
    }

    return content;
  } catch (error) {
    logger.error('Groq API call failed', error);
    throw error;
  }
}

// Get service status
export function getGroqServiceStatus() {
  return {
    isAvailable: !!groq,
    isConfigured: !!process.env.GROQ_API_KEY,
    statusMessage: groq ? "Groq API is ready" : "Groq API key not configured",
    provider: "Groq",
    models: Object.values(MODELS),
    usage: apiUsage,
    timestamp: new Date().toISOString()
  };
}

// Analyze resume using Groq
export async function analyzeResume(resumeText: string): Promise<AnalyzeResumeResponse> {
  const cacheKey = calculateHash(`groq_resume_${resumeText}`);
  const cached = getCachedResponse<AnalyzeResumeResponse>(cacheKey);
  if (cached) return cached;

  const prompt = `Analyze this resume and extract structured information. Return a JSON object with the following structure:

{
  "skills": ["skill1", "skill2", "skill3"],
  "experience": "X years",
  "education": ["degree1", "degree2"],
  "summary": "brief professional summary",
  "strengths": ["strength1", "strength2"],
  "jobTitles": ["title1", "title2"]
}

Resume text:
${resumeText}

Respond with only the JSON object, no additional text.`;

  try {
    const response = await callGroqAPI(prompt, MODELS.ANALYSIS);
    const parsedResponse = JSON.parse(response) as AnalyzeResumeResponse;
    
    setCachedResponse(cacheKey, parsedResponse);
    logger.info('Resume analyzed successfully with Groq');
    return parsedResponse;
  } catch (error) {
    logger.error('Error analyzing resume with Groq', error);
    
    // Re-throw the error instead of returning fallback response
    // The tiered provider will handle appropriate error messaging
    throw error;
  }
}

// Analyze job description using Groq
export async function analyzeJobDescription(title: string, description: string): Promise<AnalyzeJobDescriptionResponse> {
  const cacheKey = calculateHash(`groq_job_${title}_${description}`);
  const cached = getCachedResponse<AnalyzeJobDescriptionResponse>(cacheKey);
  if (cached) return cached;

  const prompt = `Analyze this job description and extract structured information. Return a JSON object with the following structure:

{
  "requiredSkills": ["skill1", "skill2", "skill3"],
  "preferredSkills": ["skill1", "skill2"],
  "experienceLevel": "entry/mid/senior/executive",
  "responsibilities": ["responsibility1", "responsibility2"],
  "qualifications": ["qualification1", "qualification2"],
  "summary": "brief job summary"
}

Job Title: ${title}
Job Description:
${description}

Respond with only the JSON object, no additional text.`;

  try {
    const response = await callGroqAPI(prompt, MODELS.ANALYSIS);
    const parsedResponse = JSON.parse(response) as AnalyzeJobDescriptionResponse;
    
    setCachedResponse(cacheKey, parsedResponse);
    logger.info('Job description analyzed successfully with Groq');
    return parsedResponse;
  } catch (error) {
    logger.error('Error analyzing job description with Groq', error);
    
    // Re-throw the error instead of returning fallback response
    // The tiered provider will handle appropriate error messaging
    throw error;
  }
}

// Analyze match between resume and job using Groq with consistent scoring
export async function analyzeMatch(
  resumeAnalysis: AnalyzeResumeResponse,
  jobAnalysis: AnalyzeJobDescriptionResponse,
  resumeText?: string,
  jobText?: string
): Promise<MatchAnalysisResponse> {
  // Use deterministic caching if we have the original texts
  let cacheKey: string;
  let cached: MatchAnalysisResponse | null = null;
  
  if (resumeText && jobText) {
    cacheKey = deterministicCache.generateKey(resumeText, jobText, 'match');
    cached = deterministicCache.get(cacheKey);
    if (cached) {
      logger.debug('Using cached consistent match analysis');
      return cached;
    }
  } else {
    // Fallback to old caching method
    cacheKey = calculateHash(`groq_match_${JSON.stringify(resumeAnalysis)}_${JSON.stringify(jobAnalysis)}`);
    cached = getCachedResponse<MatchAnalysisResponse>(cacheKey);
    if (cached) return cached;
  }

  // Generate consistent scoring prompt
  const prompt = resumeText && jobText 
    ? generateConsistentScoringPrompt(resumeText, jobText, 'match')
    : `Analyze the match between this resume and job description with CONSISTENT scoring. Use temperature=0 for deterministic results.

Return a JSON object with the following structure:
{
  "matchPercentage": 85,
  "matchedSkills": [
    {"skill": "JavaScript", "matchPercentage": 95},
    {"skill": "React", "matchPercentage": 88}
  ],
  "missingSkills": ["Python", "Docker"],
  "candidateStrengths": ["Strong in frontend", "Good communication"],
  "candidateWeaknesses": ["Limited backend experience"],
  "recommendations": ["Learn Python", "Gain Docker experience"],
  "confidenceLevel": "high"
}

Resume Analysis:
${JSON.stringify(resumeAnalysis, null, 2)}

Job Analysis:
${JSON.stringify(jobAnalysis, null, 2)}

Respond with only the JSON object, no additional text.`;

  try {
    // Generate deterministic seed from resume and job text
    const seed = resumeText && jobText 
      ? parseInt(crypto.createHash('sha256').update(`${resumeText}${jobText}`).digest('hex').substring(0, 8), 16) % 1000000
      : undefined;
    
    const response = await callGroqAPI(prompt, MODELS.PREMIUM, 0.0, seed);
    let parsedResponse = JSON.parse(response) as MatchAnalysisResponse;
    
    // Normalize scores for consistency
    if (parsedResponse.matchPercentage) {
      parsedResponse.matchPercentage = normalizeScore(parsedResponse.matchPercentage);
    }
    
    // Normalize matched skills scores
    if (parsedResponse.matchedSkills) {
      parsedResponse.matchedSkills = parsedResponse.matchedSkills.map(skill => ({
        ...skill,
        matchPercentage: normalizeScore(skill.matchPercentage || 0)
      }));
    }
    
    // Add confidence level if not present
    if (!parsedResponse.confidenceLevel && resumeText && jobText) {
      const confidence = calculateConfidenceLevel(
        resumeText.length,
        jobText.length,
        parsedResponse.matchedSkills?.length || 0
      );
      parsedResponse.confidenceLevel = confidence;
    }
    
    // Cache the result
    if (resumeText && jobText) {
      const seed = crypto.createHash('sha256').update(`${resumeText}${jobText}`).digest('hex').substring(0, 16);
      deterministicCache.set(cacheKey, parsedResponse, seed);
    } else {
      setCachedResponse(cacheKey, parsedResponse);
    }
    
    logger.info('Match analysis completed successfully with Groq (consistent scoring)', {
      matchPercentage: parsedResponse.matchPercentage,
      confidenceLevel: parsedResponse.confidenceLevel,
      matchedSkillsCount: parsedResponse.matchedSkills?.length || 0
    });
    return parsedResponse;
  } catch (error) {
    logger.error('Error analyzing match with Groq', error);
    
    // Re-throw the error instead of returning fallback response
    // The tiered provider will handle appropriate error messaging
    throw error;
  }
}

// Generate interview questions using Groq
export async function generateInterviewQuestions(
  resumeAnalysis: AnalyzeResumeResponse,
  jobAnalysis: AnalyzeJobDescriptionResponse,
  matchAnalysis: MatchAnalysisResponse
): Promise<InterviewQuestionsResponse> {
  const cacheKey = calculateHash(`groq_interview_${JSON.stringify({resumeAnalysis, jobAnalysis, matchAnalysis})}`);
  const cached = getCachedResponse<InterviewQuestionsResponse>(cacheKey);
  if (cached) return cached;

  const prompt = `Generate interview questions based on this candidate profile and job requirements. Return a JSON object with the following structure:

{
  "questions": [
    {
      "question": "Tell me about your experience with JavaScript",
      "category": "technical",
      "difficulty": "medium",
      "purpose": "Assess JavaScript proficiency"
    }
  ],
  "focusAreas": ["technical skills", "experience gaps"],
  "recommendations": ["Focus on backend experience"]
}

Resume Analysis:
${JSON.stringify(resumeAnalysis, null, 2)}

Job Analysis:
${JSON.stringify(jobAnalysis, null, 2)}

Match Analysis:
${JSON.stringify(matchAnalysis, null, 2)}

Generate 8-12 relevant questions. Respond with only the JSON object, no additional text.`;

  try {
    const response = await callGroqAPI(prompt, MODELS.ANALYSIS);
    const parsedResponse = JSON.parse(response) as InterviewQuestionsResponse;
    
    setCachedResponse(cacheKey, parsedResponse);
    logger.info('Interview questions generated successfully with Groq');
    return parsedResponse;
  } catch (error) {
    logger.error('Error generating interview questions with Groq', error);
    
    // Re-throw the error instead of returning fallback response
    // The tiered provider will handle appropriate error messaging
    throw error;
  }
}

// Analyze bias in job description using Groq
export async function analyzeBias(title: string, description: string): Promise<BiasAnalysisResponse> {
  const cacheKey = calculateHash(`groq_bias_${title}_${description}`);
  const cached = getCachedResponse<BiasAnalysisResponse>(cacheKey);
  if (cached) return cached;

  const prompt = `Analyze this job description for potential bias and discriminatory language. Return a JSON object with the following structure:

{
  "overallScore": 85,
  "biasIndicators": [
    {
      "type": "age",
      "severity": "low",
      "text": "young and energetic",
      "suggestion": "Use 'enthusiastic and motivated' instead"
    }
  ],
  "recommendations": ["Remove age references", "Use neutral language"],
  "summary": "Brief summary of bias analysis"
}

Job Title: ${title}
Job Description:
${description}

Look for bias related to: age, gender, race, religion, disability, nationality, sexual orientation, and other protected characteristics.
Respond with only the JSON object, no additional text.`;

  try {
    const response = await callGroqAPI(prompt, MODELS.PREMIUM);
    const parsedResponse = JSON.parse(response) as BiasAnalysisResponse;
    
    setCachedResponse(cacheKey, parsedResponse);
    logger.info('Bias analysis completed successfully with Groq');
    return parsedResponse;
  } catch (error) {
    logger.error('Error analyzing bias with Groq', error);
    
    // Re-throw the error instead of returning fallback response
    // The tiered provider will handle appropriate error messaging
    throw error;
  }
}

// Extract skills using Groq
export async function extractSkills(text: string, type: "resume" | "job"): Promise<string[]> {
  const cacheKey = calculateHash(`groq_skills_${type}_${text}`);
  const cached = getCachedResponse<string[]>(cacheKey);
  if (cached) return cached;

  const prompt = `Extract all technical and professional skills from this ${type} text. Return a JSON array of skill names only.

Example format: ["JavaScript", "React", "Node.js", "Project Management", "Communication"]

Text:
${text}

Respond with only the JSON array, no additional text.`;

  try {
    const response = await callGroqAPI(prompt, MODELS.FAST);
    const skills = JSON.parse(response) as string[];
    
    setCachedResponse(cacheKey, skills);
    logger.info(`Skills extracted successfully from ${type} with Groq`);
    return skills;
  } catch (error) {
    logger.error(`Error extracting skills from ${type} with Groq`, error);
    
    // Re-throw the error instead of returning fallback response
    // The tiered provider will handle appropriate error messaging
    throw error;
  }
}

// Analyze skill gap using Groq
export async function analyzeSkillGap(resumeText: string, jobDescText: string): Promise<{
  matchedSkills: string[],
  missingSkills: string[]
}> {
  const cacheKey = calculateHash(`groq_skillgap_${resumeText}_${jobDescText}`);
  const cached = getCachedResponse<{matchedSkills: string[], missingSkills: string[]}>(cacheKey);
  if (cached) return cached;

  const prompt = `Compare skills in this resume against job requirements and identify matches and gaps. Return a JSON object:

{
  "matchedSkills": ["skill1", "skill2"],
  "missingSkills": ["skill3", "skill4"]
}

Resume:
${resumeText}

Job Description:
${jobDescText}

Respond with only the JSON object, no additional text.`;

  try {
    const response = await callGroqAPI(prompt, MODELS.ANALYSIS);
    const result = JSON.parse(response);
    
    setCachedResponse(cacheKey, result);
    logger.info('Skill gap analysis completed successfully with Groq');
    return result;
  } catch (error) {
    logger.error('Error analyzing skill gap with Groq', error);
    
    // Re-throw the error instead of returning fallback response
    // The tiered provider will handle appropriate error messaging
    throw error;
  }
}

// Export usage statistics
export function getGroqUsage(): ApiUsage {
  return { ...apiUsage };
}

// Reset usage statistics
export function resetGroqUsage(): void {
  apiUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCost: 0
  };
  logger.info('Groq usage statistics reset');
}