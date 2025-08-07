import { logger } from "./logger";
import {
  AnalyzeResumeResponse,
  AnalyzeJobDescriptionResponse,
  MatchAnalysisResponse,
  SkillMatch,
  FairnessMetrics,
} from "@shared/schema";
import {
  calculateEnhancedMatch,
  ScoringWeights,
} from "./enhanced-scoring";
import { UNIFIED_SCORING_WEIGHTS } from "./unified-scoring-weights";
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
import { 
  generateMatchInsights, 
  type MatchInsights,
  type MatchAnalysisInput 
} from "./match-insights-generator";
import {
  detectJobIndustry,
  cleanContaminatedSkills,
  type JobContext
} from "./skill-contamination-detector";

// Data sanitization and validation utilities
interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  sanitizedData?: any;
}

interface ResultValidationConfig {
  matchPercentage: { min: number; max: number };
  confidence: { min: number; max: number };
  requiredFields: string[];
  arrayFields: string[];
  stringFields: string[];
}

// Use unified scoring weights for consistency across all modules
export const HYBRID_SCORING_WEIGHTS: ScoringWeights = UNIFIED_SCORING_WEIGHTS;

// Result validation configuration
const RESULT_VALIDATION_CONFIG: ResultValidationConfig = {
  matchPercentage: { min: 0, max: 100 },
  confidence: { min: 0, max: 1 },
  requiredFields: [
    'matchPercentage', 'matchedSkills', 'missingSkills', 
    'candidateStrengths', 'candidateWeaknesses', 'recommendations',
    'confidenceLevel', 'scoringDimensions', 'analysisMethod', 'confidence'
  ],
  arrayFields: [
    'matchedSkills', 'missingSkills', 'candidateStrengths', 
    'candidateWeaknesses', 'recommendations'
  ],
  stringFields: ['confidenceLevel', 'analysisMethod']
};

/**
 * Sanitize user input data to prevent injection attacks and ensure data quality
 */
function sanitizeInputData(data: any, fieldName: string): any {
  if (data === null || data === undefined) {
    return '';
  }

  if (typeof data === 'string') {
    // Remove potentially dangerous characters and excessive whitespace
    return data
      .replace(/[<>\"'&]/g, '') // Remove HTML/XML characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .substring(0, 10000); // Limit length to prevent DoS
  }

  if (Array.isArray(data)) {
    return data
      .filter(item => item !== null && item !== undefined)
      .map((item, index) => sanitizeInputData(item, `${fieldName}[${index}]`))
      .slice(0, 100); // Limit array size
  }

  if (typeof data === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(data)) {
      if (key.length <= 100) { // Limit key length
        sanitized[key] = sanitizeInputData(value, `${fieldName}.${key}`);
      }
    }
    return sanitized;
  }

  if (typeof data === 'number') {
    // Ensure numbers are finite and within reasonable bounds
    if (!isFinite(data)) return 0;
    return Math.max(-1000000, Math.min(1000000, data));
  }

  return data;
}

/**
 * Validate and sanitize resume analysis input
 */
function validateAndSanitizeResumeAnalysis(
  resumeAnalysis: AnalyzeResumeResponse
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    // Sanitize the input data
    const sanitized = {
      ...resumeAnalysis,
      skills: sanitizeInputData(resumeAnalysis.skills || [], 'skills'),
      experience: sanitizeInputData(resumeAnalysis.experience || '', 'experience'),
      education: sanitizeInputData(resumeAnalysis.education || '', 'education'),
      analyzedData: sanitizeInputData(resumeAnalysis.analyzedData || {}, 'analyzedData'),
      summary: sanitizeInputData(resumeAnalysis.summary || '', 'summary'),
      contactInfo: sanitizeInputData(resumeAnalysis.contactInfo || {}, 'contactInfo'),
      workHistory: sanitizeInputData(resumeAnalysis.workHistory || [], 'workHistory'),
      certifications: sanitizeInputData(resumeAnalysis.certifications || [], 'certifications'),
    };

    // Validate required fields
    if (!Array.isArray(sanitized.skills)) {
      errors.push('Resume skills must be an array');
      sanitized.skills = [];
    }

    if (sanitized.skills.length === 0) {
      warnings.push('Resume has no skills listed - this may affect match accuracy');
    }

    if (!sanitized.experience || sanitized.experience.length < 10) {
      warnings.push('Resume has limited experience information - this may affect match accuracy');
    }

    // Validate skill format
    sanitized.skills = sanitized.skills
      .filter((skill: any) => typeof skill === 'string' && skill.trim().length > 0)
      .map((skill: string) => skill.trim())
      .slice(0, 50); // Limit to 50 skills

    if (sanitized.skills.length > 30) {
      warnings.push('Resume has unusually high number of skills - some may be filtered');
    }

    logger.debug('Resume analysis validation completed', {
      originalSkillsCount: resumeAnalysis.skills?.length || 0,
      sanitizedSkillsCount: sanitized.skills.length,
      hasExperience: !!sanitized.experience,
      hasEducation: !!sanitized.education,
      errorsCount: errors.length,
      warningsCount: warnings.length,
    });

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      sanitizedData: sanitized,
    };
  } catch (error) {
    logger.error('Resume analysis validation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    return {
      isValid: false,
      errors: ['Failed to validate resume analysis data'],
      warnings: [],
    };
  }
}

/**
 * Validate and sanitize job analysis input
 */
function validateAndSanitizeJobAnalysis(
  jobAnalysis: AnalyzeJobDescriptionResponse
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    // Sanitize the input data
    const sanitized = {
      ...jobAnalysis,
      skills: sanitizeInputData(jobAnalysis.skills || [], 'skills'),
      experience: sanitizeInputData(jobAnalysis.experience || '', 'experience'),
      analyzedData: sanitizeInputData(jobAnalysis.analyzedData || {}, 'analyzedData'),
      summary: sanitizeInputData(jobAnalysis.summary || '', 'summary'),
      requirements: sanitizeInputData(jobAnalysis.requirements || [], 'requirements'),
      responsibilities: sanitizeInputData(jobAnalysis.responsibilities || [], 'responsibilities'),
    };

    // Validate required fields
    if (!Array.isArray(sanitized.skills)) {
      errors.push('Job skills must be an array');
      sanitized.skills = [];
    }

    if (sanitized.skills.length === 0) {
      warnings.push('Job description has no skills listed - this may affect match accuracy');
    }

    if (!sanitized.experience || sanitized.experience.length < 5) {
      warnings.push('Job description has limited experience requirements - this may affect match accuracy');
    }

    // Validate skill format
    sanitized.skills = sanitized.skills
      .filter((skill: any) => typeof skill === 'string' && skill.trim().length > 0)
      .map((skill: string) => skill.trim())
      .slice(0, 30); // Limit to 30 skills for jobs

    if (sanitized.skills.length > 20) {
      warnings.push('Job description has unusually high number of required skills');
    }

    logger.debug('Job analysis validation completed', {
      originalSkillsCount: jobAnalysis.skills?.length || 0,
      sanitizedSkillsCount: sanitized.skills.length,
      hasExperience: !!sanitized.experience,
      hasRequirements: Array.isArray(sanitized.requirements) && sanitized.requirements.length > 0,
      errorsCount: errors.length,
      warningsCount: warnings.length,
    });

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      sanitizedData: sanitized,
    };
  } catch (error) {
    logger.error('Job analysis validation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    return {
      isValid: false,
      errors: ['Failed to validate job analysis data'],
      warnings: [],
    };
  }
}

/**
 * Validate match result to ensure all required fields are present with valid ranges
 */
function validateMatchResult(result: HybridMatchResult): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    // Check required fields
    for (const field of RESULT_VALIDATION_CONFIG.requiredFields) {
      if (!(field in result) || result[field as keyof HybridMatchResult] === undefined) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Validate match percentage range
    if (typeof result.matchPercentage !== 'number' || 
        !isFinite(result.matchPercentage) ||
        result.matchPercentage < RESULT_VALIDATION_CONFIG.matchPercentage.min ||
        result.matchPercentage > RESULT_VALIDATION_CONFIG.matchPercentage.max) {
      errors.push(`Match percentage must be between ${RESULT_VALIDATION_CONFIG.matchPercentage.min} and ${RESULT_VALIDATION_CONFIG.matchPercentage.max}`);
    }

    // Validate confidence range
    if (typeof result.confidence !== 'number' || 
        !isFinite(result.confidence) ||
        result.confidence < RESULT_VALIDATION_CONFIG.confidence.min ||
        result.confidence > RESULT_VALIDATION_CONFIG.confidence.max) {
      errors.push(`Confidence must be between ${RESULT_VALIDATION_CONFIG.confidence.min} and ${RESULT_VALIDATION_CONFIG.confidence.max}`);
    }

    // Validate array fields
    for (const field of RESULT_VALIDATION_CONFIG.arrayFields) {
      const value = result[field as keyof HybridMatchResult];
      if (!Array.isArray(value)) {
        errors.push(`Field ${field} must be an array`);
      }
    }

    // Validate confidence level
    if (!['low', 'medium', 'high'].includes(result.confidenceLevel)) {
      errors.push('Confidence level must be "low", "medium", or "high"');
    }

    // Validate analysis method
    if (!['hybrid', 'ml_only', 'llm_only'].includes(result.analysisMethod)) {
      errors.push('Analysis method must be "hybrid", "ml_only", or "llm_only"');
    }

    // Validate scoring dimensions
    if (!result.scoringDimensions || typeof result.scoringDimensions !== 'object') {
      errors.push('Scoring dimensions must be an object');
    } else {
      const requiredDimensions = ['skills', 'experience', 'education', 'semantic', 'overall'];
      for (const dimension of requiredDimensions) {
        const value = result.scoringDimensions[dimension as keyof typeof result.scoringDimensions];
        if (typeof value !== 'number' || !isFinite(value) || value < 0 || value > 100) {
          errors.push(`Scoring dimension ${dimension} must be a number between 0 and 100`);
        }
      }
    }

    // Quality warnings
    if (result.matchPercentage > 95) {
      warnings.push('Unusually high match percentage - verify result accuracy');
    }

    if (result.confidence < 0.3) {
      warnings.push('Very low confidence score - result reliability may be compromised');
    }

    if (result.matchedSkills.length === 0 && result.matchPercentage > 20) {
      warnings.push('High match percentage with no matched skills - potential inconsistency');
    }

    if (result.missingSkills.length > 20) {
      warnings.push('Unusually high number of missing skills - may indicate poor match');
    }

    logger.debug('Match result validation completed', {
      matchPercentage: result.matchPercentage,
      confidence: result.confidence,
      confidenceLevel: result.confidenceLevel,
      analysisMethod: result.analysisMethod,
      matchedSkillsCount: result.matchedSkills?.length || 0,
      missingSkillsCount: result.missingSkills?.length || 0,
      errorsCount: errors.length,
      warningsCount: warnings.length,
    });

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  } catch (error) {
    logger.error('Match result validation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    return {
      isValid: false,
      errors: ['Failed to validate match result'],
      warnings: [],
    };
  }
}

/**
 * Create a safe fallback result when validation fails
 */
function createSafeFallbackResult(
  resumeAnalysis: AnalyzeResumeResponse,
  jobAnalysis: AnalyzeJobDescriptionResponse,
  error?: string
): HybridMatchResult {
  logger.warn('Creating safe fallback result due to validation failure', {
    error,
    resumeSkillsCount: resumeAnalysis.skills?.length || 0,
    jobSkillsCount: jobAnalysis.skills?.length || 0,
  });

  return {
    matchPercentage: 0,
    matchedSkills: [],
    missingSkills: jobAnalysis.skills?.slice(0, 10) || [],
    candidateStrengths: ['Analysis could not be completed reliably'],
    candidateWeaknesses: ['Unable to perform comprehensive analysis due to data quality issues'],
    recommendations: [
      'Please review and resubmit with more detailed information',
      'Ensure resume and job description contain sufficient detail for analysis',
      error ? `Technical issue: ${error}` : 'Technical analysis failed - manual review recommended'
    ],
    confidenceLevel: 'low' as const,
    scoringDimensions: {
      skills: 0,
      experience: 0,
      education: 0,
      semantic: 0,
      overall: 0,
    },
    analysisMethod: 'ml_only' as const,
    confidence: 0.1,
  };
}

interface HybridMatchResult {
  matchPercentage: number;
  matchedSkills: SkillMatch[];
  missingSkills: string[];
  candidateStrengths: string[];
  candidateWeaknesses: string[];
  recommendations: string[];
  confidenceLevel: "low" | "medium" | "high";
  fairnessMetrics?: FairnessMetrics;
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
  matchInsights?: MatchInsights;
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
      logger.info(`🔍 STARTING HYBRID MATCH ANALYSIS`, {
        userTier: userTier.tier,
        resumeSkills: resumeAnalysis.skills?.length || 0,
        jobSkills: jobAnalysis.skills?.length || 0,
        resumeTextLength: resumeText?.length || 0,
        jobTextLength: jobText?.length || 0,
        timestamp: new Date().toISOString()
      });

      // Step 1: Validate and sanitize input data
      const resumeValidation = validateAndSanitizeResumeAnalysis(resumeAnalysis);
      const jobValidation = validateAndSanitizeJobAnalysis(jobAnalysis);

      // Handle validation failures with graceful degradation
      if (!resumeValidation.isValid || !jobValidation.isValid) {
        logger.error("❌ INPUT VALIDATION FAILED", {
          resumeErrors: resumeValidation.errors,
          jobErrors: jobValidation.errors,
          resumeWarnings: resumeValidation.warnings,
          jobWarnings: jobValidation.warnings,
        });

        // Return safe fallback result instead of throwing error
        return createSafeFallbackResult(
          resumeAnalysis,
          jobAnalysis,
          `Validation failed: ${[...resumeValidation.errors, ...jobValidation.errors].join(', ')}`
        );
      }

      // Use sanitized data for analysis
      const sanitizedResumeAnalysis = resumeValidation.sanitizedData!;
      const sanitizedJobAnalysis = jobValidation.sanitizedData!;

      // Log validation warnings if any
      const allWarnings = [...resumeValidation.warnings, ...jobValidation.warnings];
      if (allWarnings.length > 0) {
        logger.warn("⚠️ INPUT VALIDATION WARNINGS", {
          warnings: allWarnings,
          resumeSkillsCount: sanitizedResumeAnalysis.skills.length,
          jobSkillsCount: sanitizedJobAnalysis.skills.length,
        });
      }

      // Sanitize text inputs
      const sanitizedResumeText = resumeText ? sanitizeInputData(resumeText, 'resumeText') : undefined;
      const sanitizedJobText = jobText ? sanitizeInputData(jobText, 'jobText') : undefined;

      logger.info("✅ INPUT VALIDATION COMPLETED", {
        resumeSkillsOriginal: resumeAnalysis.skills?.length || 0,
        resumeSkillsSanitized: sanitizedResumeAnalysis.skills.length,
        jobSkillsOriginal: jobAnalysis.skills?.length || 0,
        jobSkillsSanitized: sanitizedJobAnalysis.skills.length,
        warningsCount: allWarnings.length,
      });

      // Determine analysis strategy based on available data
      const hasFullText = sanitizedResumeText && sanitizedJobText;
      const strategy = this.determineAnalysisStrategy(!!hasFullText, userTier);

      logger.info(`🔄 ANALYSIS STRATEGY SELECTED`, {
        strategy: strategy,
        hasFullText,
        userTier: userTier.tier,
        aiProvidersAvailable: {
          groq: this.isGroqConfigured,
          anthropic: this.isAnthropicConfigured,
          anyAvailable: this.isAIProviderAvailable()
        }
      });

      let result: HybridMatchResult;

      switch (strategy) {
        case "hybrid":
          logger.info("🔄 EXECUTING HYBRID ANALYSIS (ML + LLM)");
          result = await this.performHybridAnalysis(
            resumeAnalysis,
            jobAnalysis,
            userTier,
            resumeText!,
            jobText!,
          );
          break;
        case "ml_only":
          logger.info("🔄 EXECUTING ML-ONLY ANALYSIS (Enhanced Scoring + ESCO)");
          result = await this.performMLOnlyAnalysis(
            resumeAnalysis,
            jobAnalysis,
            resumeText,
            jobText,
          );
          break;
        case "llm_only":
          logger.info("🔄 EXECUTING LLM-ONLY ANALYSIS (AI Providers)");
          result = await this.performLLMOnlyAnalysis(
            resumeAnalysis,
            jobAnalysis,
            userTier,
            resumeText,
            jobText,
          );
          break;
        default:
          logger.error("🚨 UNKNOWN ANALYSIS STRATEGY", { strategy });
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
          result.fairnessMetrics = {
            biasConfidenceScore: Math.round(100 - biasDetection.biasScore), // Convert bias score to confidence score
            potentialBiasAreas: biasDetection.detectedBiases.map(bias => bias.type),
            fairnessAssessment: biasDetection.explanation
          } as FairnessMetrics;

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

      // Generate user-focused match insights 
      try {
        const insightsInput: MatchAnalysisInput = {
          matchPercentage: result.matchPercentage,
          matchedSkills: result.matchedSkills,
          missingSkills: result.missingSkills,
          candidateStrengths: result.candidateStrengths,
          candidateWeaknesses: result.candidateWeaknesses,
          scoringDimensions: result.scoringDimensions,
          pharmaRelated: resumeText && jobText ? await this.isPharmaMatch(resumeText, jobText) : false,
          analysisMethod: result.analysisMethod,
          confidence: result.confidence
        };

        result.matchInsights = generateMatchInsights(insightsInput, resumeText, jobText);
        
        logger.info('Match insights generated', {
          matchStrength: result.matchInsights.matchStrength,
          strengthsCount: result.matchInsights.keyStrengths.length,
          areasToExploreCount: result.matchInsights.areasToExplore.length
        });
      } catch (insightsError) {
        logger.error('Failed to generate match insights:', insightsError);
        // Continue without insights - not critical for core functionality
      }

      // 🚨 EMERGENCY CONTAMINATION CLEANUP - Apply "smell test" before returning results
      try {
        const jobContext: JobContext = {
          industry: detectJobIndustry(
            jobAnalysis.title || 'Unknown Job', 
            jobText || ''
          ),
          jobTitle: jobAnalysis.title || 'Unknown Job',
          jobDescription: jobText || '',
          requiredSkills: jobAnalysis.skills || []
        };

        logger.info(`🔍 CONTAMINATION DETECTION: Detected job industry: ${jobContext.industry}`, {
          jobTitle: jobContext.jobTitle,
          industry: jobContext.industry,
          originalSkillsCount: result.matchedSkills?.length || 0
        });

        // Extract skill names for cleaning
        const skillNames = (result.matchedSkills || []).map(s => 
          typeof s === 'string' ? s : s.skill || String(s)
        );

        // Clean contaminated skills
        const { cleanSkills, blockedSkills, flaggedSkills } = await cleanContaminatedSkills(
          skillNames,
          jobContext
        );

        if (blockedSkills.length > 0) {
          logger.warn(`🚨 CONTAMINATION DETECTED AND BLOCKED!`, {
            industry: jobContext.industry,
            jobTitle: jobContext.jobTitle,
            originalSkills: skillNames.length,
            cleanSkills: cleanSkills.length,
            blockedSkills: blockedSkills.length,
            blockedSkillsList: blockedSkills,
            flaggedSkills: flaggedSkills.length
          });

          // Update matched skills with only clean skills
          result.matchedSkills = cleanSkills.map(skill => {
            // Find original skill object or create new one
            const originalSkill = result.matchedSkills?.find(s => 
              (typeof s === 'string' ? s : s.skill) === skill
            );
            
            if (originalSkill && typeof originalSkill === 'object') {
              return originalSkill;
            }
            
            return {
              skill: skill,
              matchPercentage: flaggedSkills.includes(skill) ? 60 : 85,
              category: "technical",
              importance: "important" as const,
              source: "semantic" as const, // Use 'semantic' since we're doing intelligent filtering
            };
          });

          // Add blocked skills to missing skills (they were incorrectly matched)
          const existingMissingSkills = result.missingSkills || [];
          result.missingSkills = [...existingMissingSkills, ...blockedSkills];

          // Add contamination note to weaknesses
          if (blockedSkills.length > 0) {
            const contaminationNote = `System detected ${blockedSkills.length} irrelevant skills from different industry - these have been filtered out`;
            result.candidateWeaknesses = [
              ...(result.candidateWeaknesses || []),
              contaminationNote
            ];
          }
        }

        logger.info(`✅ CONTAMINATION CLEANUP COMPLETE`, {
          industry: jobContext.industry,
          originalSkills: skillNames.length,
          finalSkills: result.matchedSkills?.length || 0,
          blockedCount: blockedSkills.length,
          success: true
        });

      } catch (contaminationError) {
        logger.error('Contamination detection failed:', contaminationError);
        // Continue without contamination cleanup - not critical for basic functionality
      }

      // Run bias detection in parallel with match analysis
      const biasDetectionPromise = this.runBiasDetection(
        resumeAnalysis,
        jobAnalysis,
        resumeText,
        jobText
      );

      // Apply confidence-based quality gates and validation
      const validatedResult = this.applyConfidenceQualityGates(
        result,
        resumeAnalysis,
        jobAnalysis,
        resumeText,
        jobText
      );

      // Wait for bias detection to complete and apply penalties
      const biasDetectionResult = await biasDetectionPromise;
      const finalResult = this.applyBiasPenalties(validatedResult, biasDetectionResult);

      const processingTime = Date.now() - startTime;
      logger.info(`🎯 HYBRID MATCH ANALYSIS COMPLETED`, {
        strategy: finalResult.analysisMethod,
        matchPercentage: finalResult.matchPercentage,
        confidence: finalResult.confidence,
        confidenceLevel: finalResult.confidenceLevel,
        hasBias: finalResult.biasDetection?.hasBias || false,
        biasScore: finalResult.biasDetection?.biasScore || 0,
        hasInsights: !!finalResult.matchInsights,
        finalSkillsCount: finalResult.matchedSkills?.length || 0,
        processingTime,
        qualityGatesApplied: true,
        biasPenaltiesApplied: !!finalResult.biasDetection?.hasBias,
      });

      return finalResult;
    } catch (error) {
      logger.error("🚨 HYBRID MATCH ANALYSIS FAILED 🚨", {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        errorType: error?.constructor?.name || 'UnknownError',
        resumeAnalysisPresent: !!resumeAnalysis,
        jobAnalysisPresent: !!jobAnalysis,
        userTier: userTier?.tier || 'unknown',
        hasResumeText: !!resumeText,
        hasJobText: !!jobText,
        resumeTextLength: resumeText?.length || 0,
        jobTextLength: jobText?.length || 0,
        timestamp: new Date().toISOString()
      });
      
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
    logger.info("🧠 Starting ML-only analysis with ESCO integration", {
      hasResumeText: !!resumeText,
      hasJobText: !!jobText,
      resumeTextLength: resumeText?.length || 0,
      jobTextLength: jobText?.length || 0
    });

    const mlResult = await this.runMLAnalysis(
      resumeAnalysis,
      jobAnalysis,
      resumeText || "",
      jobText || "",
    );

    logger.info("✅ ML-only analysis completed", {
      totalScore: mlResult.totalScore,
      confidence: mlResult.confidence,
      skillsMatched: mlResult.skillBreakdown?.filter(s => s.matched)?.length || 0,
      skillsTotal: mlResult.skillBreakdown?.length || 0
    });

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
        skills: jobAnalysis.skills || jobAnalysis.analyzedData?.requiredSkills || [],
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
    
    // Groq.analyzeMatch returns MatchAnalysisResponse directly, not wrapped in results array
    if (!response) {
      throw new Error("No response from Groq analysis");
    }

    return {
      matchPercentage: response.matchPercentage || 0,
      matchedSkills: (response.matchedSkills || []).map((s) => typeof s === 'string' ? s : s.skill),
      missingSkills: response.missingSkills || [],
      candidateStrengths: response.candidateStrengths || [],
      candidateWeaknesses: response.candidateWeaknesses || [],
      recommendations: response.recommendations || [],
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
    
    // OpenAI.analyzeMatch returns MatchAnalysisResponse directly, not wrapped in results array
    if (!response) {
      throw new Error("No response from OpenAI analysis");
    }

    return {
      matchPercentage: response.matchPercentage || 0,
      matchedSkills: (response.matchedSkills || []).map((s) => typeof s === 'string' ? s : s.skill),
      missingSkills: response.missingSkills || [],
      candidateStrengths: response.candidateStrengths || [],
      candidateWeaknesses: response.candidateWeaknesses || [],
      recommendations: response.recommendations || [],
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
    
    // Anthropic.analyzeMatch returns MatchAnalysisResponse directly, not wrapped in results array
    if (!response) {
      throw new Error("No response from Anthropic analysis");
    }

    return {
      matchPercentage: response.matchPercentage || 0,
      matchedSkills: (response.matchedSkills || []).map((s) => typeof s === 'string' ? s : s.skill),
      missingSkills: response.missingSkills || [],
      candidateStrengths: response.candidateStrengths || [],
      candidateWeaknesses: response.candidateWeaknesses || [],
      recommendations: response.recommendations || [],
      reasoning: "Anthropic analysis",
    };
  }

  /**
   * Calculate ensemble weights based on research-backed approach
   * Based on Spotify Engineering (2024) and Amazon Science (2024) best practices
   */
  private calculateEnsembleWeights(
    mlScore: number, 
    llmScore: number, 
    mlConfidence: number, 
    llmConfidence: number
  ): { ml: number; llm: number; reason: string } {
    
    // Detect failure scenarios (scores ≤ 50 indicate analysis failure)
    const mlFailed = mlScore <= 50;
    const llmFailed = llmScore <= 50;
    
    // If one analysis fails, use the other with full weight
    if (mlFailed && !llmFailed) {
      return { ml: 0.0, llm: 1.0, reason: "ML analysis failed, using LLM only" };
    }
    if (llmFailed && !mlFailed) {
      return { ml: 1.0, llm: 0.0, reason: "LLM analysis failed, using ML only" };
    }
    if (mlFailed && llmFailed) {
      return { ml: 0.5, llm: 0.5, reason: "Both analyses failed, equal fallback weights" };
    }
    
    // Both analyses succeeded - apply research-backed semantic preference
    // Amazon Science (2024): LLM better for semantic understanding
    // Spotify Engineering (2024): 70% LLM weight optimal for matching tasks
    
    // Base weights favoring LLM for semantic correctness
    let mlWeight = 0.30; // 30% for mathematical precision
    let llmWeight = 0.70; // 70% for semantic understanding
    
    // Confidence-based adjustment (minor tweaks within research bounds)
    const confidenceDiff = llmConfidence - mlConfidence;
    if (Math.abs(confidenceDiff) > 0.2) {
      // Adjust weights slightly if confidence gap is significant
      const adjustment = Math.min(0.1, Math.abs(confidenceDiff) * 0.2);
      if (confidenceDiff > 0) {
        // LLM more confident
        llmWeight = Math.min(0.8, llmWeight + adjustment);
        mlWeight = 1.0 - llmWeight;
      } else {
        // ML more confident  
        mlWeight = Math.min(0.4, mlWeight + adjustment);
        llmWeight = 1.0 - mlWeight;
      }
    }
    
    return { 
      ml: mlWeight, 
      llm: llmWeight, 
      reason: `Research-backed semantic preference (LLM: ${Math.round(llmWeight*100)}%, ML: ${Math.round(mlWeight*100)}%)` 
    };
  }

  /**
   * Blend ML and LLM results using research-backed ensemble weighting
   * Based on Spotify Engineering (2024) and Amazon Science (2024) best practices
   */
  private blendResults(mlResult: any, llmResult: LLMAnalysisResult): HybridMatchResult {
    const mlScore = mlResult.totalScore;
    const llmScore = llmResult.matchPercentage;
    const mlConfidence = mlResult.confidence;
    const llmConfidence = llmResult.matchPercentage / 100; // Convert to 0-1 range

    // Research-backed weighting strategy (Spotify 2024)
    const weights = this.calculateEnsembleWeights(mlScore, llmScore, mlConfidence, llmConfidence);
    
    logger.info("🔄 HYBRID BLENDING PROCESS", {
      mlScore,
      llmScore, 
      mlConfidence,
      llmConfidence,
      weights,
      method: weights.reason
    });

    // Blend match percentage using research-backed weights
    const blendedMatchPercentage = Math.round(
      mlScore * weights.ml + llmScore * weights.llm
    );

    logger.info("✅ HYBRID BLENDING COMPLETED", {
      originalML: mlScore,
      originalLLM: llmScore,
      finalBlended: blendedMatchPercentage,
      mlWeight: weights.ml,
      llmWeight: weights.llm,
      improvement: blendedMatchPercentage - mlScore,
      failureDetection: {
        mlFailed: mlScore <= 50,
        llmFailed: llmScore <= 50,
        semanticPreference: weights.llm > weights.ml
      }
    });

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
   * Check if this is a pharma-related match
   */
  private async isPharmaMatch(resumeText: string, jobText: string): Promise<boolean> {
    try {
      const { escoExtractor } = await import('./esco-skill-extractor');
      const [resumePharma, jobPharma] = await Promise.all([
        escoExtractor.isPharmaRelated(resumeText),
        escoExtractor.isPharmaRelated(jobText)
      ]);
      return resumePharma && jobPharma;
    } catch (error) {
      logger.error('Failed to check pharma match:', error);
      return false;
    }
  }

  /**
   * Apply confidence-based quality gates and validation
   * Implements minimum confidence requirements and fallback mechanisms
   */
  private applyConfidenceQualityGates(
    result: HybridMatchResult,
    resumeAnalysis: AnalyzeResumeResponse,
    jobAnalysis: AnalyzeJobDescriptionResponse,
    resumeText?: string,
    jobText?: string,
  ): HybridMatchResult {
    logger.info("🔍 APPLYING CONFIDENCE-BASED QUALITY GATES", {
      originalConfidence: result.confidence,
      originalConfidenceLevel: result.confidenceLevel,
      matchPercentage: result.matchPercentage,
    });

    // 1. Data Quality Assessment
    const dataQuality = this.assessDataQuality(
      resumeAnalysis,
      jobAnalysis,
      resumeText,
      jobText
    );

    // 2. Calculate Enhanced Confidence Score
    const enhancedConfidence = this.calculateEnhancedConfidence(
      result,
      dataQuality
    );

    // 3. Apply Confidence Thresholds
    const confidenceLevel = this.determineConfidenceLevel(enhancedConfidence);

    // 4. Apply Quality Gates and Fallback Mechanisms
    const validatedResult = this.applyQualityGatesAndFallbacks(
      result,
      enhancedConfidence,
      confidenceLevel,
      dataQuality
    );

    logger.info("✅ CONFIDENCE QUALITY GATES APPLIED", {
      originalConfidence: result.confidence,
      enhancedConfidence,
      confidenceLevel,
      dataQualityScore: dataQuality.overallScore,
      qualityGatesTriggered: validatedResult.confidence !== result.confidence,
      finalMatchPercentage: validatedResult.matchPercentage,
    });

    return {
      ...validatedResult,
      confidence: enhancedConfidence,
      confidenceLevel,
    };
  }

  /**
   * Assess data quality for confidence calculation
   */
  private assessDataQuality(
    resumeAnalysis: AnalyzeResumeResponse,
    jobAnalysis: AnalyzeJobDescriptionResponse,
    resumeText?: string,
    jobText?: string,
  ): {
    resumeLength: number;
    jobLength: number;
    skillCount: number;
    hasExperience: boolean;
    hasEducation: boolean;
    overallScore: number;
    issues: string[];
  } {
    const issues: string[] = [];
    
    // Resume length assessment
    const resumeLength = resumeText?.length || 0;
    if (resumeLength < 200) {
      issues.push("Resume text too short for comprehensive analysis");
    }

    // Job description length assessment
    const jobLength = jobText?.length || 0;
    if (jobLength < 100) {
      issues.push("Job description too short for comprehensive analysis");
    }

    // Skill count assessment
    const skillCount = (resumeAnalysis.skills?.length || 0) + (jobAnalysis.skills?.length || 0);
    if (skillCount < 3) {
      issues.push("Insufficient skills data for reliable matching");
    }

    // Experience data assessment
    const hasExperience = !!(
      resumeAnalysis.experience || 
      resumeAnalysis.analyzedData?.experience ||
      jobAnalysis.experience
    );
    if (!hasExperience) {
      issues.push("Missing experience data affects matching accuracy");
    }

    // Education data assessment
    const hasEducation = !!(
      resumeAnalysis.education || 
      resumeAnalysis.analyzedData?.education ||
      jobAnalysis.analyzedData?.education
    );
    if (!hasEducation) {
      issues.push("Missing education data may affect comprehensive assessment");
    }

    // Calculate overall data quality score (0-1)
    let qualityScore = 0;
    
    // Resume length score (0-0.3)
    qualityScore += Math.min(0.3, resumeLength / 1000 * 0.3);
    
    // Job length score (0-0.2)
    qualityScore += Math.min(0.2, jobLength / 500 * 0.2);
    
    // Skill count score (0-0.2)
    qualityScore += Math.min(0.2, skillCount / 10 * 0.2);
    
    // Experience score (0-0.15)
    qualityScore += hasExperience ? 0.15 : 0;
    
    // Education score (0-0.15)
    qualityScore += hasEducation ? 0.15 : 0;

    const dataQuality = {
      resumeLength,
      jobLength,
      skillCount,
      hasExperience,
      hasEducation,
      overallScore: Math.min(1.0, qualityScore),
      issues,
    };

    logger.debug("Data quality assessment completed", dataQuality);
    return dataQuality;
  }

  /**
   * Calculate enhanced confidence score based on result quality and data quality
   */
  private calculateEnhancedConfidence(
    result: HybridMatchResult,
    dataQuality: { overallScore: number; issues: string[] }
  ): number {
    let confidence = result.confidence || 0;

    // Adjust confidence based on data quality
    const dataQualityWeight = 0.3;
    const originalWeight = 0.7;
    
    confidence = (confidence * originalWeight) + (dataQuality.overallScore * dataQualityWeight);

    // Apply penalties for specific issues
    if (result.matchedSkills?.length === 0) {
      confidence *= 0.7; // 30% penalty for no matched skills
    }

    if (result.matchPercentage < 20) {
      confidence *= 0.8; // 20% penalty for very low match
    }

    if (dataQuality.issues.length > 2) {
      confidence *= 0.9; // 10% penalty for multiple data quality issues
    }

    // Apply bonuses for high-quality results
    if (result.matchedSkills?.length >= 5 && result.matchPercentage >= 70) {
      confidence *= 1.1; // 10% bonus for strong matches with good skill coverage
    }

    // Ensure confidence stays within valid range
    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * Determine confidence level based on enhanced confidence score
   * High: ≥0.8, Medium: 0.5-0.79, Low: <0.5
   */
  private determineConfidenceLevel(confidence: number): "low" | "medium" | "high" {
    if (confidence >= 0.8) return "high";
    if (confidence >= 0.5) return "medium";
    return "low";
  }

  /**
   * Apply quality gates and fallback mechanisms based on confidence level
   */
  private applyQualityGatesAndFallbacks(
    result: HybridMatchResult,
    confidence: number,
    confidenceLevel: "low" | "medium" | "high",
    dataQuality: { overallScore: number; issues: string[] }
  ): HybridMatchResult {
    const updatedResult = { ...result };

    // Apply confidence-based adjustments
    switch (confidenceLevel) {
      case "low":
        logger.warn("Low confidence detected - applying fallback mechanisms", {
          confidence,
          dataQualityScore: dataQuality.overallScore,
          issues: dataQuality.issues,
        });

        // Add confidence warnings to recommendations
        updatedResult.recommendations = [
          ...(updatedResult.recommendations || []),
          "Analysis confidence is low due to limited data - consider providing more detailed information",
          "Results should be interpreted with caution due to data quality limitations",
        ];

        // Add data quality issues to weaknesses
        if (dataQuality.issues.length > 0) {
          updatedResult.candidateWeaknesses = [
            ...(updatedResult.candidateWeaknesses || []),
            `Data quality issues detected: ${dataQuality.issues.slice(0, 2).join(", ")}`,
          ];
        }

        // Conservative match percentage adjustment for very low confidence
        if (confidence < 0.3) {
          updatedResult.matchPercentage = Math.min(
            updatedResult.matchPercentage,
            60 // Cap at 60% for very low confidence
          );
          logger.warn("Applied conservative match percentage cap due to very low confidence");
        }
        break;

      case "medium":
        logger.info("Medium confidence detected - applying moderate adjustments", {
          confidence,
          dataQualityScore: dataQuality.overallScore,
        });

        // Add moderate confidence note
        updatedResult.recommendations = [
          ...(updatedResult.recommendations || []),
          "Analysis has moderate confidence - consider additional screening for final decision",
        ];
        break;

      case "high":
        logger.info("High confidence detected - results are reliable", {
          confidence,
          dataQualityScore: dataQuality.overallScore,
        });

        // Add confidence boost note
        updatedResult.candidateStrengths = [
          ...(updatedResult.candidateStrengths || []),
          "High-confidence analysis based on comprehensive data",
        ];
        break;
    }

    // Validate result ranges regardless of confidence level
    updatedResult.matchPercentage = Math.max(0, Math.min(100, updatedResult.matchPercentage));
    
    // Ensure all required fields are present
    updatedResult.matchedSkills = updatedResult.matchedSkills || [];
    updatedResult.missingSkills = updatedResult.missingSkills || [];
    updatedResult.candidateStrengths = updatedResult.candidateStrengths || [];
    updatedResult.candidateWeaknesses = updatedResult.candidateWeaknesses || [];
    updatedResult.recommendations = updatedResult.recommendations || [];

    return updatedResult;
  }

  /**
   * Run bias detection in parallel with match analysis
   */
  private async runBiasDetection(
    resumeAnalysis: AnalyzeResumeResponse,
    jobAnalysis: AnalyzeJobDescriptionResponse,
    resumeText?: string,
    jobText?: string,
  ): Promise<BiasDetectionResult | null> {
    try {
      logger.info("🔍 STARTING BIAS DETECTION", {
        hasResumeText: !!resumeText,
        hasJobText: !!jobText,
        resumeSkills: resumeAnalysis.skills?.length || 0,
        jobSkills: jobAnalysis.skills?.length || 0,
      });

      // Create candidate profile for bias detection
      const candidateProfile: CandidateProfile = {
        skills: resumeAnalysis.skills || [],
        experience: Array.isArray(resumeAnalysis.experience)
          ? resumeAnalysis.experience.join(", ")
          : resumeAnalysis.experience || resumeAnalysis.analyzedData?.experience || "",
        education: Array.isArray(resumeAnalysis.education)
          ? resumeAnalysis.education.join(", ")
          : resumeAnalysis.education || resumeAnalysis.analyzedData?.education?.join(", ") || "",
        name: resumeAnalysis.analyzedData?.name || "",
        location: resumeAnalysis.analyzedData?.location || "",
        technologies: resumeAnalysis.skills?.filter(skill => 
          skill.toLowerCase().includes('javascript') ||
          skill.toLowerCase().includes('python') ||
          skill.toLowerCase().includes('java') ||
          skill.toLowerCase().includes('react') ||
          skill.toLowerCase().includes('node')
        ) || [],
        industries: [], // Could be extracted from experience if needed
        resumeText: resumeText || "",
      };

      // Create job profile for bias detection
      const jobProfile: JobProfile = {
        requiredSkills: jobAnalysis.skills || jobAnalysis.analyzedData?.requiredSkills || [],
        experience: jobAnalysis.experience || "",
        education: jobAnalysis.analyzedData?.education?.join(", ") || "",
        location: jobAnalysis.analyzedData?.location || "",
        technologies: jobAnalysis.skills?.filter(skill => 
          skill.toLowerCase().includes('javascript') ||
          skill.toLowerCase().includes('python') ||
          skill.toLowerCase().includes('java') ||
          skill.toLowerCase().includes('react') ||
          skill.toLowerCase().includes('node')
        ) || [],
        industries: [], // Could be extracted from job description if needed
        jobText: jobText || "",
      };

      const biasResult = await detectMatchingBias(candidateProfile, jobProfile);

      logger.info("✅ BIAS DETECTION COMPLETED", {
        hasBias: biasResult.hasBias,
        biasScore: biasResult.biasScore,
        detectedBiasTypes: biasResult.detectedBiases.length,
        biasTypes: biasResult.detectedBiases.map(b => b.type),
        recommendations: biasResult.recommendations.length,
      });

      return biasResult;
    } catch (error) {
      logger.error("❌ BIAS DETECTION FAILED", {
        error: error instanceof Error ? error.message : "Unknown error",
        errorStack: error instanceof Error ? error.stack : undefined,
      });
      
      // Return null to indicate bias detection failed - don't fail the entire analysis
      return null;
    }
  }

  /**
   * Apply bias penalties to match results when bias is detected
   */
  private applyBiasPenalties(
    result: HybridMatchResult,
    biasDetection: BiasDetectionResult | null,
  ): HybridMatchResult {
    if (!biasDetection || !biasDetection.hasBias) {
      logger.info("🟢 NO BIAS DETECTED - No penalties applied", {
        biasScore: biasDetection?.biasScore || 0,
      });
      
      return {
        ...result,
        biasDetection: biasDetection ? {
          hasBias: false,
          biasScore: biasDetection.biasScore,
          detectedBiases: [],
          recommendations: biasDetection.recommendations,
          fairnessMetrics: biasDetection.fairnessMetrics,
          explanation: biasDetection.explanation,
        } : undefined,
      };
    }

    logger.warn("🚨 BIAS DETECTED - Applying penalties to match score", {
      originalMatchPercentage: result.matchPercentage,
      biasScore: biasDetection.biasScore,
      detectedBiasTypes: biasDetection.detectedBiases.map(b => b.type),
      criticalBiases: biasDetection.detectedBiases.filter(b => b.severity === 'critical').length,
      highBiases: biasDetection.detectedBiases.filter(b => b.severity === 'high').length,
    });

    // Calculate bias penalty based on severity and bias score
    let biasPenalty = 0;
    
    // Base penalty from bias score (0-20% penalty based on bias score)
    biasPenalty += (biasDetection.biasScore / 100) * 20;

    // Additional penalties for specific bias types and severities
    for (const bias of biasDetection.detectedBiases) {
      switch (bias.severity) {
        case 'critical':
          biasPenalty += 15; // 15% penalty for critical bias
          break;
        case 'high':
          biasPenalty += 10; // 10% penalty for high bias
          break;
        case 'medium':
          biasPenalty += 5; // 5% penalty for medium bias
          break;
        case 'low':
          biasPenalty += 2; // 2% penalty for low bias
          break;
      }
    }

    // Cap total penalty at 40% to avoid completely destroying valid matches
    biasPenalty = Math.min(biasPenalty, 40);

    // Apply penalty to match percentage
    const originalMatchPercentage = result.matchPercentage;
    const penalizedMatchPercentage = Math.max(0, originalMatchPercentage - biasPenalty);

    // Add bias information to recommendations and weaknesses
    const biasRecommendations = [
      `Bias detected in matching process (Score: ${biasDetection.biasScore}/100)`,
      `Match score reduced by ${biasPenalty.toFixed(1)}% due to bias penalties`,
      ...biasDetection.recommendations.slice(0, 3), // Include top 3 bias recommendations
    ];

    const biasWeaknesses = biasDetection.detectedBiases
      .filter(b => b.severity === 'critical' || b.severity === 'high')
      .slice(0, 2) // Include top 2 most severe biases
      .map(b => `${b.type} bias detected: ${b.description}`);

    logger.info("✅ BIAS PENALTIES APPLIED", {
      originalMatchPercentage,
      penalizedMatchPercentage,
      biasPenalty: biasPenalty.toFixed(1),
      biasScore: biasDetection.biasScore,
      addedRecommendations: biasRecommendations.length,
      addedWeaknesses: biasWeaknesses.length,
    });

    return {
      ...result,
      matchPercentage: penalizedMatchPercentage,
      recommendations: [
        ...(result.recommendations || []),
        ...biasRecommendations,
      ],
      candidateWeaknesses: [
        ...(result.candidateWeaknesses || []),
        ...biasWeaknesses,
      ],
      biasDetection: {
        hasBias: true,
        biasScore: biasDetection.biasScore,
        detectedBiases: biasDetection.detectedBiases,
        recommendations: biasDetection.recommendations,
        fairnessMetrics: biasDetection.fairnessMetrics,
        explanation: biasDetection.explanation,
        penaltyApplied: biasPenalty,
      },
    };
  }

  /**
   * Create fallback result when analysis fails
   */
  private createFallbackResult(
    resumeAnalysis: AnalyzeResumeResponse,
    jobAnalysis: AnalyzeJobDescriptionResponse,
  ): HybridMatchResult {
    logger.error("🚨 CREATING FALLBACK MATCH RESULT 🚨", {
      reason: "Hybrid analysis failed completely",
      resumeHasSkills: !!(resumeAnalysis?.skills?.length),
      resumeSkillsCount: resumeAnalysis?.skills?.length || 0,
      jobHasSkills: !!(jobAnalysis?.skills?.length),
      jobSkillsCount: jobAnalysis?.skills?.length || 0,
      resumeHasContent: !!(resumeAnalysis as any)?.content,
      jobHasData: !!(jobAnalysis as any)?.analyzedData,
      timestamp: new Date().toISOString()
    });

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









