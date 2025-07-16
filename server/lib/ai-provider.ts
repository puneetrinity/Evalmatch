import * as openai from './openai';
import * as anthropic from './anthropic';
import { config } from '../config';
import { 
  AnalyzeResumeResponse, 
  AnalyzeJobDescriptionResponse, 
  MatchAnalysisResponse, 
  InterviewQuestionsResponse,
  BiasAnalysisResponse 
} from '@shared/schema';
import { analyzeResumeFairness } from './fairness-analyzer';

// Verify if Anthropic API is configured
const isAnthropicConfigured = !!config.anthropicApiKey;

/**
 * Provider selection strategy
 * 1. Try OpenAI first (primary provider)
 * 2. If OpenAI is unavailable and Anthropic is configured, try Anthropic (secondary provider)
 * 3. If both are unavailable, use fallback responses
 */

/**
 * Get combined service status for all AI providers
 */
export function getAIServiceStatus() {
  const openaiStatus = openai.getOpenAIServiceStatus();
  let anthropicStatus = null;
  
  if (isAnthropicConfigured) {
    anthropicStatus = anthropic.getAnthropicServiceStatus();
  }
  
  return {
    providers: {
      openai: {
        ...openaiStatus,
        isConfigured: true,
        isPrimary: true
      },
      anthropic: anthropicStatus ? {
        ...anthropicStatus,
        isConfigured: isAnthropicConfigured,
        isPrimary: false
      } : {
        isConfigured: false,
        isAvailable: false,
        statusMessage: "Anthropic API is not configured"
      }
    },
    status: openaiStatus.isAvailable || (isAnthropicConfigured && anthropicStatus?.isAvailable) 
      ? "operational" 
      : "degraded",
    timestamp: new Date().toISOString()
  };
}

/**
 * Smart provider selection for resume analysis
 */
export async function analyzeResume(resumeText: string): Promise<AnalyzeResumeResponse> {
  // Check OpenAI availability first (primary provider)
  if (openai.getOpenAIServiceStatus().isAvailable) {
    return await openai.analyzeResume(resumeText);
  }
  
  // If OpenAI is unavailable but Anthropic is configured and available, use Anthropic
  if (isAnthropicConfigured && anthropic.getAnthropicServiceStatus().isAvailable) {
    console.log(`[${new Date().toISOString()}] [AI_PROVIDER] [INFO] OpenAI unavailable, falling back to Anthropic for resume analysis`);
    return await anthropic.analyzeResume(resumeText);
  }
  
  // If both providers are unavailable, use OpenAI's fallback response
  console.log(`[${new Date().toISOString()}] [AI_PROVIDER] [WARN] All AI providers unavailable, using built-in fallback for resume analysis`);
  return await openai.analyzeResume(resumeText);
}

/**
 * Smart provider selection for job description analysis
 */
export async function analyzeJobDescription(title: string, description: string): Promise<AnalyzeJobDescriptionResponse> {
  // Check OpenAI availability first (primary provider)
  if (openai.getOpenAIServiceStatus().isAvailable) {
    return await openai.analyzeJobDescription(title, description);
  }
  
  // If OpenAI is unavailable but Anthropic is configured and available, use Anthropic
  if (isAnthropicConfigured && anthropic.getAnthropicServiceStatus().isAvailable) {
    console.log(`[${new Date().toISOString()}] [AI_PROVIDER] [INFO] OpenAI unavailable, falling back to Anthropic for job description analysis`);
    return await anthropic.analyzeJobDescription(title, description);
  }
  
  // If both providers are unavailable, use OpenAI's fallback response
  console.log(`[${new Date().toISOString()}] [AI_PROVIDER] [WARN] All AI providers unavailable, using built-in fallback for job description analysis`);
  return await openai.analyzeJobDescription(title, description);
}

/**
 * Smart provider selection for match analysis
 */
export async function analyzeMatch(
  resumeAnalysis: AnalyzeResumeResponse,
  jobAnalysis: AnalyzeJobDescriptionResponse,
  resumeText?: string
): Promise<MatchAnalysisResponse> {
  // Check OpenAI availability first (primary provider)
  let matchResult: MatchAnalysisResponse;
  
  if (openai.getOpenAIServiceStatus().isAvailable) {
    matchResult = await openai.analyzeMatch(resumeAnalysis, jobAnalysis);
  } else if (isAnthropicConfigured && anthropic.getAnthropicServiceStatus().isAvailable) {
    console.log(`[${new Date().toISOString()}] [AI_PROVIDER] [INFO] OpenAI unavailable, falling back to Anthropic for match analysis`);
    // Use our newly implemented Anthropic match analysis
    matchResult = await anthropic.analyzeMatch(resumeAnalysis, jobAnalysis);
  } else {
    // If both providers are unavailable, use OpenAI's fallback response
    console.log(`[${new Date().toISOString()}] [AI_PROVIDER] [WARN] All AI providers unavailable, using built-in fallback for match analysis`);
    matchResult = await openai.analyzeMatch(resumeAnalysis, jobAnalysis);
  }
  
  // Check if we have all needed data to perform fairness analysis
  if (resumeText) {
    try {
      // Import fairness analyzer dynamically to prevent circular dependencies
      const { analyzeResumeFairness } = await import('./fairness-analyzer');
      
      // Generate fairness metrics
      const fairnessMetrics = await analyzeResumeFairness(
        resumeText,
        resumeAnalysis,
        matchResult
      );
      
      // Add fairness metrics to match result
      return {
        ...matchResult,
        fairnessMetrics
      };
    } catch (error) {
      console.error("[AI_PROVIDER] Error generating fairness metrics:", error);
      // Return the match result without fairness metrics if analysis fails
    }
  }
  
  // Return the match result (without fairness metrics if analysis wasn't performed)
  return matchResult;
}

/**
 * Smart provider selection for bias analysis
 */
export async function analyzeBias(title: string, description: string): Promise<BiasAnalysisResponse> {
  // Check OpenAI availability first (primary provider)
  if (openai.getOpenAIServiceStatus().isAvailable) {
    return await openai.analyzeBias(title, description);
  }
  
  // If OpenAI is unavailable but Anthropic is configured and available, use Anthropic
  if (isAnthropicConfigured && anthropic.getAnthropicServiceStatus().isAvailable) {
    console.log(`[${new Date().toISOString()}] [AI_PROVIDER] [INFO] OpenAI unavailable, falling back to Anthropic for bias analysis`);
    // Use our newly implemented Anthropic bias analysis
    return await anthropic.analyzeBias(title, description);
  }
  
  // If both providers are unavailable, use OpenAI's fallback response
  console.log(`[${new Date().toISOString()}] [AI_PROVIDER] [WARN] All AI providers unavailable, using built-in fallback for bias analysis`);
  return await openai.analyzeBias(title, description);
}

/**
 * Smart provider selection for interview questions generation
 */
export async function generateInterviewQuestions(
  resumeAnalysis: AnalyzeResumeResponse,
  jobAnalysis: AnalyzeJobDescriptionResponse,
  matchAnalysis: MatchAnalysisResponse
): Promise<InterviewQuestionsResponse> {
  // Check OpenAI availability first (primary provider)
  if (openai.getOpenAIServiceStatus().isAvailable) {
    return await openai.generateInterviewQuestions(resumeAnalysis, jobAnalysis, matchAnalysis);
  }
  
  // If OpenAI is unavailable but Anthropic is configured and available, use Anthropic
  if (isAnthropicConfigured && anthropic.getAnthropicServiceStatus().isAvailable) {
    console.log(`[${new Date().toISOString()}] [AI_PROVIDER] [INFO] OpenAI unavailable, falling back to Anthropic for interview questions generation`);
    // Use our newly implemented Anthropic interview questions generation
    return await anthropic.generateInterviewQuestions(resumeAnalysis, jobAnalysis, matchAnalysis);
  }
  
  // If both providers are unavailable, use OpenAI's fallback response
  console.log(`[${new Date().toISOString()}] [AI_PROVIDER] [WARN] All AI providers unavailable, using built-in fallback for interview questions generation`);
  return await openai.generateInterviewQuestions(resumeAnalysis, jobAnalysis, matchAnalysis);
}

/**
 * Extract skills using the available AI provider
 */
export async function extractSkills(text: string, type: "resume" | "job"): Promise<string[]> {
  // Check OpenAI availability first (primary provider)
  if (openai.getOpenAIServiceStatus().isAvailable) {
    return await openai.extractSkills(text, type);
  }
  
  // If OpenAI is unavailable but Anthropic is configured and available, use Anthropic
  if (isAnthropicConfigured && anthropic.getAnthropicServiceStatus().isAvailable) {
    console.log(`[${new Date().toISOString()}] [AI_PROVIDER] [INFO] OpenAI unavailable, falling back to Anthropic for skills extraction`);
    // Use our newly implemented Anthropic skills extraction
    return await anthropic.extractSkills(text, type);
  }
  
  // If both providers are unavailable, use OpenAI's fallback response
  console.log(`[${new Date().toISOString()}] [AI_PROVIDER] [WARN] All AI providers unavailable, using built-in fallback for skills extraction`);
  return await openai.extractSkills(text, type);
}

/**
 * Analyze skill gaps using the available AI provider
 */
export async function analyzeSkillGap(resumeText: string, jobDescText: string): Promise<{
  matchedSkills: string[],
  missingSkills: string[]
}> {
  // Check OpenAI availability first (primary provider)
  if (openai.getOpenAIServiceStatus().isAvailable) {
    return await openai.analyzeSkillGap(resumeText, jobDescText);
  }
  
  // If OpenAI is unavailable but Anthropic is configured and available, use Anthropic
  if (isAnthropicConfigured && anthropic.getAnthropicServiceStatus().isAvailable) {
    console.log(`[${new Date().toISOString()}] [AI_PROVIDER] [INFO] OpenAI unavailable, falling back to Anthropic for skill gap analysis`);
    // Use our newly implemented Anthropic skill gap analysis
    return await anthropic.analyzeSkillGap(resumeText, jobDescText);
  }
  
  // If both providers are unavailable, use OpenAI's fallback response
  console.log(`[${new Date().toISOString()}] [AI_PROVIDER] [WARN] All AI providers unavailable, using built-in fallback for skill gap analysis`);
  return await openai.analyzeSkillGap(resumeText, jobDescText);
}

/**
 * Analyze the fairness of AI analysis on a resume
 * This helps detect potential bias in the AI algorithm's assessments
 */
export { 
  analyzeResumeFairness
}