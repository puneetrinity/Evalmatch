import { logger } from "./logger";
import {
  AnalyzeResumeResponse,
  AnalyzeJobDescriptionResponse,
  MatchAnalysisResponse,
  SkillMatch,
} from "@shared/schema";
import {
  calculateEnhancedMatch,
  ScoringWeights,
} from "./enhanced-scoring";
import { UserTierInfo } from "@shared/user-tiers";
import * as groq from "./groq";
import * as openai from "./openai";
import * as anthropic from "./anthropic";
import { config } from "../config";
import { 
  detectMatchingBias, 
  BiasDetectionResult,
  CandidateProfile,
  JobProfile 
} from "./bias-detection";

// Updated scoring weights without cultural assessment
export const HYBRID_SCORING_WEIGHTS: ScoringWeights = {
  skills: 0.50,      // 50% - Increased from 45%
  experience: 0.30,  // 30% - Increased from 25%
  education: 0.15,   // 15% - Unchanged
  semantic: 0.05,    // 5% - Decreased from 10%
  cultural: 0.0,     // 0% - Removed completely
};

interface HybridMatchResult {
  matchPercentage: number;
  matchedSkills: SkillMatch[];
  missingSkills: string[];
  candidateStrengths: string[];
  candidateWeaknesses: string[];
  recommendations: string[];
  confidenceLevel: "low" | "medium" | "high";
  fairnessMetrics?: any;
  biasDetection?: BiasDetectionResult;
  scoringDimensions: {
    skills: number;
    experience: number;
    education: number;
    semantic: number;
    overall: number;
  };
  analysisMethod: "hybrid" | "ml_only" | "llm_only";
  confidence: number;
}

interface LLMAnalysisResult {
  matchPercentage: number;
  matchedSkills: string[];
  missingSkills: string[];
  candidateStrengths: string[];
  candidateWeaknesses: string[];
  recommendations: string[];
  reasoning: string;
}

/**
 * Hybrid Match Analyzer - Combines ML scoring with LLM reasoning
 * This analyzer uses both quantitative ML scoring and qualitative LLM analysis
 * to provide comprehensive, accurate, and explainable match results.
 */
export class HybridMatchAnalyzer {
  private isGroqConfigured: boolean;
  private isAnthropicConfigured: boolean;

  constructor() {
    this.isGroqConfigured = !!process.env.GROQ_API_KEY;
    this.isAnthropicConfigured = !!config.anthropicApiKey;
  }

  /**
   * Main hybrid analysis method
   */
  async analyzeMatch(
    resumeAnalysis: AnalyzeResumeResponse,
    jobAnalysis: AnalyzeJobDescriptionResponse,
    userTier: UserTierInfo,
    resumeText?: string,
    jobText?: string,
  ): Promise<HybridMatchResult> {
    const startTime = Date.now();
    
    try {
      // Determine analysis strategy based on available data
      const hasFullText = resumeText && jobText;
      const strategy = this.determineAnalysisStrategy(!!hasFullText, userTier);

      logger.info(`Starting hybrid match analysis using ${strategy} strategy`, {
        hasFullText,
        userTier: userTier.tier,
        resumeSkills: resumeAnalysis.skills?.length || 0,
        jobSkills: jobAnalysis.skills?.length || 0,
      });

      let result: HybridMatchResult;

      switch (strategy) {
        case "hybrid":
          result = await this.performHybridAnalysis(
            resumeAnalysis,
            jobAnalysis,
            userTier,
            resumeText!,
            jobText!,
          );
          break;
        case "ml_only":
          result = await this.performMLOnlyAnalysis(
            resumeAnalysis,
            jobAnalysis,
            resumeText,
            jobText,
          );
          break;
        case "llm_only":
          result = await this.performLLMOnlyAnalysis(
            resumeAnalysis,
            jobAnalysis,
            userTier,
            resumeText,
            jobText,
          );
          break;
        default:
          throw new Error(`Unknown analysis strategy: ${strategy}`);
      }

      // Add bias detection analysis
      if (resumeText && jobText) {
        try {
          const candidateProfile: CandidateProfile = {
            skills: resumeAnalysis.skills || [],
            experience: Array.isArray(resumeAnalysis.experience) 
              ? resumeAnalysis.experience.join(", ")
              : resumeAnalysis.experience || "",
            education: Array.isArray(resumeAnalysis.education)
              ? resumeAnalysis.education.join(", ")
              : resumeAnalysis.education || "",
            name: resumeAnalysis.filename,
            technologies: [], // Extract from skills if available
            industries: [], // Would be extracted from content
            resumeText,
          };

          const jobProfile: JobProfile = {
            requiredSkills: jobAnalysis.skills || [],
            experience: jobAnalysis.experience || "",
            technologies: [], // Extract from requirements if available
            industries: [], // Would be extracted from content
            jobText,
          };

          const biasDetection = await detectMatchingBias(
            candidateProfile,
            jobProfile,
            result.matchPercentage,
            result.scoringDimensions
          );

          result.biasDetection = biasDetection;
          result.fairnessMetrics = biasDetection.fairnessMetrics;

          logger.info("Bias detection completed", {
            hasBias: biasDetection.hasBias,
            biasScore: biasDetection.biasScore,
            detectedBiases: biasDetection.detectedBiases.length,
          });
        } catch (error) {
          logger.error("Bias detection failed:", error);
          // Continue without bias detection
        }
      }

      const processingTime = Date.now() - startTime;
      logger.info(`Hybrid match analysis completed`, {
        strategy: result.analysisMethod,
        matchPercentage: result.matchPercentage,
        confidence: result.confidence,
        hasBias: result.biasDetection?.hasBias || false,
        processingTime,
      });

      return result;
    } catch (error) {
      logger.error("Hybrid match analysis failed:", error);
      
      // Fallback to basic analysis
      return this.createFallbackResult(resumeAnalysis, jobAnalysis);
    }
  }

  /**
   * Determine the best analysis strategy based on available data and user tier
   */
  private determineAnalysisStrategy(
    hasFullText: boolean,
    userTier: UserTierInfo,
  ): "hybrid" | "ml_only" | "llm_only" {
    // Hybrid analysis requires full text content
    if (hasFullText && this.isAIProviderAvailable()) {
      return "hybrid";
    }
    
    // If we have some text but no AI provider, use ML only
    if (hasFullText) {
      return "ml_only";
    }
    
    // If AI provider is available but no full text, use LLM only
    if (this.isAIProviderAvailable()) {
      return "llm_only";
    }
    
    // Fallback to ML with limited data
    return "ml_only";
  }

  /**
   * Hybrid analysis combining ML scoring with LLM insights
   */
  private async performHybridAnalysis(
    resumeAnalysis: AnalyzeResumeResponse,
    jobAnalysis: AnalyzeJobDescriptionResponse,
    userTier: UserTierInfo,
    resumeText: string,
    jobText: string,
  ): Promise<HybridMatchResult> {
    // Run ML and LLM analysis in parallel for efficiency
    const [mlResult, llmResult] = await Promise.all([
      this.runMLAnalysis(resumeAnalysis, jobAnalysis, resumeText, jobText),
      this.runLLMAnalysis(resumeAnalysis, jobAnalysis, userTier, resumeText, jobText),
    ]);

    // Blend results using confidence-weighted approach
    const blendedResult = this.blendResults(mlResult, llmResult);

    return {
      ...blendedResult,
      analysisMethod: "hybrid",
      scoringDimensions: {
        skills: mlResult.dimensionScores.skills,
        experience: mlResult.dimensionScores.experience,
        education: mlResult.dimensionScores.education,
        semantic: mlResult.dimensionScores.semantic,
        overall: blendedResult.matchPercentage,
      },
    };
  }

  /**
   * ML-only analysis using enhanced scoring
   */
  private async performMLOnlyAnalysis(
    resumeAnalysis: AnalyzeResumeResponse,
    jobAnalysis: AnalyzeJobDescriptionResponse,
    resumeText?: string,
    jobText?: string,
  ): Promise<HybridMatchResult> {
    const mlResult = await this.runMLAnalysis(
      resumeAnalysis,
      jobAnalysis,
      resumeText || "",
      jobText || "",
    );

    return {
      matchPercentage: mlResult.totalScore,
      matchedSkills: mlResult.skillBreakdown
        .filter((s) => s.matched)
        .map((s) => ({
          skill: s.skill,
          matchPercentage: s.score,
          category: s.category || "technical",
          importance: "important" as const,
          source: "semantic" as const,
        })),
      missingSkills: mlResult.skillBreakdown
        .filter((s) => !s.matched && s.required)
        .map((s) => s.skill),
      candidateStrengths: mlResult.explanation.strengths,
      candidateWeaknesses: mlResult.explanation.weaknesses,
      recommendations: mlResult.explanation.recommendations,
      confidenceLevel: mlResult.confidence > 0.8 ? "high" : mlResult.confidence > 0.5 ? "medium" : "low",
      scoringDimensions: {
        skills: mlResult.dimensionScores.skills,
        experience: mlResult.dimensionScores.experience,
        education: mlResult.dimensionScores.education,
        semantic: mlResult.dimensionScores.semantic,
        overall: mlResult.totalScore,
      },
      analysisMethod: "ml_only",
      confidence: mlResult.confidence,
    };
  }

  /**
   * LLM-only analysis using AI providers
   */
  private async performLLMOnlyAnalysis(
    resumeAnalysis: AnalyzeResumeResponse,
    jobAnalysis: AnalyzeJobDescriptionResponse,
    userTier: UserTierInfo,
    resumeText?: string,
    jobText?: string,
  ): Promise<HybridMatchResult> {
    const llmResult = await this.runLLMAnalysis(
      resumeAnalysis,
      jobAnalysis,
      userTier,
      resumeText,
      jobText,
    );

    return {
      matchPercentage: llmResult.matchPercentage,
      matchedSkills: llmResult.matchedSkills.map((skill) => ({
        skill,
        matchPercentage: 85, // Default confidence for LLM matches
        category: "technical",
        importance: "important" as const,
        source: "inferred" as const,
      })),
      missingSkills: llmResult.missingSkills,
      candidateStrengths: llmResult.candidateStrengths,
      candidateWeaknesses: llmResult.candidateWeaknesses,
      recommendations: llmResult.recommendations,
      confidenceLevel: llmResult.matchPercentage > 80 ? "high" : llmResult.matchPercentage > 60 ? "medium" : "low",
      scoringDimensions: {
        skills: Math.round(llmResult.matchPercentage * 0.6), // Estimate skills contribution
        experience: Math.round(llmResult.matchPercentage * 0.3), // Estimate experience contribution
        education: Math.round(llmResult.matchPercentage * 0.1), // Estimate education contribution
        semantic: Math.round(llmResult.matchPercentage * 0.1), // Estimate semantic contribution
        overall: llmResult.matchPercentage,
      },
      analysisMethod: "llm_only",
      confidence: llmResult.matchPercentage / 100,
    };
  }

  /**
   * Run ML analysis using enhanced scoring
   */
  private async runMLAnalysis(
    resumeAnalysis: AnalyzeResumeResponse,
    jobAnalysis: AnalyzeJobDescriptionResponse,
    resumeText: string,
    jobText: string,
  ) {
    return await calculateEnhancedMatch(
      {
        skills: resumeAnalysis.skills || [],
        experience: Array.isArray(resumeAnalysis.experience)
          ? resumeAnalysis.experience.join(", ")
          : resumeAnalysis.experience || resumeAnalysis.analyzedData?.experience || "",
        education: Array.isArray(resumeAnalysis.education)
          ? resumeAnalysis.education.join(", ")
          : resumeAnalysis.education || resumeAnalysis.analyzedData?.education?.join(", ") || "",
        content: resumeText,
      },
      {
        skills: jobAnalysis.skills || [],
        experience: jobAnalysis.experience || "",
        description: jobText,
      },
      HYBRID_SCORING_WEIGHTS,
    );
  }

  /**
   * Run LLM analysis using available AI providers
   */
  private async runLLMAnalysis(
    resumeAnalysis: AnalyzeResumeResponse,
    jobAnalysis: AnalyzeJobDescriptionResponse,
    userTier: UserTierInfo,
    resumeText?: string,
    jobText?: string,
  ): Promise<LLMAnalysisResult> {
    // Try providers in order of preference
    if (this.isGroqConfigured && groq.getGroqServiceStatus().isAvailable) {
      return await this.callGroqAnalysis(resumeAnalysis, jobAnalysis, resumeText, jobText);
    }
    
    if (openai.getOpenAIServiceStatus().isAvailable) {
      logger.info("Groq unavailable, falling back to OpenAI for LLM analysis");
      return await this.callOpenAIAnalysis(resumeAnalysis, jobAnalysis);
    }
    
    if (this.isAnthropicConfigured && anthropic.getAnthropicServiceStatus().isAvailable) {
      logger.info("Groq and OpenAI unavailable, falling back to Anthropic for LLM analysis");
      return await this.callAnthropicAnalysis(resumeAnalysis, jobAnalysis);
    }

    throw new Error("No AI providers available for LLM analysis");
  }

  /**
   * Call Groq for analysis
   */
  private async callGroqAnalysis(
    resumeAnalysis: AnalyzeResumeResponse,
    jobAnalysis: AnalyzeJobDescriptionResponse,
    resumeText?: string,
    jobText?: string,
  ): Promise<LLMAnalysisResult> {
    const response = await groq.analyzeMatch(resumeAnalysis, jobAnalysis, resumeText, jobText);
    const result = response.results?.[0];
    
    if (!result) {
      throw new Error("No results from Groq analysis");
    }

    return {
      matchPercentage: result.matchPercentage,
      matchedSkills: result.matchedSkills.map((s) => typeof s === 'string' ? s : s.skill),
      missingSkills: result.missingSkills,
      candidateStrengths: result.candidateStrengths,
      candidateWeaknesses: result.candidateWeaknesses,
      recommendations: result.recommendations,
      reasoning: "Groq AI analysis",
    };
  }

  /**
   * Call OpenAI for analysis
   */
  private async callOpenAIAnalysis(
    resumeAnalysis: AnalyzeResumeResponse,
    jobAnalysis: AnalyzeJobDescriptionResponse,
  ): Promise<LLMAnalysisResult> {
    const response = await openai.analyzeMatch(resumeAnalysis, jobAnalysis);
    const result = response.results?.[0];
    
    if (!result) {
      throw new Error("No results from OpenAI analysis");
    }

    return {
      matchPercentage: result.matchPercentage,
      matchedSkills: result.matchedSkills.map((s) => typeof s === 'string' ? s : s.skill),
      missingSkills: result.missingSkills,
      candidateStrengths: result.candidateStrengths,
      candidateWeaknesses: result.candidateWeaknesses,
      recommendations: result.recommendations,
      reasoning: "OpenAI analysis",
    };
  }

  /**
   * Call Anthropic for analysis
   */
  private async callAnthropicAnalysis(
    resumeAnalysis: AnalyzeResumeResponse,
    jobAnalysis: AnalyzeJobDescriptionResponse,
  ): Promise<LLMAnalysisResult> {
    const response = await anthropic.analyzeMatch(resumeAnalysis, jobAnalysis);
    const result = response.results?.[0];
    
    if (!result) {
      throw new Error("No results from Anthropic analysis");
    }

    return {
      matchPercentage: result.matchPercentage,
      matchedSkills: result.matchedSkills.map((s) => typeof s === 'string' ? s : s.skill),
      missingSkills: result.missingSkills,
      candidateStrengths: result.candidateStrengths,
      candidateWeaknesses: result.candidateWeaknesses,
      recommendations: result.recommendations,
      reasoning: "Anthropic analysis",
    };
  }

  /**
   * Blend ML and LLM results using confidence weighting
   */
  private blendResults(mlResult: any, llmResult: LLMAnalysisResult): HybridMatchResult {
    // Use ML confidence to weight the blending
    const mlWeight = mlResult.confidence;
    const llmWeight = 1 - mlWeight;

    // Blend match percentage
    const blendedMatchPercentage = Math.round(
      mlResult.totalScore * mlWeight + llmResult.matchPercentage * llmWeight
    );

    // Combine matched skills (deduplicate)
    const mlSkills = new Set(mlResult.skillBreakdown.filter((s: any) => s.matched).map((s: any) => s.skill));
    const llmSkills = new Set(llmResult.matchedSkills);
    const allMatchedSkills = Array.from(new Set([...mlSkills, ...llmSkills]));

    // Combine missing skills (deduplicate)
    const mlMissing = new Set(mlResult.skillBreakdown.filter((s: any) => !s.matched && s.required).map((s: any) => s.skill));
    const llmMissing = new Set(llmResult.missingSkills);
    const allMissingSkills = Array.from(new Set([...mlMissing, ...llmMissing]));

    // Combine insights
    const combinedStrengths = [...new Set([...mlResult.explanation.strengths, ...llmResult.candidateStrengths])];
    const combinedWeaknesses = [...new Set([...mlResult.explanation.weaknesses, ...llmResult.candidateWeaknesses])];
    const combinedRecommendations = [...new Set([...mlResult.explanation.recommendations, ...llmResult.recommendations])];

    return {
      matchPercentage: blendedMatchPercentage,
      matchedSkills: allMatchedSkills.map((skill) => ({
        skill: String(skill),
        matchPercentage: 85, // Average confidence
        category: "technical",
        importance: "important" as const,
        source: "semantic" as const,
      })),
      missingSkills: allMissingSkills.map(skill => String(skill)),
      candidateStrengths: combinedStrengths,
      candidateWeaknesses: combinedWeaknesses,
      recommendations: combinedRecommendations,
      confidenceLevel: blendedMatchPercentage > 80 ? "high" : blendedMatchPercentage > 60 ? "medium" : "low",
      scoringDimensions: {
        skills: mlResult.dimensionScores.skills,
        experience: mlResult.dimensionScores.experience,
        education: mlResult.dimensionScores.education,
        semantic: mlResult.dimensionScores.semantic,
        overall: blendedMatchPercentage,
      },
      analysisMethod: "hybrid" as const,
      confidence: (mlResult.confidence + (llmResult.matchPercentage / 100)) / 2,
    };
  }

  /**
   * Check if any AI provider is available
   */
  private isAIProviderAvailable(): boolean {
    return (
      (this.isGroqConfigured && groq.getGroqServiceStatus().isAvailable) ||
      openai.getOpenAIServiceStatus().isAvailable ||
      (this.isAnthropicConfigured && anthropic.getAnthropicServiceStatus().isAvailable)
    );
  }

  /**
   * Create fallback result when analysis fails
   */
  private createFallbackResult(
    resumeAnalysis: AnalyzeResumeResponse,
    jobAnalysis: AnalyzeJobDescriptionResponse,
  ): HybridMatchResult {
    logger.warn("Creating fallback match result due to analysis failure");

    return {
      matchPercentage: 50,
      matchedSkills: [],
      missingSkills: jobAnalysis.skills || [],
      candidateStrengths: ["Resume successfully processed"],
      candidateWeaknesses: ["Detailed analysis temporarily unavailable"],
      recommendations: ["Please try analyzing again"],
      confidenceLevel: "low",
      scoringDimensions: {
        skills: 50,
        experience: 50,
        education: 50,
        semantic: 50,
        overall: 50,
      },
      analysisMethod: "ml_only",
      confidence: 0.3,
    };
  }
}

/**
 * Factory function to create and use hybrid analyzer
 */
export async function analyzeMatchHybrid(
  resumeAnalysis: AnalyzeResumeResponse,
  jobAnalysis: AnalyzeJobDescriptionResponse,
  userTier: UserTierInfo,
  resumeText?: string,
  jobText?: string,
): Promise<HybridMatchResult> {
  const analyzer = new HybridMatchAnalyzer();
  return await analyzer.analyzeMatch(resumeAnalysis, jobAnalysis, userTier, resumeText, jobText);
}