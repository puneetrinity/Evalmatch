/**
 * Analysis Legacy Transformer
 * 
 * Transforms AnalysisService results to legacy response format for backward compatibility.
 * This enables internal migration to AnalysisService while preserving existing client contracts.
 * 
 * @module AnalysisLegacyTransformer
 */

import { logger } from '../lib/logger';
import type { 
  BatchAnalysisResult
} from '../services/analysis-service';
import type { Result } from '../../shared/result-types';

// ===== LEGACY RESPONSE TYPES =====

/**
 * Legacy batch analysis response format (from routes-legacy.ts)
 */
export interface LegacyBatchAnalysisResponse {
  /** Job description ID that was analyzed */
  jobDescriptionId: number;
  /** Job title */
  jobTitle: string;
  /** Analysis results for each resume */
  results: Array<{
    resumeId: number;
    filename: string;
    candidateName: string;
    /** Legacy match analysis structure */
    match: {
      matchPercentage: number | null;
      matchedSkills: Array<{ skill: string; category?: string; confidence?: number }>;
      missingSkills: string[];
      candidateStrengths: string[];
      candidateWeaknesses: string[];
      confidenceLevel: 'low' | 'medium' | 'high';
      fairnessMetrics?: any;
      [key: string]: any; // Allow additional legacy fields
    };
    analysisId: number | null;
  }>;
}

/**
 * Legacy single analysis response format
 */
export interface LegacySingleAnalysisResponse {
  resumeId: number;
  filename: string;
  candidateName: string;
  match: {
    matchPercentage: number | null;
    matchedSkills: Array<{ skill: string; category?: string; confidence?: number }>;
    missingSkills: string[];
    candidateStrengths: string[];
    candidateWeaknesses: string[];
    confidenceLevel: 'low' | 'medium' | 'high';
    fairnessMetrics?: any;
    [key: string]: any;
  };
  analysisId: number | null;
}

/**
 * Legacy bias analysis response format (from routes-legacy.ts)
 */
export interface LegacyBiasAnalysisResponse {
  jobId: number;
  biasAnalysis: {
    hasBias?: boolean;
    overallScore?: number;
    biasTypes?: Array<{ type: string; description: string; severity: string }>;
    suggestions?: string[];
    fairnessAssessment?: string;
    [key: string]: any; // Allow additional legacy fields
  };
}

// ===== TRANSFORMATION FUNCTIONS =====

/**
 * Transform BatchAnalysisResult to legacy batch response format
 * 
 * @param serviceResult - AnalysisService batch result (success case)
 * @param jobTitle - Job title for legacy response
 * @returns Legacy-formatted batch analysis response
 */
export function toLegacyBatchResponse(
  serviceResult: Result<BatchAnalysisResult, Error> & { success: true },
  jobTitle: string
): LegacyBatchAnalysisResponse {
  const { data } = serviceResult;
  
  logger.debug('Transforming AnalysisService result to legacy format', {
    analysisId: data.analysisId,
    jobId: data.jobId,
    resultCount: data.results.length
  });

  // Transform each analysis result to legacy format
  const legacyResults = data.results.map(result => ({
    resumeId: result.resumeId,
    filename: result.filename,
    candidateName: result.candidateName,
    match: {
      matchPercentage: result.matchPercentage,
      matchedSkills: result.matchedSkills || [], // SkillMatch[] -> legacy format
      missingSkills: result.missingSkills || [],
      candidateStrengths: result.candidateStrengths || [],
      candidateWeaknesses: result.candidateWeaknesses || [],
      confidenceLevel: result.confidenceLevel || 'medium',
      // Preserve any additional fields that might exist
      recommendations: result.recommendations
    },
    analysisId: result.analysisId
  }));

  // Sort by match percentage (descending) - preserve legacy behavior
  legacyResults.sort((a: any, b: any) => 
    (b.match?.matchPercentage || 0) - (a.match?.matchPercentage || 0)
  );

  return {
    jobDescriptionId: data.jobId,
    jobTitle: jobTitle,
    results: legacyResults
  };
}

/**
 * Transform SingleAnalysisResult to legacy single response format
 * 
 * @param serviceResult - AnalysisService single result (success case)
 * @returns Legacy-formatted single analysis response
 */
export function toLegacySingleResponse(
  serviceResult: Result<any, Error> & { success: true } // Use any for now since interface is evolving
): LegacySingleAnalysisResponse {
  const { data } = serviceResult;
  
  logger.debug('Transforming single AnalysisService result to legacy format', {
    resumeId: data.resumeId,
    matchPercentage: data.match?.matchPercentage || data.matchPercentage
  });

  return {
    resumeId: data.resumeId,
    filename: data.filename || `resume-${data.resumeId}.pdf`,
    candidateName: data.candidateName || 'Unknown',
    match: {
      matchPercentage: data.match?.matchPercentage || data.matchPercentage || null,
      matchedSkills: data.match?.matchedSkills || data.matchedSkills || [],
      missingSkills: data.match?.missingSkills || data.missingSkills || [],
      candidateStrengths: data.match?.candidateStrengths || data.candidateStrengths || [],
      candidateWeaknesses: data.match?.candidateWeaknesses || data.candidateWeaknesses || [],
      confidenceLevel: data.match?.confidenceLevel || data.confidenceLevel || 'medium',
      recommendations: data.recommendations || []
    },
    analysisId: data.analysisId || null
  };
}

/**
 * Transform AnalysisService bias analysis result to legacy bias response format
 * 
 * @param serviceResult - AnalysisService bias result (success case)
 * @returns Legacy-formatted bias analysis response
 */
export function toLegacyBiasResponse(
  serviceResult: Result<any, Error> & { success: true }
): LegacyBiasAnalysisResponse {
  const { data } = serviceResult;
  
  logger.debug('Transforming AnalysisService bias result to legacy format', {
    jobId: data.jobId,
    hasBias: data.biasAnalysis?.hasBias,
    overallScore: data.overallBiasScore || data.biasAnalysis?.overallScore
  });

  return {
    jobId: data.jobId,
    biasAnalysis: {
      hasBias: data.biasAnalysis?.hasBias,
      overallScore: data.overallBiasScore || data.biasAnalysis?.overallScore,
      biasTypes: data.biasAnalysis?.biasTypes || [],
      suggestions: data.suggestions || data.biasAnalysis?.suggestions || [],
      fairnessAssessment: data.biasAnalysis?.fairnessAssessment || 'No bias detected',
      // Preserve any additional fields that might exist (but don't override the above)
      ...(data.biasAnalysis ? Object.fromEntries(
        Object.entries(data.biasAnalysis).filter(([key]) => 
          !['hasBias', 'overallScore', 'biasTypes', 'suggestions', 'fairnessAssessment'].includes(key)
        )
      ) : {})
    }
  };
}

/**
 * Transform direct text analysis result to legacy response format
 * 
 * @param serviceResult - AnalysisService text analysis result (success case)
 * @returns Legacy-formatted direct analysis response (passthrough of match data)
 */
export function toLegacyDirectResponse(
  serviceResult: Result<any, Error> & { success: true }
): any {
  const { data } = serviceResult;
  
  logger.debug('Transforming direct text AnalysisService result to legacy format', {
    matchPercentage: data.matchPercentage,
    skillCount: data.matchedSkills?.length || 0
  });

  // Direct text analysis response is already in the correct format
  // Just return the data as-is since it matches the legacy structure
  return {
    matchPercentage: data.matchPercentage !== undefined ? data.matchPercentage : null,
    matchedSkills: data.matchedSkills || [],
    missingSkills: data.missingSkills || [],
    candidateStrengths: data.candidateStrengths || [],
    candidateWeaknesses: data.candidateWeaknesses || [],
    confidenceLevel: data.confidenceLevel || 'medium',
    recommendations: data.recommendations || [],
    // Preserve any additional fields that might exist
    ...(data.fairnessMetrics ? { fairnessMetrics: data.fairnessMetrics } : {})
  };
}

/**
 * Transform error result to legacy error response
 * 
 * @param serviceResult - Failed AnalysisService result 
 * @param context - Additional context for error logging
 * @returns Legacy error structure
 */
export function toLegacyErrorResponse(
  serviceResult: Result<any, Error> & { success: false },
  context: { operation: string; userId?: string; jobId?: number }
): { error: string; code?: string } {
  const { error } = serviceResult;
  
  logger.error('AnalysisService error transformed to legacy format', {
    ...context,
    error: error.message,
    errorName: error.name
  });

  return {
    error: error.message,
    code: error.name || 'ANALYSIS_ERROR'
  };
}

// ===== DEVELOPMENT & DEBUG UTILITIES =====

/**
 * Compare legacy and service responses for parity testing
 * Used during migration to validate transformation accuracy
 */
export interface ResponseComparison {
  /** Whether responses are equivalent within tolerance */
  isEquivalent: boolean;
  /** Match percentage difference (absolute) */
  matchPercentageDelta?: number;
  /** Skill differences */
  skillDifferences?: {
    matchedSkillsDelta: number;
    missingSkillsDelta: number;
  };
  /** Field mismatches */
  fieldMismatches?: string[];
}

/**
 * Compare transformed result with original legacy result for testing
 * 
 * @param legacyResponse - Original legacy response
 * @param transformedResponse - Transformed AnalysisService response
 * @param tolerances - Comparison tolerances
 * @returns Comparison result with detailed differences
 */
export function compareResponses(
  legacyResponse: LegacyBatchAnalysisResponse,
  transformedResponse: LegacyBatchAnalysisResponse,
  tolerances: {
    matchPercentage: number; // e.g., 0.5 for ±0.5%
    skillCountDelta: number; // e.g., 2 for ±2 skills
  } = { matchPercentage: 0.5, skillCountDelta: 2 }
): ResponseComparison {
  const mismatches: string[] = [];
  let maxMatchDelta = 0;
  let maxSkillDelta = 0;

  // Compare structure
  if (legacyResponse.jobDescriptionId !== transformedResponse.jobDescriptionId) {
    mismatches.push('jobDescriptionId');
  }
  
  if (legacyResponse.results.length !== transformedResponse.results.length) {
    mismatches.push(`resultCount (${legacyResponse.results.length} vs ${transformedResponse.results.length})`);
  }

  // Compare each result
  const minLength = Math.min(legacyResponse.results.length, transformedResponse.results.length);
  for (let i = 0; i < minLength; i++) {
    const legacy = legacyResponse.results[i];
    const transformed = transformedResponse.results[i];

    // Match percentage comparison
    const legacyMatch = legacy.match.matchPercentage || 0;
    const transformedMatch = transformed.match.matchPercentage || 0;
    const matchDelta = Math.abs(legacyMatch - transformedMatch);
    maxMatchDelta = Math.max(maxMatchDelta, matchDelta);

    if (matchDelta > tolerances.matchPercentage) {
      mismatches.push(`result[${i}].matchPercentage (${legacyMatch} vs ${transformedMatch}, delta: ${matchDelta})`);
    }

    // Skills comparison
    const legacyMatchedCount = legacy.match.matchedSkills?.length || 0;
    const transformedMatchedCount = transformed.match.matchedSkills?.length || 0;
    const skillDelta = Math.abs(legacyMatchedCount - transformedMatchedCount);
    maxSkillDelta = Math.max(maxSkillDelta, skillDelta);

    if (skillDelta > tolerances.skillCountDelta) {
      mismatches.push(`result[${i}].matchedSkills.length (${legacyMatchedCount} vs ${transformedMatchedCount})`);
    }
  }

  return {
    isEquivalent: mismatches.length === 0,
    matchPercentageDelta: maxMatchDelta,
    skillDifferences: {
      matchedSkillsDelta: maxSkillDelta,
      missingSkillsDelta: 0 // Could be expanded
    },
    fieldMismatches: mismatches.length > 0 ? mismatches : undefined
  };
}

/**
 * Log transformation metrics for observability
 */
export function logTransformationMetrics(
  operation: 'batch' | 'single',
  inputCount: number,
  outputCount: number,
  processingTimeMs: number,
  context: { userId?: string; jobId?: number; analysisId?: string }
): void {
  logger.info('Legacy transformation completed', {
    operation,
    inputCount,
    outputCount,
    processingTimeMs,
    transformationTime: Date.now(), // For correlation with performance metrics
    migrationPhase: 'route_unification',
    legacyCompatibilityMode: true,
    ...context
  });

  // Production metrics for monitoring (commented out for development)
  // metrics.increment('legacy.transform.invocations', 1, { operation });
  // metrics.timing('legacy.transform.duration', processingTimeMs, { operation });
  // metrics.increment('legacy.service_path.used', 1, { operation, userId: context.userId });
}

/**
 * Log when legacy route is using AnalysisService internally
 * Used for migration monitoring and performance analysis
 */
export function logLegacyServiceUsage(
  endpoint: string,
  userId: string,
  migrationEnabled: boolean,
  processingTimeMs: number,
  success: boolean
): void {
  logger.info('Legacy route using AnalysisService', {
    endpoint,
    userId: userId.substring(0, 8) + '...', // Privacy: log partial user ID
    migrationEnabled,
    processingTimeMs,
    success,
    timestamp: new Date().toISOString(),
    migrationPhase: 'internal_service_routing'
  });

  // Production metrics (to be uncommented when metrics system is available)
  // metrics.increment('legacy.analysis_service.used', 1, { 
  //   endpoint, 
  //   success: success.toString(),
  //   migration_enabled: migrationEnabled.toString()
  // });
  // metrics.timing('legacy.analysis_service.duration', processingTimeMs, { endpoint });
}

/**
 * Log differential comparison results for parity validation
 * Used during rollout to identify transformation accuracy
 * 
 * Operational Controls:
 * - TRANSFORM_SAMPLE_RATE: Override sampling rate (0.0-1.0), defaults to 5%
 * - context.sampleRate: Per-request override for testing
 * - Automatic privacy masking: User IDs truncated to 8 chars + '...'
 */
export function logDifferentialComparison(
  endpoint: string,
  legacyResult: any,
  serviceResult: any,
  comparison: ResponseComparison,
  context: { userId?: string; jobId?: number; sampleRate?: number }
): void {
  // Environment-driven sampling rate with fallback hierarchy and clamping
  const envSampleRate = process.env.TRANSFORM_SAMPLE_RATE ? Number(process.env.TRANSFORM_SAMPLE_RATE) : null;
  const unclamped = envSampleRate ?? context.sampleRate ?? 0.05; // Env → context → default 5%
  const sampleRate = Math.max(0, Math.min(1, isNaN(unclamped) ? 0.05 : unclamped)); // Clamp to [0,1]
  
  if (Math.random() > sampleRate) {
    return;
  }

  logger.debug('Differential comparison sampling', {
    sampleRate,
    envSampleRate,
    contextSampleRate: context.sampleRate,
    endpoint
  });

  logger.info('Legacy vs Service differential comparison', {
    endpoint,
    isEquivalent: comparison.isEquivalent,
    matchPercentageDelta: comparison.matchPercentageDelta,
    skillDifferences: comparison.skillDifferences,
    fieldMismatches: comparison.fieldMismatches,
    legacyResultCount: Array.isArray(legacyResult?.results) ? legacyResult.results.length : 1,
    serviceResultCount: Array.isArray(serviceResult?.data?.results) ? serviceResult.data.results.length : 1,
    sampleRate,
    userId: context.userId?.substring(0, 8) + '...',
    jobId: context.jobId,
    timestamp: new Date().toISOString(),
    migrationPhase: 'differential_validation'
  });

  // Alert on significant differences (to be uncommented in production)
  if (!comparison.isEquivalent) {
    // metrics.increment('legacy.transform.mismatch', 1, {
    //   endpoint,
    //   mismatch_type: comparison.fieldMismatches?.[0] || 'unknown'
    // });
  }
}