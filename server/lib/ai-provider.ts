import * as openai from './openai';
import * as anthropic from './anthropic';
import * as groq from './groq';
import { config } from '../config';
import { logger } from './logger';
import { 
  AnalyzeResumeResponse, 
  AnalyzeJobDescriptionResponse, 
  MatchAnalysisResponse, 
  InterviewQuestionsResponse,
  BiasAnalysisResponse 
} from '@shared/schema';
import { calculateEnhancedMatch, DEFAULT_SCORING_WEIGHTS } from './enhanced-scoring';
import { generateEmbedding, calculateSemanticSimilarity } from './embeddings';
import { initializeSkillHierarchy } from './skill-hierarchy';
import { analyzeResumeFairness } from './fairness-analyzer';

// Verify if providers are configured
const isAnthropicConfigured = !!config.anthropicApiKey;
const isGroqConfigured = !!process.env.GROQ_API_KEY;

// Initialize skill hierarchy on first load
let skillHierarchyInitialized = false;
async function initializeEnhancements() {
  if (!skillHierarchyInitialized) {
    try {
      await initializeSkillHierarchy();
      skillHierarchyInitialized = true;
      logger.info('Enhanced AI features initialized successfully');
    } catch (error) {
      logger.warn('Failed to initialize enhanced AI features:', error);
    }
  }
}

/**
 * Provider selection strategy
 * 1. Try Groq first (primary provider - fastest and most cost-effective)
 * 2. If Groq is unavailable, try OpenAI (secondary provider)
 * 3. If both unavailable and Anthropic is configured, try Anthropic (tertiary provider)
 * 4. If all are unavailable, use fallback responses
 */

/**
 * Get combined service status for all AI providers
 */
export function getAIServiceStatus() {
  const groqStatus = groq.getGroqServiceStatus();
  const openaiStatus = openai.getOpenAIServiceStatus();
  let anthropicStatus = null;
  
  if (isAnthropicConfigured) {
    anthropicStatus = anthropic.getAnthropicServiceStatus();
  }
  
  return {
    providers: {
      groq: {
        ...groqStatus,
        isConfigured: isGroqConfigured,
        isPrimary: true
      },
      openai: {
        ...openaiStatus,
        isConfigured: true,
        isPrimary: false
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
    status: groqStatus.isAvailable || openaiStatus.isAvailable || (isAnthropicConfigured && anthropicStatus?.isAvailable) 
      ? "operational" 
      : "degraded",
    timestamp: new Date().toISOString()
  };
}

/**
 * Smart provider selection for resume analysis
 */
export async function analyzeResume(resumeText: string): Promise<AnalyzeResumeResponse> {
  // Initialize enhancements on first use
  await initializeEnhancements();
  
  // Check Groq availability first (primary provider)
  if (isGroqConfigured && groq.getGroqServiceStatus().isAvailable) {
    return await groq.analyzeResume(resumeText);
  }
  
  // If Groq is unavailable, try OpenAI (secondary provider)
  if (openai.getOpenAIServiceStatus().isAvailable) {
    logger.info('Groq unavailable, falling back to OpenAI for resume analysis');
    return await openai.analyzeResume(resumeText);
  }
  
  // If both unavailable but Anthropic is configured and available, use Anthropic
  if (isAnthropicConfigured && anthropic.getAnthropicServiceStatus().isAvailable) {
    logger.info('Groq and OpenAI unavailable, falling back to Anthropic for resume analysis');
    return await anthropic.analyzeResume(resumeText);
  }
  
  // If all providers are unavailable, use OpenAI's fallback response
  logger.warn('All AI providers unavailable, using built-in fallback for resume analysis');
  return await openai.analyzeResume(resumeText);
}

/**
 * Smart provider selection for job description analysis
 */
export async function analyzeJobDescription(title: string, description: string): Promise<AnalyzeJobDescriptionResponse> {
  // Check Groq availability first (primary provider)
  if (isGroqConfigured && groq.getGroqServiceStatus().isAvailable) {
    return await groq.analyzeJobDescription(title, description);
  }
  
  // If Groq is unavailable, try OpenAI (secondary provider)
  if (openai.getOpenAIServiceStatus().isAvailable) {
    logger.info('Groq unavailable, falling back to OpenAI for job description analysis');
    return await openai.analyzeJobDescription(title, description);
  }
  
  // If both unavailable but Anthropic is configured and available, use Anthropic
  if (isAnthropicConfigured && anthropic.getAnthropicServiceStatus().isAvailable) {
    logger.info('Groq and OpenAI unavailable, falling back to Anthropic for job description analysis');
    return await anthropic.analyzeJobDescription(title, description);
  }
  
  // If all providers are unavailable, use OpenAI's fallback response
  logger.warn('All AI providers unavailable, using built-in fallback for job description analysis');
  return await openai.analyzeJobDescription(title, description);
}

/**
 * Enhanced match analysis with vector embeddings and ML scoring
 */
export async function analyzeMatch(
  resumeAnalysis: AnalyzeResumeResponse,
  jobAnalysis: AnalyzeJobDescriptionResponse,
  resumeText?: string,
  jobText?: string
): Promise<MatchAnalysisResponse> {
  try {
    // Use enhanced scoring if we have full text data
    if (resumeText && jobText) {
      logger.info('Using enhanced ML-based scoring with embeddings');
      
      const enhancedResult = await calculateEnhancedMatch(
        {
          skills: resumeAnalysis.skills || [],
          experience: resumeAnalysis.experience || '',
          education: resumeAnalysis.education || '',
          content: resumeText
        },
        {
          skills: jobAnalysis.skills || [],
          experience: jobAnalysis.experience || '',
          description: jobText
        },
        DEFAULT_SCORING_WEIGHTS
      );

      // Convert enhanced result to MatchAnalysisResponse format
      const matchResult: MatchAnalysisResponse = {
        matchPercentage: enhancedResult.totalScore,
        matchedSkills: enhancedResult.skillBreakdown
          .filter(s => s.matched)
          .map(s => ({ 
            skill: s.skill, 
            matchPercentage: s.score,
            category: 'technical',
            importance: 'important' as const,
            source: 'semantic' as const
          })),
        missingSkills: enhancedResult.skillBreakdown
          .filter(s => !s.matched && s.required)
          .map(s => s.skill),
        candidateStrengths: enhancedResult.explanation.strengths,
        candidateWeaknesses: enhancedResult.explanation.weaknesses,
        recommendations: enhancedResult.explanation.recommendations,
        confidenceLevel: enhancedResult.confidence > 0.8 ? 'high' : 
                        enhancedResult.confidence > 0.5 ? 'medium' : 'low'
      };

      // Add fairness analysis if available
      if (resumeText) {
        try {
          const fairnessMetrics = await analyzeResumeFairness(
            resumeText,
            resumeAnalysis,
            matchResult
          );
          matchResult.fairnessMetrics = fairnessMetrics;
        } catch (error) {
          logger.error('Error generating fairness metrics', error);
        }
      }

      return matchResult;
    }

    // Fallback to traditional AI provider analysis
    let matchResult: MatchAnalysisResponse;
    
    if (isGroqConfigured && groq.getGroqServiceStatus().isAvailable) {
      matchResult = await groq.analyzeMatch(resumeAnalysis, jobAnalysis, resumeText, jobText);
    } else if (openai.getOpenAIServiceStatus().isAvailable) {
      logger.info('Groq unavailable, falling back to OpenAI for match analysis');
      matchResult = await openai.analyzeMatch(resumeAnalysis, jobAnalysis);
    } else if (isAnthropicConfigured && anthropic.getAnthropicServiceStatus().isAvailable) {
      logger.info('Groq and OpenAI unavailable, falling back to Anthropic for match analysis');
      matchResult = await anthropic.analyzeMatch(resumeAnalysis, jobAnalysis);
    } else {
      logger.warn('All AI providers unavailable, using built-in fallback for match analysis');
      matchResult = await openai.analyzeMatch(resumeAnalysis, jobAnalysis);
    }
    
    // Add fairness analysis if available
    if (resumeText) {
      try {
        const fairnessMetrics = await analyzeResumeFairness(
          resumeText,
          resumeAnalysis,
          matchResult
        );
        matchResult.fairnessMetrics = fairnessMetrics;
      } catch (error) {
        logger.error('Error generating fairness metrics', error);
      }
    }
  
    return matchResult;
    
  } catch (error) {
    logger.error('Error in enhanced match analysis:', error);
    
    // Ultimate fallback
    return await openai.analyzeMatch(resumeAnalysis, jobAnalysis);
  }
}

/**
 * Smart provider selection for bias analysis
 */
export async function analyzeBias(title: string, description: string): Promise<BiasAnalysisResponse> {
  // Check Groq availability first (primary provider)
  if (isGroqConfigured && groq.getGroqServiceStatus().isAvailable) {
    return await groq.analyzeBias(title, description);
  }
  
  // If Groq is unavailable, try OpenAI (secondary provider)
  if (openai.getOpenAIServiceStatus().isAvailable) {
    logger.info('Groq unavailable, falling back to OpenAI for bias analysis');
    return await openai.analyzeBias(title, description);
  }
  
  // If both unavailable but Anthropic is configured and available, use Anthropic
  if (isAnthropicConfigured && anthropic.getAnthropicServiceStatus().isAvailable) {
    logger.info('Groq and OpenAI unavailable, falling back to Anthropic for bias analysis');
    // Use our newly implemented Anthropic bias analysis
    return await anthropic.analyzeBias(title, description);
  }
  
  // If all providers are unavailable, use OpenAI's fallback response
  logger.warn('All AI providers unavailable, using built-in fallback for bias analysis');
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
  // Check Groq availability first (primary provider)
  if (isGroqConfigured && groq.getGroqServiceStatus().isAvailable) {
    return await groq.generateInterviewQuestions(resumeAnalysis, jobAnalysis, matchAnalysis);
  }
  
  // If Groq is unavailable, try OpenAI (secondary provider)
  if (openai.getOpenAIServiceStatus().isAvailable) {
    logger.info('Groq unavailable, falling back to OpenAI for interview questions generation');
    return await openai.generateInterviewQuestions(resumeAnalysis, jobAnalysis, matchAnalysis);
  }
  
  // If both unavailable but Anthropic is configured and available, use Anthropic
  if (isAnthropicConfigured && anthropic.getAnthropicServiceStatus().isAvailable) {
    logger.info('Groq and OpenAI unavailable, falling back to Anthropic for interview questions generation');
    // Use our newly implemented Anthropic interview questions generation
    return await anthropic.generateInterviewQuestions(resumeAnalysis, jobAnalysis, matchAnalysis);
  }
  
  // If all providers are unavailable, use OpenAI's fallback response
  logger.warn('All AI providers unavailable, using built-in fallback for interview questions generation');
  return await openai.generateInterviewQuestions(resumeAnalysis, jobAnalysis, matchAnalysis);
}

/**
 * Extract skills using the available AI provider
 */
export async function extractSkills(text: string, type: "resume" | "job"): Promise<string[]> {
  // Check Groq availability first (primary provider)
  if (isGroqConfigured && groq.getGroqServiceStatus().isAvailable) {
    return await groq.extractSkills(text, type);
  }
  
  // If Groq is unavailable, try OpenAI (secondary provider)
  if (openai.getOpenAIServiceStatus().isAvailable) {
    logger.info('Groq unavailable, falling back to OpenAI for skills extraction');
    return await openai.extractSkills(text, type);
  }
  
  // If both unavailable but Anthropic is configured and available, use Anthropic
  if (isAnthropicConfigured && anthropic.getAnthropicServiceStatus().isAvailable) {
    logger.info('Groq and OpenAI unavailable, falling back to Anthropic for skills extraction');
    // Use our newly implemented Anthropic skills extraction
    return await anthropic.extractSkills(text, type);
  }
  
  // If all providers are unavailable, use OpenAI's fallback response
  logger.warn('All AI providers unavailable, using built-in fallback for skills extraction');
  return await openai.extractSkills(text, type);
}

/**
 * Analyze skill gaps using the available AI provider
 */
export async function analyzeSkillGap(resumeText: string, jobDescText: string): Promise<{
  matchedSkills: string[],
  missingSkills: string[]
}> {
  // Check Groq availability first (primary provider)
  if (isGroqConfigured && groq.getGroqServiceStatus().isAvailable) {
    return await groq.analyzeSkillGap(resumeText, jobDescText);
  }
  
  // If Groq is unavailable, try OpenAI (secondary provider)
  if (openai.getOpenAIServiceStatus().isAvailable) {
    logger.info('Groq unavailable, falling back to OpenAI for skill gap analysis');
    return await openai.analyzeSkillGap(resumeText, jobDescText);
  }
  
  // If both unavailable but Anthropic is configured and available, use Anthropic
  if (isAnthropicConfigured && anthropic.getAnthropicServiceStatus().isAvailable) {
    logger.info('Groq and OpenAI unavailable, falling back to Anthropic for skill gap analysis');
    // Use our newly implemented Anthropic skill gap analysis
    return await anthropic.analyzeSkillGap(resumeText, jobDescText);
  }
  
  // If all providers are unavailable, use OpenAI's fallback response
  logger.warn('All AI providers unavailable, using built-in fallback for skill gap analysis');
  return await openai.analyzeSkillGap(resumeText, jobDescText);
}

/**
 * Analyze the fairness of AI analysis on a resume
 * This helps detect potential bias in the AI algorithm's assessments
 */
export { 
  analyzeResumeFairness
}