import { AnalyzeResumeResponse, MatchAnalysisResponse } from '@shared/schema';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import Groq from 'groq-sdk';
import { config } from '../config';

/**
 * Result of fairness analysis on resume analysis
 */
export interface FairnessAnalysisResult {
  biasConfidenceScore: number; // 0-100 score indicating confidence that analysis is unbiased
  potentialBiasAreas: string[];
  fairnessAssessment: string;
}

// Configure API clients if keys are available
const groqClient = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;
const openaiClient = config.openaiApiKey ? new OpenAI({ apiKey: config.openaiApiKey }) : null;
const anthropicClient = config.anthropicApiKey ? new Anthropic({ apiKey: config.anthropicApiKey }) : null;

// Constants for model names
const GROQ_MODEL = "llama-3.3-70b-versatile"; // Fast and cost-effective for fairness analysis
const OPENAI_MODEL = "gpt-4o"; // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
const ANTHROPIC_MODEL = "claude-3-7-sonnet-20250219"; // the newest Anthropic model is "claude-3-7-sonnet-20250219" which was released February 24, 2025

/**
 * Analyze the fairness of resume analysis results
 * Returns metrics indicating potential bias in the AI analysis
 */
export async function analyzeResumeFairness(
  resumeText: string,
  resumeAnalysis: AnalyzeResumeResponse,
  matchAnalysis: MatchAnalysisResponse
): Promise<FairnessAnalysisResult> {
  // Try Groq first (primary provider - fast and cost-effective)
  if (groqClient) {
    try {
      console.log("[FAIRNESS_ANALYZER] Attempting to analyze fairness with Groq");
      return await analyzeWithGroq(resumeText, resumeAnalysis, matchAnalysis);
    } catch (error) {
      console.error("[FAIRNESS_ANALYZER] Error analyzing fairness with Groq:", error);
      // Fall through to OpenAI
    }
  } else {
    console.log("[FAIRNESS_ANALYZER] Groq API not configured");
  }
  
  // If Groq fails or is not available, try OpenAI
  if (openaiClient) {
    try {
      console.log("[FAIRNESS_ANALYZER] Attempting to analyze fairness with OpenAI");
      return await analyzeWithOpenAI(resumeText, resumeAnalysis, matchAnalysis);
    } catch (error) {
      console.error("[FAIRNESS_ANALYZER] Error analyzing fairness with OpenAI:", error);
      // Fall through to Anthropic
    }
  } else {
    console.log("[FAIRNESS_ANALYZER] OpenAI API not configured");
  }
  
  // If OpenAI fails or is not available, try Anthropic
  if (anthropicClient) {
    try {
      console.log("[FAIRNESS_ANALYZER] Attempting to analyze fairness with Anthropic");
      return await analyzeWithAnthropic(resumeText, resumeAnalysis, matchAnalysis);
    } catch (error) {
      console.error("[FAIRNESS_ANALYZER] Error analyzing fairness with Anthropic:", error);
      // Fall through to default response
    }
  } else {
    console.log("[FAIRNESS_ANALYZER] Anthropic API not configured");
  }
  
  // If all providers fail or are not available, return a default response
  console.log("[FAIRNESS_ANALYZER] All AI providers unavailable, using built-in fallback");
  return getDefaultFairnessAnalysis();
}

/**
 * Analyze resume fairness using Groq
 */
async function analyzeWithGroq(
  resumeText: string,
  resumeAnalysis: AnalyzeResumeResponse,
  matchAnalysis: MatchAnalysisResponse
): Promise<FairnessAnalysisResult> {
  if (!groqClient) {
    throw new Error("Groq API not configured");
  }

  const prompt = `You are an AI fairness auditor. Analyze the resume and its AI analysis provided below, and assess the likelihood of algorithmic bias in the analysis.

RESUME TEXT:
${resumeText}

AI ANALYSIS RESULTS:
- Skills identified: ${resumeAnalysis.skills?.join(', ') || 'None'}
- Experience identified: ${resumeAnalysis.experience || 'Not specified'}
- Match percentage: ${matchAnalysis.matchPercentage || 0}%
- Matched skills: ${matchAnalysis.matchedSkills?.map(s => s?.skill || '').filter(Boolean).join(', ') || 'None'}
- Missing skills: ${matchAnalysis.missingSkills?.join(', ') || 'None'}
- Candidate strengths: ${matchAnalysis.candidateStrengths?.join(', ') || 'None identified'}
- Candidate weaknesses: ${matchAnalysis.candidateWeaknesses?.join(', ') || 'None identified'}

Provide a fairness assessment with the following:
1. A confidence score (0-100) indicating how confident you are that the analysis is FREE FROM BIAS (100 = completely unbiased, 0 = extremely biased)
2. Any potential areas of bias in the analysis (e.g., gender bias, age bias, name bias, etc.)
3. A brief fairness assessment explaining your reasoning

Respond ONLY with valid JSON in this exact format:
{
  "biasConfidenceScore": 85,
  "potentialBiasAreas": ["area1", "area2"],
  "fairnessAssessment": "Explanation of your assessment"
}`;

  const response = await groqClient.chat.completions.create({
    model: GROQ_MODEL,
    messages: [{
      role: "user",
      content: prompt
    }],
    temperature: 0.1, // Low temperature for consistent results
    max_tokens: 1000
  });

  // Extract and parse the JSON response
  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Empty response from Groq");
  }
  
  // Clean the response (remove any markdown formatting)
  const cleanedContent = content
    .replace(/```json\s*/g, '')
    .replace(/```\s*/g, '')
    .trim();
  
  let parsedResponse;
  try {
    parsedResponse = JSON.parse(cleanedContent);
  } catch (parseError) {
    // Try to extract JSON from the response if direct parsing fails
    const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsedResponse = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error(`Failed to parse Groq response: ${parseError}`);
    }
  }
  
  // Track token usage if available
  if (response.usage) {
    console.log(`Groq Fairness Analysis: ${response.usage.prompt_tokens} prompt tokens, ${response.usage.completion_tokens} completion tokens, ${response.usage.total_tokens} total tokens`);
  }
  
  // Normalize and validate the response
  return {
    biasConfidenceScore: typeof parsedResponse.biasConfidenceScore === 'number' ? 
      Math.max(0, Math.min(100, parsedResponse.biasConfidenceScore)) : 50, // Ensure 0-100 range
    potentialBiasAreas: Array.isArray(parsedResponse.potentialBiasAreas) ? 
      parsedResponse.potentialBiasAreas.slice(0, 5) : [], // Limit to 5 areas
    fairnessAssessment: typeof parsedResponse.fairnessAssessment === 'string' ? 
      parsedResponse.fairnessAssessment.substring(0, 500) : "Unable to provide a detailed fairness assessment."
  };
}

/**
 * Analyze resume fairness using OpenAI
 */
async function analyzeWithOpenAI(
  resumeText: string,
  resumeAnalysis: AnalyzeResumeResponse,
  matchAnalysis: MatchAnalysisResponse
): Promise<FairnessAnalysisResult> {
  if (!openaiClient) {
    throw new Error("OpenAI API not configured");
  }

  const prompt = `You are an AI fairness auditor. Analyze the resume and its AI analysis provided below, and assess the likelihood of algorithmic bias in the analysis.

RESUME TEXT:
${resumeText}

AI ANALYSIS RESULTS:
- Name: ${resumeAnalysis.name || 'Not specified'}
- Skills identified: ${resumeAnalysis.skills?.join(', ') || 'None'}
- Experience identified: ${resumeAnalysis.experience?.map(exp => `${exp?.title || exp?.position || 'Position'} at ${exp?.company || 'Company'}`).join('; ') || 'Not specified'}
- Match percentage: ${matchAnalysis.matchPercentage || 0}%
- Matched skills: ${matchAnalysis.matchedSkills?.map(s => s?.skill || '').filter(Boolean).join(', ') || 'None'}
- Missing skills: ${matchAnalysis.missingSkills?.join(', ') || 'None'}
- Candidate strengths: ${matchAnalysis.candidateStrengths?.join(', ') || 'None identified'}
- Candidate weaknesses: ${matchAnalysis.candidateWeaknesses?.join(', ') || 'None identified'}

Provide a fairness assessment with the following:
1. A confidence score (0-100) indicating how confident you are that the analysis is FREE FROM BIAS (100 = completely unbiased, 0 = extremely biased)
2. Any potential areas of bias in the analysis (e.g., gender bias, age bias, etc.)
3. A brief fairness assessment explaining your reasoning

Respond in JSON format:
{
  "biasConfidenceScore": 85,
  "potentialBiasAreas": ["area1", "area2"],
  "fairnessAssessment": "Explanation of your assessment"
}`;

  const response = await openaiClient.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [{
      role: "user",
      content: prompt
    }],
    response_format: { type: "json_object" },
    temperature: 0.3
  });

  // Extract and parse the JSON response
  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Empty response from OpenAI");
  }
  
  const parsedResponse = JSON.parse(content);
  
  // Track token usage
  if (response.usage) {
    console.log(`OpenAI API Call: ${response.usage.prompt_tokens} prompt tokens, ${response.usage.completion_tokens} completion tokens, ${response.usage.total_tokens} total tokens`);
  }
  
  // Normalize the response
  return {
    biasConfidenceScore: typeof parsedResponse.biasConfidenceScore === 'number' ? 
      parsedResponse.biasConfidenceScore : 50, // Default to 50 if missing
    potentialBiasAreas: Array.isArray(parsedResponse.potentialBiasAreas) ? 
      parsedResponse.potentialBiasAreas : [],
    fairnessAssessment: typeof parsedResponse.fairnessAssessment === 'string' ? 
      parsedResponse.fairnessAssessment : "Unable to provide a detailed fairness assessment."
  };
}

/**
 * Analyze resume fairness using Anthropic Claude
 */
async function analyzeWithAnthropic(
  resumeText: string,
  resumeAnalysis: AnalyzeResumeResponse,
  matchAnalysis: MatchAnalysisResponse
): Promise<FairnessAnalysisResult> {
  if (!anthropicClient) {
    throw new Error("Anthropic API not configured");
  }

  const prompt = `You are an AI fairness auditor. Analyze the resume and its AI analysis provided below, and assess the likelihood of algorithmic bias in the analysis.

RESUME TEXT:
${resumeText}

AI ANALYSIS RESULTS:
- Name: ${resumeAnalysis.name || 'Not specified'}
- Skills identified: ${resumeAnalysis.skills?.join(', ') || 'None'}
- Experience identified: ${resumeAnalysis.experience?.map(exp => `${exp?.title || exp?.position || 'Position'} at ${exp?.company || 'Company'}`).join('; ') || 'Not specified'}
- Match percentage: ${matchAnalysis.matchPercentage || 0}%
- Matched skills: ${matchAnalysis.matchedSkills?.map(s => s?.skill || '').filter(Boolean).join(', ') || 'None'}
- Missing skills: ${matchAnalysis.missingSkills?.join(', ') || 'None'}
- Candidate strengths: ${matchAnalysis.candidateStrengths?.join(', ') || 'None identified'}
- Candidate weaknesses: ${matchAnalysis.candidateWeaknesses?.join(', ') || 'None identified'}

Provide a fairness assessment with the following:
1. A confidence score (0-100) indicating how confident you are that the analysis is FREE FROM BIAS (100 = completely unbiased, 0 = extremely biased)
2. Any potential areas of bias in the analysis (e.g., gender bias, age bias, etc.)
3. A brief fairness assessment explaining your reasoning

Respond in JSON format:
{
  "biasConfidenceScore": 85,
  "potentialBiasAreas": ["area1", "area2"],
  "fairnessAssessment": "Explanation of your assessment"
}`;

  const response = await anthropicClient.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 1000,
    messages: [
      { role: 'user', content: prompt }
    ],
    system: "You are a fairness auditor for AI systems. Your task is to identify potential bias in AI analyses of resumes. Respond with valid JSON only."
  });

  // Extract JSON from the response content
  try {
    let contentText = "";
    // Handle different response structures
    if (response.content && response.content.length > 0) {
      const content = response.content[0];
      if (typeof content === 'object' && content !== null) {
        if ('text' in content && typeof content.text === 'string') {
          contentText = content.text;
        } else {
          // Try to stringify the content object if text property isn't available
          contentText = JSON.stringify(content);
        }
      } else if (typeof content === 'string') {
        contentText = content;
      }
    }
    
    if (!contentText) {
      throw new Error("Could not extract text from Anthropic response");
    }

    // Sometimes Claude adds extra text around the JSON, so we extract just the JSON
    const jsonMatch = contentText.match(/({[\s\S]*})/);
    const jsonStr = jsonMatch ? jsonMatch[0] : contentText;
    
    const parsedResponse = JSON.parse(jsonStr);
    
    // Normalize the response
    return {
      biasConfidenceScore: typeof parsedResponse.biasConfidenceScore === 'number' ? 
        parsedResponse.biasConfidenceScore : 50, // Default to 50 if missing
      potentialBiasAreas: Array.isArray(parsedResponse.potentialBiasAreas) ? 
        parsedResponse.potentialBiasAreas : [],
      fairnessAssessment: typeof parsedResponse.fairnessAssessment === 'string' ? 
        parsedResponse.fairnessAssessment : "Unable to provide a detailed fairness assessment."
    };
  } catch (error) {
    console.error("Error parsing Anthropic response:", error);
    throw new Error("Failed to parse Anthropic response");
  }
}

/**
 * Get a default fairness analysis when AI services are unavailable
 */
function getDefaultFairnessAnalysis(): FairnessAnalysisResult {
  return {
    biasConfidenceScore: 50, // Neutral score
    potentialBiasAreas: ["Service unavailable - using default assessment"],
    fairnessAssessment: "The fairness analysis service is currently unavailable. This is a default assessment that cannot detect potential bias in the AI analysis."
  };
}