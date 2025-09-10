/**
 * AI Provider Token Usage Types
 * 
 * Standardized interfaces for tracking token consumption across
 * different AI providers (OpenAI, Anthropic, Groq)
 */

export interface AITokenUsage {
  provider: 'openai' | 'anthropic' | 'groq';
  model: string;
  operation: 'resume_analysis' | 'job_analysis' | 'match_analysis' | 'bias_analysis' | 'interview_questions' | 'interview_script';
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
  currency: string;
  timestamp: Date;
  userId?: string;
  analysisId?: string;
}

export interface AIProviderStats {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  callCount: number;
  lastUsed?: Date;
}

export interface AITokenConsumptionSummary {
  totalTokensAllProviders: number;
  totalCostAllProviders: number;
  byProvider: {
    [K in 'openai' | 'anthropic' | 'groq']?: {
      totalTokens: number;
      totalCost: number;
      callCount: number;
      avgTokensPerCall: number;
      avgCostPerCall: number;
    };
  };
  byOperation: {
    [K in AITokenUsage['operation']]?: {
      totalTokens: number;
      totalCost: number;
      callCount: number;
    };
  };
  period: {
    startDate: Date;
    endDate: Date;
  };
}

/**
 * Normalized token usage interface for consistent tracking
 * across different AI provider response formats
 */
export interface NormalizedTokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
  model: string;
  provider: 'openai' | 'anthropic' | 'groq';
}

/**
 * Token usage callback function type for AI providers
 */
export type TokenUsageCallback = (usage: AITokenUsage) => Promise<void> | void;