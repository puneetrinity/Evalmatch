import { logger } from './logger';

interface ProviderVersionConfig {
  provider: string;
  model: string;
  promptVersion: string;
  promptHash: string;
  calibrationVersion: string;
  failureThreshold: number;
  confidenceThreshold: number;
  lastUpdated: string;
}

// ✅ CRITICAL: Lock provider/prompt versions with env-scoped cutoffs
const PROVIDER_CALIBRATION_CONFIGS: Record<string, ProviderVersionConfig> = {
  groq: {
    provider: 'groq',
    model: process.env.GROQ_MODEL || 'llama-3.1-70b-versatile',
    promptVersion: process.env.GROQ_PROMPT_VERSION || 'v5',
    promptHash: process.env.GROQ_PROMPT_HASH || 'auto-generated',
    calibrationVersion: process.env.GROQ_CALIBRATION_VERSION || 'temp-cutoffs-2025-08-27',
    failureThreshold: parseInt(process.env.GROQ_FAILURE_THRESHOLD || '45'),
    confidenceThreshold: parseFloat(process.env.GROQ_CONFIDENCE_THRESHOLD || '0.7'),
    lastUpdated: '2025-08-27'
  },
  openai: {
    provider: 'openai',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    promptVersion: process.env.OPENAI_PROMPT_VERSION || 'v5',
    promptHash: process.env.OPENAI_PROMPT_HASH || 'auto-generated',
    calibrationVersion: process.env.OPENAI_CALIBRATION_VERSION || 'temp-cutoffs-2025-08-27',
    failureThreshold: parseInt(process.env.OPENAI_FAILURE_THRESHOLD || '52'),
    confidenceThreshold: parseFloat(process.env.OPENAI_CONFIDENCE_THRESHOLD || '0.75'),
    lastUpdated: '2025-08-27'
  },
  anthropic: {
    provider: 'anthropic',
    model: process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307',
    promptVersion: process.env.ANTHROPIC_PROMPT_VERSION || 'v5',
    promptHash: process.env.ANTHROPIC_PROMPT_HASH || 'auto-generated',
    calibrationVersion: process.env.ANTHROPIC_CALIBRATION_VERSION || 'temp-cutoffs-2025-08-27',
    failureThreshold: parseInt(process.env.ANTHROPIC_FAILURE_THRESHOLD || '48'),
    confidenceThreshold: parseFloat(process.env.ANTHROPIC_CONFIDENCE_THRESHOLD || '0.72'),
    lastUpdated: '2025-08-27'
  }
};

interface ProviderResult {
  provider: string;
  score: number;
  confidence?: number;
  model?: string;
  failed: boolean;
  threshold: number;
  version: ProviderVersionConfig;
  metadata: {
    requestId?: string;
    responseTime?: number;
    tokenUsage?: number;
  };
}

/**
 * ✅ CRITICAL: Check if provider result failed based on version-specific thresholds
 */
export function isProviderResultFailed(
  provider: string, 
  score: number, 
  confidence?: number,
  model?: string,
  metadata: { requestId?: string; responseTime?: number; tokenUsage?: number } = {}
): ProviderResult {
  const config = PROVIDER_CALIBRATION_CONFIGS[provider.toLowerCase()];
  
  if (!config) {
    logger.warn(`Unknown provider for calibration: ${provider}`, {
      provider,
      availableProviders: Object.keys(PROVIDER_CALIBRATION_CONFIGS)
    });
    
    // Fallback configuration
    const fallbackConfig: ProviderVersionConfig = {
      provider,
      model: model || 'unknown',
      promptVersion: 'unknown',
      promptHash: 'unknown',
      calibrationVersion: 'fallback',
      failureThreshold: 50,
      confidenceThreshold: 0.5,
      lastUpdated: new Date().toISOString()
    };
    
    return {
      provider,
      score,
      confidence,
      model: model || 'unknown',
      failed: score <= 50,
      threshold: 50,
      version: fallbackConfig,
      metadata
    };
  }
  
  // Check both score threshold and confidence threshold
  const scoreFailure = score <= config.failureThreshold;
  const confidenceFailure = confidence !== undefined && confidence < config.confidenceThreshold;
  const failed = scoreFailure || confidenceFailure;
  
  const result: ProviderResult = {
    provider,
    score,
    confidence,
    model: model || config.model,
    failed,
    threshold: config.failureThreshold,
    version: config,
    metadata
  };
  
  // ✅ CRITICAL: Log with locked provider/prompt versions
  logger.debug('Provider calibration check', {
    provider: config.provider,
    model: config.model,
    promptVersion: config.promptVersion,
    promptHash: config.promptHash,
    calibrationVersion: config.calibrationVersion,
    score,
    scoreThreshold: config.failureThreshold,
    confidence,
    confidenceThreshold: config.confidenceThreshold,
    scoreFailure,
    confidenceFailure,
    overallFailed: failed,
    requestId: metadata.requestId,
    responseTime: metadata.responseTime
  });
  
  if (failed) {
    logger.info('Provider result marked as failed', {
      provider: config.provider,
      score,
      confidence,
      scoreThreshold: config.failureThreshold,
      confidenceThreshold: config.confidenceThreshold,
      failureReason: scoreFailure ? 'low_score' : 'low_confidence',
      calibrationVersion: config.calibrationVersion
    });
  }
  
  return result;
}

/**
 * ✅ Get locked provider version configuration
 */
export function getProviderVersion(provider: string): ProviderVersionConfig | null {
  const config = PROVIDER_CALIBRATION_CONFIGS[provider.toLowerCase()];
  if (!config) {
    logger.warn(`No version config found for provider: ${provider}`);
    return null;
  }
  return config;
}

/**
 * ✅ Get all provider configurations for audit trail
 */
export function getAllProviderVersions(): Record<string, ProviderVersionConfig> {
  return { ...PROVIDER_CALIBRATION_CONFIGS };
}

/**
 * ✅ CRITICAL: Generate provider metadata for outputs and logs
 */
export function generateProviderMetadata(
  provider: string,
  score: number,
  confidence?: number,
  model?: string
): {
  provider: string;
  model: string;
  promptVersion: string;
  promptHash: string;
  calibrationVersion: string;
  score: number;
  confidence?: number;
  failed: boolean;
  threshold: number;
} {
  const result = isProviderResultFailed(provider, score, confidence, model);
  
  return {
    provider: result.version.provider,
    model: result.version.model,
    promptVersion: result.version.promptVersion,
    promptHash: result.version.promptHash,
    calibrationVersion: result.version.calibrationVersion,
    score,
    confidence,
    failed: result.failed,
    threshold: result.threshold
  };
}

/**
 * ✅ Validate calibration configuration on startup
 */
export function validateCalibrationConfig(): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  for (const [provider, config] of Object.entries(PROVIDER_CALIBRATION_CONFIGS)) {
    // Validate thresholds
    if (config.failureThreshold < 0 || config.failureThreshold > 100) {
      errors.push(`${provider}: Invalid failure threshold ${config.failureThreshold} (must be 0-100)`);
    }
    
    if (config.confidenceThreshold < 0 || config.confidenceThreshold > 1) {
      errors.push(`${provider}: Invalid confidence threshold ${config.confidenceThreshold} (must be 0-1)`);
    }
    
    // Validate version info
    if (!config.promptVersion || config.promptVersion === 'unknown') {
      warnings.push(`${provider}: Prompt version not specified`);
    }
    
    if (!config.calibrationVersion || config.calibrationVersion.includes('temp')) {
      warnings.push(`${provider}: Using temporary calibration version`);
    }
    
    // Check model configuration
    if (!config.model || config.model === 'unknown') {
      warnings.push(`${provider}: Model not specified`);
    }
  }
  
  const valid = errors.length === 0;
  
  if (!valid) {
    logger.error('Provider calibration configuration validation failed', { errors, warnings });
  } else if (warnings.length > 0) {
    logger.warn('Provider calibration configuration warnings', { warnings });
  } else {
    logger.info('Provider calibration configuration validated successfully', {
      providers: Object.keys(PROVIDER_CALIBRATION_CONFIGS),
      totalProviders: Object.keys(PROVIDER_CALIBRATION_CONFIGS).length
    });
  }
  
  return { valid, errors, warnings };
}

// ✅ Validate configuration on module load
const validation = validateCalibrationConfig();
if (!validation.valid) {
  throw new Error(`Provider calibration configuration is invalid: ${validation.errors.join(', ')}`);
}

export { ProviderVersionConfig, ProviderResult };