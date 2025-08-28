/**
 * Minimal Production-Safe Audit Trail System
 * 
 * Provides immutable audit logging for compliance and debugging.
 * Stores version info, weights, scores, and quality gates.
 */

import fs from 'fs/promises';
import crypto from 'crypto';
import path from 'path';
import { logger } from './logger';

type Weights = {
  ml: number;
  llm: number;
  dims: {
    skills: number;
    experience: number;
    education: number;
    semantic: number;
  };
};

type Versions = {
  esco: string;
  embeddings: string;
  provider: string;
  model: string;
  prompt: string;
  calibration: string;
};

type Scores = {
  ml: number | null;
  llm: number | null;
  biasAdjLLM: number | null;
  blended: number | null;
  final: number | null;
  confidence: number;
};

type Quality = {
  gates: string[];
  abstain?: boolean;
  contamination?: string[];
  failureReasons?: string[];
};

interface AuditTrailInput {
  versions: Versions;
  weights: Weights;
  scores: Scores;
  quality: Quality;
  hashes: {
    resume: string;
    jd: string;
  };
  timings?: {
    totalMs: number;
    breakdown?: Record<string, number>;
  };
  extra?: Record<string, unknown>;
}

interface AuditTrail extends AuditTrailInput {
  analysisId: string;
  ts: string;
}

/**
 * Generate an audit trail entry with all analysis metadata
 */
export function generateAuditTrail(input: AuditTrailInput): AuditTrail {
  return {
    analysisId: crypto.randomUUID(),
    ts: new Date().toISOString(),
    versions: input.versions,
    weights: input.weights,
    scores: input.scores,
    quality: input.quality,
    hashes: input.hashes,
    timings: input.timings,
    extra: input.extra ?? {},
  };
}

/**
 * Persist audit trail to JSONL file (append-only for immutability)
 */
export async function persistAuditTrail(
  audit: AuditTrail,
  file?: string
): Promise<void> {
  const auditPath = file || process.env.AUDIT_LOG_PATH || '/var/log/evalmatch_audit.jsonl';
  
  try {
    // Ensure directory exists
    const dir = path.dirname(auditPath);
    await fs.mkdir(dir, { recursive: true });
    
    // Append as JSONL (one JSON object per line)
    const line = JSON.stringify(audit) + '\n';
    await fs.appendFile(auditPath, line, 'utf8');
  } catch (error) {
    // Log error but don't throw - audit failures shouldn't break the analysis
    console.error('Failed to persist audit trail:', {
      analysisId: audit.analysisId,
      error: error instanceof Error ? error.message : 'Unknown error',
      path: auditPath,
    });
  }
}

/**
 * Hash sensitive data for privacy-compliant storage
 */
export function hashSensitiveData(data: string): string {
  return crypto
    .createHash('sha256')
    .update(data)
    .digest('hex')
    .substring(0, 16); // First 16 chars sufficient for uniqueness
}

/**
 * Create a complete audit entry from analysis result
 */
export function createAnalysisAudit(params: {
  resumeText: string;
  jobText: string;
  mlScore: number | null;
  llmScore: number | null;
  biasAdjustedLLMScore: number | null;
  blendedScore: number | null;
  finalScore: number | null;
  confidence: number;
  mlWeight: number;
  llmWeight: number;
  dimensionWeights: Weights['dims'];
  provider: string;
  model: string;
  promptVersion?: string;
  escoVersion?: string;
  embeddingsVersion?: string;
  calibrationVersion?: string;
  qualityGates?: string[];
  isAbstain?: boolean;
  contaminatedSkills?: string[];
  failureReasons?: string[];
  timingMs?: number;
  timingBreakdown?: Record<string, number>;
}): AuditTrail {
  const audit = generateAuditTrail({
    versions: {
      esco: params.escoVersion || 'mock-v1',
      embeddings: params.embeddingsVersion || 'xenova-minilm-l12-v2',
      provider: params.provider,
      model: params.model,
      prompt: params.promptVersion || 'v5',
      calibration: params.calibrationVersion || 'temp-cutoffs-2025-08-27',
    },
    weights: {
      ml: params.mlWeight,
      llm: params.llmWeight,
      dims: params.dimensionWeights,
    },
    scores: {
      ml: params.mlScore,
      llm: params.llmScore,
      biasAdjLLM: params.biasAdjustedLLMScore,
      blended: params.blendedScore,
      final: params.finalScore,
      confidence: params.confidence,
    },
    quality: {
      gates: params.qualityGates || [],
      abstain: params.isAbstain,
      contamination: params.contaminatedSkills,
      failureReasons: params.failureReasons,
    },
    hashes: {
      resume: hashSensitiveData(params.resumeText),
      jd: hashSensitiveData(params.jobText),
    },
    timings: params.timingMs ? {
      totalMs: params.timingMs,
      breakdown: params.timingBreakdown,
    } : undefined,
  });
  
  return audit;
}

/**
 * Read audit trails for analysis (testing/debugging)
 */
export async function readAuditTrails(
  file?: string,
  limit = 100
): Promise<AuditTrail[]> {
  const auditPath = file || process.env.AUDIT_LOG_PATH || '/var/log/evalmatch_audit.jsonl';
  
  try {
    const content = await fs.readFile(auditPath, 'utf8');
    const lines = content.trim().split('\n');
    
    // Get last N entries
    const relevantLines = lines.slice(-limit);
    
    return relevantLines
      .filter(line => line.trim())
      .map(line => JSON.parse(line) as AuditTrail);
  } catch (error) {
    // File might not exist yet
    return [];
  }
}

/**
 * Get audit summary statistics
 */
export async function getAuditStats(file?: string): Promise<{
  totalEntries: number;
  abstainRate: number;
  avgConfidence: number;
  providers: Record<string, number>;
}> {
  const trails = await readAuditTrails(file, 10000);
  
  if (trails.length === 0) {
    return {
      totalEntries: 0,
      abstainRate: 0,
      avgConfidence: 0,
      providers: {},
    };
  }
  
  const abstainCount = trails.filter(t => t.quality.abstain).length;
  const totalConfidence = trails.reduce((sum, t) => sum + t.scores.confidence, 0);
  
  const providers: Record<string, number> = {};
  trails.forEach(t => {
    providers[t.versions.provider] = (providers[t.versions.provider] || 0) + 1;
  });
  
  return {
    totalEntries: trails.length,
    abstainRate: abstainCount / trails.length,
    avgConfidence: totalConfidence / trails.length,
    providers,
  };
}

// ✅ PHASE 4.3: Enhanced Complete Audit Trail System

interface CompleteAuditTrail {
  analysisId: string;
  timestamp: string;
  versions: {
    esco: string;
    escoDatabaseChecksum: string;
    embeddings: string;
    prompt: string;
    promptHash: string;
    provider: string;
    providerModel: string;
    calibration: string;
    calibrationRulesetId: string;
    codeVersion: string;
    contaminationRulesVersion: string;
    ftsSnapshotId: string;
  };
  weights: {
    ensemble: {
      ml: number;
      llm: number;
      normalized: boolean;
      originalML?: number;
      originalLLM?: number;
    };
    dimensions: {
      skills: number;
      experience: number;
      education: number;
      semantic: number;
      normalized: boolean;
    };
  };
  scores: {
    rawML: number;
    rawLLM: number;
    biasAdjustedLLM: number;
    gateAdjustedML: number;
    gateAdjustedLLM: number;
    blendedScore: number;
    finalScore: number;
    confidence: number;
  };
  qualityGates: {
    monotonicityViolations: string[];
    confidenceFactors: any;
    providerReliability: any;
    contaminationBlocks: any[];
    abstainTriggers: string[];
  };
  performance: {
    totalTimeMs: number;
    breakdownMs: {
      dataExtraction: number;
      llmAnalysis: number;
      mlAnalysis: number;
      escoMatching: number;
      embeddingGeneration: number;
      contaminationCheck: number;
      scoring: number;
    };
    cacheStats: {
      escoHitRate: number;
      embeddingHitRate: number;
      totalCacheKeys: number;
    };
  };
  dataHashes: {
    resumeHash: string;
    jobDescriptionHash: string;
    normalizedResumeHash: string;
    normalizedJobDescriptionHash: string;
  };
}

// ✅ CRITICAL: Complete audit trail generation
export function generateCompleteAuditTrail(context: {
  analysisResults: any;
  performanceMetrics: any;
  versionInfo: any;
  weightInfo: any;
  qualityGates: any;
  inputData: any;
}): CompleteAuditTrail {

  const analysisId = crypto.randomUUID();

  // ✅ CRITICAL: Hash input data for reproducibility
  const resumeHash = crypto.createHash('sha256')
    .update(JSON.stringify(context.inputData.resume))
    .digest('hex');

  const jobDescriptionHash = crypto.createHash('sha256')
    .update(JSON.stringify(context.inputData.jobDescription))
    .digest('hex');

  // Generate prompt hash for version tracking
  const promptHash = crypto.createHash('sha256')
    .update(context.versionInfo.promptTemplate || '')
    .digest('hex');

  const auditTrail: CompleteAuditTrail = {
    analysisId,
    timestamp: new Date().toISOString(),
    versions: {
      esco: "complete_esco_2025-08-27",
      escoDatabaseChecksum: context.versionInfo.escoDatabaseChecksum || "unknown",
      embeddings: "xenova/all-MiniLM-L12-v2",
      prompt: context.versionInfo.promptVersion || "v5",
      promptHash,
      provider: context.versionInfo.primaryProvider || "unknown",
      providerModel: context.versionInfo.providerModel || "unknown",
      calibration: "temp-cutoffs-2025-08-27",
      calibrationRulesetId: "calibration-v1",
      codeVersion: process.env.GIT_COMMIT?.substring(0, 8) || "development",
      contaminationRulesVersion: "contamination-v2",
      ftsSnapshotId: "fts-2025-08-27"
    },
    weights: {
      ensemble: {
        ml: context.weightInfo.normalizedWeights?.ml || 0.3,
        llm: context.weightInfo.normalizedWeights?.llm || 0.7,
        normalized: true,
        originalML: context.weightInfo.originalWeights?.ml,
        originalLLM: context.weightInfo.originalWeights?.llm
      },
      dimensions: {
        skills: context.weightInfo.dimensionWeights?.skills || 0.55,
        experience: context.weightInfo.dimensionWeights?.experience || 0.30,
        education: context.weightInfo.dimensionWeights?.education || 0.10,
        semantic: context.weightInfo.dimensionWeights?.semantic || 0.05,
        normalized: context.weightInfo.dimensionsNormalized || true
      }
    },
    scores: {
      rawML: context.analysisResults.rawML || 0,
      rawLLM: context.analysisResults.rawLLM || 0,
      biasAdjustedLLM: context.analysisResults.biasAdjustedLLM || 0,
      gateAdjustedML: context.analysisResults.gateAdjustedML || 0,
      gateAdjustedLLM: context.analysisResults.gateAdjustedLLM || 0,
      blendedScore: context.analysisResults.blendedScore || 0,
      finalScore: context.analysisResults.finalScore || 0,
      confidence: context.analysisResults.confidence || 0
    },
    qualityGates: {
      monotonicityViolations: context.qualityGates.monotonicityViolations || [],
      confidenceFactors: context.qualityGates.confidenceFactors || {},
      providerReliability: context.qualityGates.providerReliability || {},
      contaminationBlocks: context.qualityGates.contaminationBlocks || [],
      abstainTriggers: context.qualityGates.abstainTriggers || []
    },
    performance: {
      totalTimeMs: context.performanceMetrics.totalTime || 0,
      breakdownMs: context.performanceMetrics.breakdown || {
        dataExtraction: 0,
        llmAnalysis: 0,
        mlAnalysis: 0,
        escoMatching: 0,
        embeddingGeneration: 0,
        contaminationCheck: 0,
        scoring: 0
      },
      cacheStats: {
        escoHitRate: context.performanceMetrics.cacheStats?.escoHitRate || 0,
        embeddingHitRate: context.performanceMetrics.cacheStats?.embeddingHitRate || 0,
        totalCacheKeys: context.performanceMetrics.cacheStats?.totalKeys || 0
      }
    },
    dataHashes: {
      resumeHash,
      jobDescriptionHash,
      normalizedResumeHash: crypto.createHash('sha256')
        .update(context.inputData.normalizedResume || context.inputData.resume)
        .digest('hex'),
      normalizedJobDescriptionHash: crypto.createHash('sha256')
        .update(context.inputData.normalizedJobDescription || context.inputData.jobDescription)
        .digest('hex')
    }
  };

  return auditTrail;
}

// ✅ Store complete audit trail for compliance
export async function storeCompleteAuditTrail(auditTrail: CompleteAuditTrail): Promise<void> {
  try {
    // Store as JSONL for immutable audit logging
    const auditDir = process.env.AUDIT_DIR || './audit_trails';
    const fileName = `complete_audit_${new Date().toISOString().split('T')[0]}.jsonl`;
    const filePath = path.join(auditDir, fileName);

    // Ensure directory exists
    await fs.mkdir(auditDir, { recursive: true });

    // Append to daily audit file
    const auditLine = JSON.stringify(auditTrail) + '\n';
    await fs.appendFile(filePath, auditLine, 'utf8');

    logger.info('Complete audit trail stored', {
      analysisId: auditTrail.analysisId,
      timestamp: auditTrail.timestamp,
      filePath: fileName,
      compliance: 'full_audit_trail_available'
    });

  } catch (error) {
    logger.error('Failed to store complete audit trail', {
      analysisId: auditTrail.analysisId,
      error
    });
  }
}

export type { CompleteAuditTrail };