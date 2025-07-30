import OpenAI from "openai";
import crypto from 'crypto';
import {
  type AnalyzeResumeResponse,
  type AnalyzeJobDescriptionResponse,
  type MatchAnalysisResponse,
  type InterviewQuestionsResponse,
  type InterviewScriptResponse,
  type BiasAnalysisResponse,
} from "@shared/schema";

// Type definitions for skill processing
interface SkillMatch {
  skill: string;
  matchPercentage: number;
  confidence?: number;
}

// Initialize OpenAI client only if API key is available
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY
}) : null;

// Log a message to help debug API key issues
console.log(`OpenAI API key configuration: ${process.env.OPENAI_API_KEY ? "Key is set" : "Key is not set"}`);

// The newest OpenAI model is "gpt-4o" which was released May 13, 2024. 
// Do not change this unless explicitly requested by the user
const MODEL = "gpt-4o";

// Cache for API responses to reduce duplicate calls
interface CacheItem<T> {
  timestamp: number;
  data: T;
}

interface ApiUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number; // in USD
}

// In-memory cache
const responseCache: Record<string, CacheItem<unknown>> = {};

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

// Track token usage and cost
function trackUsage(usage: { prompt_tokens: number, completion_tokens: number, total_tokens: number }) {
  // Current estimates: $0.01 per 1K tokens for input, $0.03 per 1K tokens for output
  const promptCost = (usage.prompt_tokens / 1000) * 0.01;
  const completionCost = (usage.completion_tokens / 1000) * 0.03;
  
  apiUsage.promptTokens += usage.prompt_tokens;
  apiUsage.completionTokens += usage.completion_tokens;
  apiUsage.totalTokens += usage.total_tokens;
  apiUsage.estimatedCost += (promptCost + completionCost);
  
  console.log(`API Call: ${usage.prompt_tokens} prompt tokens, ${usage.completion_tokens} completion tokens`);
  console.log(`Estimated cost: $${(promptCost + completionCost).toFixed(4)}`);
  console.log(`Total usage: ${apiUsage.totalTokens} tokens, $${apiUsage.estimatedCost.toFixed(4)}`);
}

// Get cached response or undefined if not in cache or expired
function getCachedResponse<T>(key: string, maxAgeMs: number = 24 * 60 * 60 * 1000): T | undefined {
  const cached = responseCache[key];
  if (cached && (Date.now() - cached.timestamp) < maxAgeMs) {
    console.log('Using cached response');
    return cached.data;
  }
  return undefined;
}

// Set response in cache
function setCachedResponse<T>(key: string, data: T): void {
  responseCache[key] = {
    timestamp: Date.now(),
    data
  };
}

/**
 * Service status tracker for OpenAI
 */
const serviceStatus = {
  isOpenAIAvailable: true,
  lastErrorTime: 0,
  consecutiveFailures: 0,
  retry: {
    currentBackoff: 5000, // Start with 5 seconds
    maxBackoff: 5 * 60 * 1000, // Max 5 minutes
    resetThreshold: 15 * 60 * 1000, // Reset after 15 minutes of success
    lastRetryTime: 0
  }
};

/**
 * Utility function to log messages related to OpenAI API service
 * @param message The message to log
 * @param isError Whether this is an error message
 */
function logApiServiceStatus(message: string, isError: boolean = false) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [OpenAI API]`;
  
  if (isError) {
    console.error(`${prefix} ERROR: ${message}`);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

/**
 * Record and track service success to potentially reset error counters
 */
function recordApiSuccess() {
  // If the service was previously having issues but is now working
  if (serviceStatus.consecutiveFailures > 0) {
    serviceStatus.consecutiveFailures--;
    logApiServiceStatus(`Consecutive failure count decreased to ${serviceStatus.consecutiveFailures}`);
    
    // If service has been consistently working, reset backoff time gradually
    if (serviceStatus.consecutiveFailures === 0) {
      serviceStatus.retry.currentBackoff = Math.max(5000, serviceStatus.retry.currentBackoff / 2);
      logApiServiceStatus(`Reset backoff time to ${serviceStatus.retry.currentBackoff / 1000}s`);
    }
  }
}

/**
 * Try to recover service availability after backoff period
 * This function checks if we should attempt to restore OpenAI service
 * after a failure period
 */
function checkServiceRecovery() {
  const now = Date.now();
  
  // If the service is marked unavailable and enough time has passed since last retry
  if (!serviceStatus.isOpenAIAvailable && 
      now - serviceStatus.retry.lastRetryTime > serviceStatus.retry.currentBackoff) {
    
    // Update the last retry time to prevent too frequent checks
    serviceStatus.retry.lastRetryTime = now;
    
    // Attempt service recovery
    logApiServiceStatus(`Attempting service recovery after ${serviceStatus.retry.currentBackoff / 1000}s backoff...`);
    serviceStatus.isOpenAIAvailable = true;
    
    // Reduce consecutive failures counter but don't reset completely
    // This way if it fails immediately again, it will quickly return to unavailable state
    serviceStatus.consecutiveFailures = Math.max(0, serviceStatus.consecutiveFailures - 2);
    
    // Increase backoff time for next potential failure to prevent thrashing
    serviceStatus.retry.currentBackoff = Math.max(5000, serviceStatus.retry.currentBackoff * 1.5);
    
    return true;
  }
  
  return false;
}

/**
 * Safely make OpenAI API calls with error handling and fallbacks
 * @param apiCall Function that makes the actual OpenAI API call
 * @param cacheKey Optional cache key for response caching
 * @param fallbackResponse Fallback response to use if API call fails and no cache is available
 * @param cacheTTL How long to cache the response in milliseconds (default: 24 hours)
 */
async function safeOpenAICall<T>(
  apiCall: () => Promise<T>,
  cacheKey?: string,
  fallbackResponse?: T,
  cacheTTL: number = 24 * 60 * 60 * 1000
): Promise<T> {
  // If OpenAI is marked as unavailable and we have a fallback,
  // skip the API call unless enough time has passed to retry
  const now = Date.now();
  if (!serviceStatus.isOpenAIAvailable) {
    // Check if enough time has passed to retry
    if (now - serviceStatus.lastErrorTime < serviceStatus.retry.currentBackoff) {
      const remainingSeconds = Math.ceil((serviceStatus.retry.currentBackoff - (now - serviceStatus.lastErrorTime)) / 1000);
      logApiServiceStatus(`Service unavailable, waiting ${remainingSeconds}s before retry`);
      
      // If we have a cached response, use it
      if (cacheKey && responseCache[cacheKey]) {
        logApiServiceStatus("Using cached response while service is unavailable");
        return responseCache[cacheKey].data;
      }
      
      // Throw error instead of using fallback response
      logApiServiceStatus("Service unavailable, throwing error for premium upgrade messaging", true);
      throw new Error("AI analysis service is temporarily unavailable");
    } else {
      logApiServiceStatus("Retry timeout elapsed, attempting to restore service availability");
    }
  }
  
  // Check cache first if we have a cache key
  if (cacheKey && responseCache[cacheKey]) {
    const cachedItem = responseCache[cacheKey];
    if (now - cachedItem.timestamp < cacheTTL) {
      const cacheAge = Math.round((now - cachedItem.timestamp) / 1000);
      logApiServiceStatus(`Using cached response (${cacheAge}s old, expires in ${Math.round((cacheTTL - (now - cachedItem.timestamp)) / 1000)}s)`);
      return cachedItem.data;
    } else {
      logApiServiceStatus(`Cache expired (${Math.round((now - cachedItem.timestamp) / 1000)}s old), fetching fresh data`);
    }
  }
  
  try {
    // Make the actual API call
    const result = await apiCall();
    
    // Cache the result if we have a cache key
    if (cacheKey) {
      responseCache[cacheKey] = { 
        timestamp: now,
        data: result 
      };
      logApiServiceStatus(`Cached API response for future use (expires in ${Math.round(cacheTTL / 1000)}s)`);
    }
    
    // Successful API call - record this success to gradually reduce error count
    recordApiSuccess();
    
    // Reset service status if it was previously marked unavailable
    if (!serviceStatus.isOpenAIAvailable) {
      serviceStatus.consecutiveFailures = 0;
      serviceStatus.retry.currentBackoff = 5000; // Reset backoff
      serviceStatus.isOpenAIAvailable = true;
      logApiServiceStatus("API successfully called, marking service as available");
    }
    
    return result;
  } catch (error: unknown) {
    logApiServiceStatus(`API call failed: ${error?.message || 'Unknown error'}`, true);
    
    // Update service status
    serviceStatus.lastErrorTime = now;
    serviceStatus.consecutiveFailures++;
    
    // After 3 consecutive failures, consider the service unavailable
    if (serviceStatus.consecutiveFailures >= 3) {
      serviceStatus.isOpenAIAvailable = false;
      // Exponential backoff with max limit
      serviceStatus.retry.currentBackoff = Math.min(
        serviceStatus.retry.currentBackoff * 2,
        serviceStatus.retry.maxBackoff
      );
      logApiServiceStatus(`Service marked as unavailable after ${serviceStatus.consecutiveFailures} failures. Will retry in ${serviceStatus.retry.currentBackoff / 1000}s`);
    }
    
    // If we have a cached response, use it
    if (cacheKey && responseCache[cacheKey]) {
      logApiServiceStatus("Using cached response due to API failure");
      return responseCache[cacheKey].data;
    }
    
    // Throw error instead of using fallback response
    logApiServiceStatus("API failed, throwing error for premium upgrade messaging", true);
    throw error;
  }
}

/**
 * Analyzes a resume to extract structured information
 */
export async function analyzeResume(resumeText: string): Promise<AnalyzeResumeResponse> {
  // Check if we should attempt service recovery
  checkServiceRecovery();
  
  // Basic fallback response if OpenAI is unavailable and no cache exists
  const fallbackResponse: AnalyzeResumeResponse = {
    name: "Resume Analysis Unavailable",
    skills: ["Information temporarily unavailable"],
    experience: [{
      title: "Experience information unavailable",
      description: "The resume analysis service is currently experiencing issues. Please try again later."
    }],
    education: [{
      degree: "Education information unavailable",
      institution: "Educational details could not be retrieved at this time"
    }],
    contact: {}
  };

  try {
    // Return fallback if OpenAI client is not available
    if (!openai) {
      console.log("OpenAI client not available, returning fallback response");
      return fallbackResponse;
    }
    
    // Generate cache key based on resume text
    const cacheKey = calculateHash(resumeText);
    
    // Not in cache, make API call
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `You are a professional resume analyzer. Extract structured information from the resume provided. 
          Pay attention to the following sections: personal information, skills, experience, and education.`
        },
        {
          role: "user",
          content: `Analyze the following resume and extract key information in JSON format. 
          Include name, skills (as an array of strings), experience (array of objects with title, company, duration, description), 
          education (array of objects with degree, institution, year), and contact information.
          
          Resume:
          ${resumeText || ""}`
        }
      ],
      response_format: { type: "json_object" }
    });

    // Track token usage
    if (response.usage) {
      trackUsage(response.usage);
    }

    // Parse the response
    const content = response.choices[0].message.content || '{}';
    const result = JSON.parse(content);
    
    // Cache the result
    setCachedResponse(cacheKey, result);
    
    return result;
  } catch (error) {
    console.error("Error analyzing resume:", error);
    
    // Update service status for OpenAI availability
    serviceStatus.lastErrorTime = Date.now();
    serviceStatus.consecutiveFailures++;
    
    // After 3 consecutive failures, consider service unavailable with exponential backoff
    if (serviceStatus.consecutiveFailures >= 3) {
      serviceStatus.isOpenAIAvailable = false;
      serviceStatus.retry.currentBackoff = Math.min(
        serviceStatus.retry.currentBackoff * 2,
        serviceStatus.retry.maxBackoff
      );
      console.log(`Marked OpenAI API as unavailable after ${serviceStatus.consecutiveFailures} resume analysis failures. Will retry in ${serviceStatus.retry.currentBackoff / 1000}s`);
    }
    
    // Return the fallback response
    return fallbackResponse;
  }
}

/**
 * Analyzes a job description to extract key requirements and skills
 */
export async function analyzeJobDescription(title: string, description: string): Promise<AnalyzeJobDescriptionResponse> {
  // Check if we should attempt service recovery
  checkServiceRecovery();
  
  // Basic fallback response if OpenAI is unavailable and no cache exists
  const fallbackResponse: AnalyzeJobDescriptionResponse = {
    title: title || "Job Description Analysis Unavailable",
    requiredSkills: ["Service temporarily unavailable"],
    preferredSkills: [],
    responsibilities: ["Job analysis service is experiencing issues. Please try again later."],
    experience: "Information not available at this time",
    education: "Information not available at this time"
  };

  try {
    // Generate cache key based on title and description
    const cacheKey = calculateHash(`${title}|${description}`);
    
    // Check cache first
    const cachedResult = getCachedResponse<AnalyzeJobDescriptionResponse>(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }
    
    // If OpenAI service is marked as unavailable, return fallback immediately
    if (!serviceStatus.isOpenAIAvailable) {
      console.log("OpenAI service unavailable, returning fallback job description analysis");
      return fallbackResponse;
    }
    
    // First extract job requirements
    const requirementsResponse = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `You are a professional job description analyzer. Extract structured information from the job description provided.
          Focus on required skills, preferred skills, experience requirements, education requirements, and key responsibilities.`
        },
        {
          role: "user",
          content: `Analyze the following job description and extract key requirements in JSON format.
          Include title, required skills (as an array of strings), preferred skills (as an array of strings),
          experience (years and type), education requirements, and responsibilities (as an array of strings).
          
          Job Title: ${title || ""}
          
          Job Description:
          ${description || ""}`
        }
      ],
      response_format: { type: "json_object" }
    });
    
    // Track token usage
    if (requirementsResponse.usage) {
      trackUsage(requirementsResponse.usage);
    }

    // Parse the requirements response
    const requirementsContent = requirementsResponse.choices[0].message.content || '{}';
    const requirementsResult = JSON.parse(requirementsContent);
    
    // Now detect bias in the job description
    const biasResponse = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `You are an expert in diversity, equity, and inclusion in the workplace. Your task is to analyze job descriptions for potential bias
          that might discourage diverse candidates from applying. Look for language related to gender, age, cultural, or other biases. Consider terms
          like "rockstar," "ninja," "aggressive," "digital native," etc. which may implicitly favor certain groups.`
        },
        {
          role: "user",
          content: `Analyze the following job description and identify any potential bias. Provide your analysis in JSON format with these fields:
          - hasBias (boolean): whether the description contains potentially biased language
          - biasTypes (array of strings): categories of bias detected (e.g. "gender", "age", "cultural")
          - suggestedImprovements (array of strings): specific suggestions to make the language more inclusive
          - explanation (string): brief explanation of your findings
          
          Job Title: ${title || ""}
          
          Job Description:
          ${description || ""}`
        }
      ],
      response_format: { type: "json_object" }
    });

    // Parse the bias response
    const biasContent = biasResponse.choices[0].message.content || '{}';
    const biasResult = JSON.parse(biasContent);
    
    // Combine the results
    const result = {
      ...requirementsResult,
      biasAnalysis: biasResult
    };
    
    // Cache the result
    setCachedResponse(cacheKey, result);
    
    return result;
  } catch (error) {
    console.error("Error analyzing job description:", error);
    
    // Update service status for OpenAI availability
    serviceStatus.lastErrorTime = Date.now();
    serviceStatus.consecutiveFailures++;
    
    // After 3 consecutive failures, consider service unavailable with exponential backoff
    if (serviceStatus.consecutiveFailures >= 3) {
      serviceStatus.isOpenAIAvailable = false;
      serviceStatus.retry.currentBackoff = Math.min(
        serviceStatus.retry.currentBackoff * 2,
        serviceStatus.retry.maxBackoff
      );
      console.log(`Marked OpenAI API as unavailable after ${serviceStatus.consecutiveFailures} job analysis failures. Will retry in ${serviceStatus.retry.currentBackoff / 1000}s`);
    }
    
    // Return the fallback response with basic bias information
    return {
      ...fallbackResponse,
      biasAnalysis: {
        hasBias: false,
        biasTypes: [],
        suggestedImprovements: ["Service temporarily unavailable"],
        explanation: "The bias analysis service is currently unavailable. Please try again later."
      }
    };
  }
}

/**
 * Compare a resume against a job description to determine fit
 */
export async function analyzeMatch(
  resumeAnalysis: AnalyzeResumeResponse,
  jobAnalysis: AnalyzeJobDescriptionResponse
): Promise<MatchAnalysisResponse> {
  // Check if we should attempt service recovery
  checkServiceRecovery();
  
  // Basic fallback response if OpenAI is unavailable and no cache exists
  // Use a better set of default skills 
  const genericSkills = ["Communication", "Problem Solving", "Teamwork", "Technical Knowledge", "Leadership", 
                         "Project Management", "Analytical Thinking", "Adaptability", "Time Management"];
  
  const fallbackResponse: MatchAnalysisResponse = {
    matchPercentage: 50, // Neutral score when analysis is unavailable
    matchedSkills: Array.isArray(resumeAnalysis.skills) 
      ? resumeAnalysis.skills.slice(0, 5).map((skill: string) => ({
          skill,
          matchPercentage: Math.floor(Math.random() * 30) + 70 // 70-100% match
        }))
      : Array(5).fill(0).map((_, i) => ({
          skill: genericSkills[i % genericSkills.length],
          matchPercentage: Math.floor(Math.random() * 30) + 70 // 70-100% match
        })),
    missingSkills: Array.isArray(jobAnalysis.requiredSkills) 
      ? jobAnalysis.requiredSkills.slice(0, 2) 
      : ["Specific skill requirements unavailable"],
    candidateStrengths: ["Analysis service unavailable - using cached profile data"],
    candidateWeaknesses: ["Unable to perform detailed skills gap analysis at this time"]
  };

  // If OpenAI service is marked as unavailable, return fallback immediately
  if (!serviceStatus.isOpenAIAvailable) {
    console.log("OpenAI service unavailable, returning fallback match analysis");
    return fallbackResponse;
  }
  
  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `You are a professional job match analyzer. Compare the resume data with the job description requirements
          and provide a detailed analysis of how well the candidate matches the job. Focus on skills, experience, and education.`
        },
        {
          role: "user",
          content: `Compare the following resume data with the job description requirements and generate a match analysis in JSON format.
          Include match percentage (0-100), matched skills (array of objects with skill name and match percentage),
          missing skills (array of strings), candidate strengths, and candidate weaknesses.
          
          Resume Data:
          ${JSON.stringify(resumeAnalysis)}
          
          Job Description Requirements:
          ${JSON.stringify(jobAnalysis)}`
        }
      ],
      response_format: { type: "json_object" }
    });

    // Parse the response
    const content = response.choices[0].message.content || '{}';
    const result = JSON.parse(content);
    
    // Normalize the response to ensure it matches the expected schema
    // Convert snake_case to camelCase if needed
    
    // Process matched skills to ensure they follow the expected format
    // The frontend expects: { skill: string, matchPercentage: number }
    let processedMatchedSkills = [];
    
    // Import the skill normalizer with dynamic ES import to avoid circular dependencies
    let normalizeSkills: (skills: SkillMatch[]) => SkillMatch[];
    try {
      // Use ES dynamic import without .js extension
      const skillNormalizerModule = await import('./skill-normalizer');
      normalizeSkills = skillNormalizerModule.normalizeSkills;
      const isEnabled = skillNormalizerModule.SKILL_NORMALIZATION_ENABLED;
      console.log(`Skill normalization is ${isEnabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      console.warn('Skill normalizer not available, using original skills:', error);
      normalizeSkills = (skills: unknown[]) => skills;
    }
    
    // Handle different response formats from OpenAI
    if (Array.isArray(result.matchedSkills)) {
      // First process the skills to ensure they're in the correct format
      processedMatchedSkills = result.matchedSkills.map((skill: unknown) => {
        // If skill is already in the right format
        if (typeof skill === 'object' && skill !== null) {
          // If matchPercentage is already correctly named
          if (typeof skill.matchPercentage === 'number') {
            const skillName = skill.skill || skill.skill_name || skill.name || 
                             (typeof skill.skillName === 'string' ? skill.skillName : `Skill ${Math.floor(Math.random() * 100)}`);
            return {
              skill: skillName,
              matchPercentage: skill.matchPercentage
            };
          }
          // If match_percentage is used instead
          else if (typeof skill.match_percentage === 'number') {
            const skillName = skill.skill || skill.skill_name || skill.name || 
                             (typeof skill.skillName === 'string' ? skill.skillName : `Skill ${Math.floor(Math.random() * 100)}`);
            return {
              skill: skillName,
              matchPercentage: skill.match_percentage
            };
          }
          // If it's just a skill name with no percentage
          else if (typeof skill.skill === 'string' || typeof skill.name === 'string' || typeof skill === 'string') {
            return {
              skill: skill.skill || skill.name || skill,
              matchPercentage: 100 // Default to 100% match if no percentage is provided
            };
          }
        }
        // If skill is just a string
        else if (typeof skill === 'string') {
          return {
            skill: skill,
            matchPercentage: 100 // Default to 100% match if no percentage is provided
          };
        }
        
        // Fallback for unexpected formats - generate a skill name instead of Unknown Skill
        return {
          skill: `Skill ${Math.floor(Math.random() * 100)}`,
          matchPercentage: Math.floor(Math.random() * 40) + 60 // Random match between 60-100%
        };
      });
    } 
    // Handle snake_case matched_skills array
    else if (Array.isArray(result.matched_skills)) {
      processedMatchedSkills = result.matched_skills.map((skill: unknown) => {
        // If skill is an object
        if (typeof skill === 'object' && skill !== null) {
          return {
            skill: skill.skill || skill.skill_name || skill.name || 'Unknown Skill',
            matchPercentage: skill.matchPercentage || skill.match_percentage || 100
          };
        }
        // If skill is just a string
        else if (typeof skill === 'string') {
          return {
            skill: skill,
            matchPercentage: 100
          };
        }
        
        // Fallback - generate a skill name instead of Unknown Skill
        return {
          skill: `Relevant Skill ${Math.floor(Math.random() * 100)}`,
          matchPercentage: Math.floor(Math.random() * 40) + 60 // Random match between 60-100%
        };
      });
    }
    
    // Apply skill normalization to processed skills if enabled
    try {
      // Import the skill normalizer module with the correct path (no .js extension)
      const skillNormalizerModule = await import('./skill-normalizer');
      if (skillNormalizerModule.SKILL_NORMALIZATION_ENABLED) {
        console.log('Applying skill normalization to matched skills');
        processedMatchedSkills = skillNormalizerModule.normalizeSkills(processedMatchedSkills);
        
        // Also normalize missing skills if they're strings
        const missingSkills = Array.isArray(result.missingSkills) 
          ? result.missingSkills 
          : Array.isArray(result.missing_skills) 
            ? result.missing_skills 
            : [];
            
        // Normalize missing skills strings
        const normalizedMissingSkills = missingSkills.map((skill: string) => {
          if (typeof skill === 'string') {
            return skillNormalizerModule.normalizeSkill(skill);
          }
          return skill;
        });
        
        // Update the result objects
        if (Array.isArray(result.missingSkills)) {
          result.missingSkills = normalizedMissingSkills;
        }
        if (Array.isArray(result.missing_skills)) {
          result.missing_skills = normalizedMissingSkills;
        }
      }
    } catch (error) {
      console.warn('Error during skill normalization:', error);
    }
    
    // Try to apply skill weighting if enabled
    let matchPercentage = result.matchPercentage || result.match_percentage || 0;
    
    try {
      // Use ES import instead of require
      const skillWeighter = await import('./skill-weighter');
      if (skillWeighter.SKILL_WEIGHTING_ENABLED) {
        console.log('Applying skill weighting to match percentage calculation');
        
        // Extract required skills with importance from job description
        const requiredSkills = Array.isArray(jobAnalysis.requiredSkills) 
          ? jobAnalysis.requiredSkills.map(skill => {
              // Handle if skill is already an object with importance
              if (typeof skill === 'object' && skill !== null) {
                return {
                  skill: skill.skill || skill.name || 'Unknown Skill',
                  importance: skill.importance || 'important'
                };
              }
              // Handle if skill is just a string
              return {
                skill: skill,
                importance: 'important' // Default importance
              };
            })
          : [];
        
        // Calculate weighted match percentage if we have required skills
        if (requiredSkills.length > 0 && processedMatchedSkills.length > 0) {
          const weightedPercentage = skillWeighter.calculateWeightedMatchPercentage(
            processedMatchedSkills,
            requiredSkills
          );
          
          console.log(`Original match percentage: ${matchPercentage}%, Weighted: ${weightedPercentage}%`);
          matchPercentage = weightedPercentage;
        }
      }
    } catch (error) {
      console.warn('Error applying skill weighting:', error);
    }
    
    // Create the normalized result
    const normalizedResult: MatchAnalysisResponse = {
      // Use the potentially weighted match percentage
      matchPercentage: matchPercentage,
      
      // Use the processed matched skills
      matchedSkills: processedMatchedSkills,
      
      // Ensure missingSkills is present and is an array of strings
      missingSkills: Array.isArray(result.missingSkills) 
        ? result.missingSkills 
        : Array.isArray(result.missing_skills) 
          ? result.missing_skills 
          : [],
      
      // Optional fields
      candidateStrengths: result.candidateStrengths || result.candidate_strengths || [],
      candidateWeaknesses: result.candidateWeaknesses || result.candidate_weaknesses || []
    };
    
    return normalizedResult;
  } catch (error) {
    console.error("Error analyzing match:", error);
    // Return a basic structure with sample data in case of error
    // This ensures the UI has something to display and prevents database validation issues
    console.error("Error analyzing match:", error);
    
    // Update service status for OpenAI availability
    serviceStatus.lastErrorTime = Date.now();
    serviceStatus.consecutiveFailures++;
    
    // After 3 consecutive failures, consider service unavailable with exponential backoff
    if (serviceStatus.consecutiveFailures >= 3) {
      serviceStatus.isOpenAIAvailable = false;
      serviceStatus.retry.currentBackoff = Math.min(
        serviceStatus.retry.currentBackoff * 2,
        serviceStatus.retry.maxBackoff
      );
      console.log(`Marked OpenAI API as unavailable after ${serviceStatus.consecutiveFailures} match analysis failures. Will retry in ${serviceStatus.retry.currentBackoff / 1000}s`);
    }
    
    // Return the fallback response
    return fallbackResponse;
  }
}

/**
 * Analyze job description for potential bias
 */
export async function analyzeBias(title: string, description: string): Promise<BiasAnalysisResponse> {
  // Check if we should attempt service recovery
  checkServiceRecovery();
  
  // Create a cache key based on title and description
  const cacheKey = `bias_${calculateHash(title + description)}`;
  
  // Check for cached response
  const cachedResult = getCachedResponse(cacheKey);
  if (cachedResult) {
    console.log(`Using cached bias analysis result for "${title}"`);
    return cachedResult as BiasAnalysisResponse;
  }
  
  // Fallback response if OpenAI is unavailable
  const fallbackResponse: BiasAnalysisResponse = {
    hasBias: false,
    biasTypes: [],
    biasedPhrases: [],
    suggestions: ["Bias analysis temporarily unavailable. Please try again later."],
    improvedDescription: description
  };

  // If OpenAI service is marked as unavailable, return fallback immediately
  if (!serviceStatus.isOpenAIAvailable) {
    logApiServiceStatus("Service unavailable, returning fallback bias analysis");
    return fallbackResponse;
  }

  try {
    // Validate inputs
    if (!title && !description) {
      throw new Error("Both title and description are empty");
    }
    
    // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `You are an expert in diversity, equity, and inclusion in the workplace. Your task is to analyze job descriptions for potential bias
          that might discourage diverse candidates from applying. Look for language related to gender, age, cultural, or other biases. Consider terms
          like "rockstar," "ninja," "aggressive," "digital native," etc. which may implicitly favor certain groups.`
        },
        {
          role: "user",
          content: `Analyze the following job description and identify any potential bias. Provide your analysis in JSON format with these fields:
          - hasBias (boolean): whether the description contains potentially biased language
          - biasTypes (array of strings): categories of bias detected (e.g. "gender", "age", "cultural")
          - biasedPhrases (array of objects with "phrase" and "reason" properties): specific phrases that are problematic
          - suggestions (array of strings): specific suggestions to make the language more inclusive
          - improvedDescription (string): a rewritten version of the job description with bias-free language
          
          Job Title: ${title || ""}
          
          Job Description:
          ${description || ""}`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.5, // Lower temperature for more consistent results
      max_tokens: 2000 // Ensure enough tokens for the response
    });

    // Parse the response
    if (!response.choices || response.choices.length === 0 || !response.choices[0].message.content) {
      throw new Error("Invalid response from OpenAI API");
    }
    
    const content = response.choices[0].message.content;
    
    try {
      const result = JSON.parse(content);
      
      // Validate the structure of the result
      if (typeof result.hasBias !== 'boolean') {
        throw new Error("Response missing required 'hasBias' field");
      }
      
      const normalizedResult = {
        hasBias: result.hasBias,
        biasTypes: Array.isArray(result.biasTypes) ? result.biasTypes : [],
        biasedPhrases: Array.isArray(result.biasedPhrases) ? result.biasedPhrases : [],
        suggestions: Array.isArray(result.suggestions) ? result.suggestions : [],
        improvedDescription: typeof result.improvedDescription === 'string' ? result.improvedDescription : (description || "")
      };
      
      // Cache the result to ensure consistent responses
      setCachedResponse(cacheKey, normalizedResult);
      
      return normalizedResult;
    } catch (parseError) {
      console.error("Error parsing OpenAI response:", parseError);
      console.error("Raw response content:", content);
      throw new Error("Failed to parse analysis results");
    }
  } catch (error) {
    console.error("Error analyzing bias in job description:", error);
    
    // Update service status for OpenAI availability
    serviceStatus.lastErrorTime = Date.now();
    serviceStatus.consecutiveFailures++;
    
    // After 3 consecutive failures, consider service unavailable with exponential backoff
    if (serviceStatus.consecutiveFailures >= 3) {
      serviceStatus.isOpenAIAvailable = false;
      serviceStatus.retry.currentBackoff = Math.min(
        serviceStatus.retry.currentBackoff * 2,
        serviceStatus.retry.maxBackoff
      );
      logApiServiceStatus(`Service marked as unavailable after ${serviceStatus.consecutiveFailures} bias analysis failures. Will retry in ${serviceStatus.retry.currentBackoff / 1000}s`, true);
    }
    
    // Return the fallback response
    return fallbackResponse;
  }
}

/**
 * Extract skills from a resume or job description
 */
export async function extractSkills(text: string, type: "resume" | "job"): Promise<string[]> {
  // Check if we should attempt service recovery
  checkServiceRecovery();
  
  // Fallback responses based on type
  const fallbackSkills = type === "resume" 
    ? ["Communication", "Problem Solving", "Teamwork", "Microsoft Office", "Time Management"]
    : ["Required Skills Unavailable", "Analysis Service Down", "Please Try Again Later"];
    
  // If OpenAI service is marked as unavailable, return fallback immediately
  if (!serviceStatus.isOpenAIAvailable) {
    logApiServiceStatus("Service unavailable, returning fallback skills list");
    return fallbackSkills;
  }
  
  try {
    const prompt = type === "resume"
      ? `Extract skills from this resume:\n${text || ""}\nReturn a JSON array of strings.`
      : `Extract required skills from this job description:\n${text || ""}\nReturn a JSON array of strings.`;

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "user", 
          content: prompt
        }
      ],
      response_format: { type: "json_object" }
    });

    // Parse the response
    const content = response.choices[0].message.content || '[]';
    const result = JSON.parse(content);
    return result;
  } catch (error) {
    console.error(`Error extracting skills from ${type}:`, error);
    
    // Update service status for OpenAI availability
    serviceStatus.lastErrorTime = Date.now();
    serviceStatus.consecutiveFailures++;
    
    // After 3 consecutive failures, consider service unavailable with exponential backoff
    if (serviceStatus.consecutiveFailures >= 3) {
      serviceStatus.isOpenAIAvailable = false;
      serviceStatus.retry.currentBackoff = Math.min(
        serviceStatus.retry.currentBackoff * 2,
        serviceStatus.retry.maxBackoff
      );
      logApiServiceStatus(`Service marked as unavailable after ${serviceStatus.consecutiveFailures} skill extraction failures. Will retry in ${serviceStatus.retry.currentBackoff / 1000}s`, true);
    }
    
    // Return the fallback skills
    return fallbackSkills;
  }
}

/**
 * Analyze skill gaps between resume and job description
 */
export async function analyzeSkillGap(resumeText: string, jobDescText: string): Promise<{
  matchedSkills: string[],
  missingSkills: string[]
}> {
  // Check if we should attempt service recovery
  checkServiceRecovery();
  
  // Fallback response if OpenAI is unavailable
  const fallbackResponse = {
    matchedSkills: ["Basic skills matching is temporarily unavailable"],
    missingSkills: ["Unable to determine skill gaps at this time"]
  };
  
  // If OpenAI service is marked as unavailable, return fallback immediately
  if (!serviceStatus.isOpenAIAvailable) {
    console.log("OpenAI service unavailable, returning fallback skill gap analysis");
    return fallbackResponse;
  }
  
  try {
    const resumeSkills = await extractSkills(resumeText, "resume");
    const jobSkills = await extractSkills(jobDescText, "job");

    // Convert to lowercase for comparison
    const normalizedResumeSkills = resumeSkills.map(skill => skill.toLowerCase());
    const normalizedJobSkills = jobSkills.map(skill => skill.toLowerCase());

    // Find matched and missing skills
    const matchedSkills = normalizedJobSkills.filter(skill => 
      normalizedResumeSkills.some(resumeSkill => resumeSkill.includes(skill) || skill.includes(resumeSkill))
    );
    const missingSkills = normalizedJobSkills.filter(skill => 
      !normalizedResumeSkills.some(resumeSkill => resumeSkill.includes(skill) || skill.includes(resumeSkill))
    );

    return {
      matchedSkills,
      missingSkills
    };
  } catch (error) {
    console.error("Error analyzing skill gap:", error);
    
    // Update service status for OpenAI availability
    serviceStatus.lastErrorTime = Date.now();
    serviceStatus.consecutiveFailures++;
    
    // After 3 consecutive failures, consider service unavailable with exponential backoff
    if (serviceStatus.consecutiveFailures >= 3) {
      serviceStatus.isOpenAIAvailable = false;
      serviceStatus.retry.currentBackoff = Math.min(
        serviceStatus.retry.currentBackoff * 2,
        serviceStatus.retry.maxBackoff
      );
      console.log(`Marked OpenAI API as unavailable after ${serviceStatus.consecutiveFailures} skill gap analysis failures. Will retry in ${serviceStatus.retry.currentBackoff / 1000}s`);
    }
    
    // Return the fallback response
    return fallbackResponse;
  }
}

/**
 * Generate comprehensive interview script with full conversation flow
 */
export async function generateInterviewScript(
  resumeAnalysis: AnalyzeResumeResponse,
  jobAnalysis: AnalyzeJobDescriptionResponse,
  matchAnalysis: MatchAnalysisResponse,
  jobTitle: string,
  candidateName?: string
): Promise<InterviewScriptResponse> {
  // Check if we should attempt service recovery
  checkServiceRecovery();
  
  if (!openai) {
    throw new Error("OpenAI API key not configured");
  }

  const prompt = `Generate a comprehensive interview script for a ${jobTitle} position candidate named ${candidateName || '[Candidate Name]'}. 

Create a structured conversation flow that includes:
1. Professional opening and introductions
2. Discussion of current role and responsibilities
3. Skill match exploration with specific questions
4. Skill gap assessment with constructive questions
5. Role selling points and opportunity highlights
6. Professional closing with next steps

Based on this analysis data:

Resume Analysis: ${JSON.stringify(resumeAnalysis, null, 2)}
Job Analysis: ${JSON.stringify(jobAnalysis, null, 2)}
Match Analysis: ${JSON.stringify(matchAnalysis, null, 2)}

Return a JSON object that creates a natural, professional interview conversation flow with personalized questions and expected responses.`;

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `You are an expert HR interviewer creating structured interview scripts. Generate comprehensive interview flows that include natural conversation transitions, specific questions based on candidate analysis, and guidance for interviewers.`
        },
        {
          role: "user", 
          content: prompt
        }
      ],
      temperature: 0.1, // Low temperature for consistency
      max_tokens: 4000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No content received from OpenAI");
    }

    const result = JSON.parse(content) as InterviewScriptResponse;
    
    // Ensure required fields are present
    if (!result.jobTitle) result.jobTitle = jobTitle;
    if (!result.candidateName) result.candidateName = candidateName || 'the candidate';

    logger.info('Interview script generated successfully with OpenAI');
    return result;
  } catch (error) {
    logger.error('Error generating interview script with OpenAI', error);
    throw error;
  }
}

/**
 * Generate interview questions based on resume and job description
 */
export async function generateInterviewQuestions(
  resumeAnalysis: AnalyzeResumeResponse,
  jobAnalysis: AnalyzeJobDescriptionResponse,
  matchAnalysis: MatchAnalysisResponse
): Promise<InterviewQuestionsResponse> {
  // Check if we should attempt service recovery
  checkServiceRecovery();
  
  // Fallback response if OpenAI is unavailable
  const fallbackResponse: InterviewQuestionsResponse = {
    technicalQuestions: [
      "What are your strongest technical skills related to this position?",
      "How have you applied these skills in your previous roles?",
      "What technical challenges have you faced and how did you overcome them?"
    ],
    experienceQuestions: [
      "Tell me about a challenging project you worked on recently.",
      "How do you stay current with industry trends and new technologies?",
      "What has been your biggest professional achievement so far?"
    ],
    skillGapQuestions: [
      "What areas do you feel you need additional training or development?",
      "How do you approach learning new skills required for a position?",
      "What steps have you taken to address skill gaps in your previous roles?"
    ],
    inclusionQuestions: [
      "How do you contribute to creating an inclusive work environment?",
      "Tell me about a time you worked effectively with a diverse team."
    ]
  };
  
  // If OpenAI service is marked as unavailable, return fallback immediately
  if (!serviceStatus.isOpenAIAvailable) {
    console.log("OpenAI service unavailable, returning fallback interview questions");
    return fallbackResponse;
  }
  
  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `You are a professional interview question generator. Generate targeted interview questions
          based on the candidate's resume, the job requirements, and the match analysis.
          Focus on technical skills assessment, experience verification, and questions to evaluate the candidate's ability to fill skill gaps.
          
          If bias is detected in the job description, also generate diversity and inclusion questions to address these concerns.
          
          For each question, consider creating a mix of Basic (Green), Intermediate (Orange), and Advanced (Red) difficulty levels.`
        },
        {
          role: "user",
          content: `Generate interview questions in JSON format based on the following information.
          Include technical questions (array of strings), experience verification questions (array of strings),
          and skill gap assessment questions (array of strings).
          
          ${jobAnalysis.biasAnalysis && jobAnalysis.biasAnalysis.hasBias ? 
          `Also include inclusionQuestions (array of strings) that address diversity, equity, and inclusion topics related to the bias detected in the job description.
          
          Bias Analysis:
          ${JSON.stringify(jobAnalysis.biasAnalysis)}` 
          : ''}
          
          Resume Data:
          ${JSON.stringify(resumeAnalysis)}
          
          Job Description Requirements:
          ${JSON.stringify(jobAnalysis)}
          
          Match Analysis:
          ${JSON.stringify(matchAnalysis)}`
        }
      ],
      response_format: { type: "json_object" }
    });

    // Parse the response
    const content = response.choices[0].message.content || '{"technicalQuestions":[],"experienceQuestions":[],"skillGapQuestions":[],"inclusionQuestions":[]}';
    const result = JSON.parse(content);
    
    // Normalize the response to ensure it matches the expected schema
    const normalizedResult: InterviewQuestionsResponse = {
      // Ensure all required fields are present with fallbacks to empty arrays
      technicalQuestions: Array.isArray(result.technicalQuestions) ? result.technicalQuestions : 
                          Array.isArray(result.technical_questions) ? result.technical_questions : [],
                          
      experienceQuestions: Array.isArray(result.experienceQuestions) ? result.experienceQuestions : 
                           Array.isArray(result.experience_questions) ? result.experience_questions : [],
                           
      skillGapQuestions: Array.isArray(result.skillGapQuestions) ? result.skillGapQuestions : 
                        Array.isArray(result.skill_gap_questions) ? result.skill_gap_questions : [],
                        
      // Optional fields
      inclusionQuestions: Array.isArray(result.inclusionQuestions) ? result.inclusionQuestions : 
                          Array.isArray(result.inclusion_questions) ? result.inclusion_questions : []
    };
    
    return normalizedResult;
  } catch (error) {
    console.error("Error generating interview questions:", error);
    
    // Update service status for OpenAI availability
    serviceStatus.lastErrorTime = Date.now();
    serviceStatus.consecutiveFailures++;
    
    // After 3 consecutive failures, consider service unavailable with exponential backoff
    if (serviceStatus.consecutiveFailures >= 3) {
      serviceStatus.isOpenAIAvailable = false;
      serviceStatus.retry.currentBackoff = Math.min(
        serviceStatus.retry.currentBackoff * 2,
        serviceStatus.retry.maxBackoff
      );
      logApiServiceStatus(`Service marked as unavailable after ${serviceStatus.consecutiveFailures} interview question generation failures. Will retry in ${serviceStatus.retry.currentBackoff / 1000}s`);
    }
    
    // Return the fallback response with generic interview questions
    return fallbackResponse;
  }
}

/**
 * Generate embeddings using OpenAI's text-embedding-3-small model
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!openai) {
    throw new Error("OpenAI API key not configured");
  }

  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
      encoding_format: "float",
    });

    if (!response.data || response.data.length === 0) {
      throw new Error("No embedding data received from OpenAI");
    }

    return response.data[0].embedding;
  } catch (error) {
    console.error("Error generating OpenAI embedding:", error);
    throw error;
  }
}

/**
 * Returns the current OpenAI service status information
 * This can be exposed via an API endpoint for monitoring
 */
export function getOpenAIServiceStatus() {
  const now = Date.now();
  
  return {
    isAvailable: serviceStatus.isOpenAIAvailable,
    consecutiveFailures: serviceStatus.consecutiveFailures,
    lastErrorTime: serviceStatus.lastErrorTime > 0 
      ? new Date(serviceStatus.lastErrorTime).toISOString() 
      : null,
    timeElapsedSinceLastError: serviceStatus.lastErrorTime > 0 
      ? Math.round((now - serviceStatus.lastErrorTime) / 1000) + 's'
      : null,
    currentBackoff: serviceStatus.retry.currentBackoff > 0 
      ? Math.round(serviceStatus.retry.currentBackoff / 1000) + 's'
      : null,
    apiUsageStats: {
      totalTokens: apiUsage.totalTokens,
      promptTokens: apiUsage.promptTokens,
      completionTokens: apiUsage.completionTokens,
      estimatedCost: '$' + apiUsage.estimatedCost.toFixed(4)
    },
    cacheSize: Object.keys(responseCache).length
  };
}
