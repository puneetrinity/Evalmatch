/**
 * Anthropic Provider Adapter
 * 
 * Implements the ProviderAdapter interface for Anthropic Claude services
 * Final fallback provider in chain, prioritized for quality analysis
 */

import { ProviderAdapter, ProviderResult, ProviderOptions, normalizeProviderError, createProviderMetadata } from './base';
import { AnalyzeResumeResponse, AnalyzeJobDescriptionResponse, MatchAnalysisResponse, BiasAnalysisResponse } from "@shared/schema";
import * as anthropicProvider from "../../lib/anthropic";
import { config } from "../../config/unified-config";
import { logger } from "../../lib/logger";

export class AnthropicAdapter implements ProviderAdapter {
  private lastSuccess?: Date;
  private lastError?: Date;
  private errorCount: number = 0;

  getName(): 'anthropic' {
    return 'anthropic';
  }

  getModel(): string {
    return 'claude-3-5-sonnet-20241022'; // Anthropic's latest model
  }

  isAvailable(): boolean {
    return !!config.ai.providers.anthropic.apiKey && config.ai.providers.anthropic.enabled;
  }

  getHealthStatus() {
    return {
      available: this.isAvailable(),
      lastSuccess: this.lastSuccess,
      lastError: this.lastError,
      errorCount: this.errorCount
    };
  }

  async analyzeResume(
    resumeText: string, 
    options?: ProviderOptions
  ): Promise<ProviderResult<AnalyzeResumeResponse>> {
    const startTime = Date.now();
    
    try {
      const result = await Promise.race([
        anthropicProvider.analyzeResume(resumeText),
        this.createTimeoutPromise(options?.timeout || config.ai.providers.anthropic.timeout)
      ]);

      const processingTime = Date.now() - startTime;
      this.recordSuccess();

      return {
        success: true,
        data: result as AnalyzeResumeResponse,
        metadata: createProviderMetadata('anthropic', this.getModel(), processingTime, options?.retryCount)
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.recordError();
      
      logger.warn('Anthropic resume analysis failed', {
        error: error instanceof Error ? error.message : String(error),
        processingTime
      });

      return {
        success: false,
        error: normalizeProviderError(error, 'Anthropic'),
        metadata: createProviderMetadata('anthropic', this.getModel(), processingTime, options?.retryCount)
      };
    }
  }

  async analyzeJobDescription(
    title: string, 
    description: string, 
    options?: ProviderOptions
  ): Promise<ProviderResult<AnalyzeJobDescriptionResponse>> {
    const startTime = Date.now();
    
    try {
      const result = await Promise.race([
        anthropicProvider.analyzeJobDescription(title, description),
        this.createTimeoutPromise(options?.timeout || config.ai.providers.anthropic.timeout)
      ]);

      const processingTime = Date.now() - startTime;
      this.recordSuccess();

      return {
        success: true,
        data: result as AnalyzeJobDescriptionResponse,
        metadata: createProviderMetadata('anthropic', this.getModel(), processingTime, options?.retryCount)
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.recordError();
      
      logger.warn('Anthropic job analysis failed', {
        error: error instanceof Error ? error.message : String(error),
        processingTime
      });

      return {
        success: false,
        error: normalizeProviderError(error, 'Anthropic'),
        metadata: createProviderMetadata('anthropic', this.getModel(), processingTime, options?.retryCount)
      };
    }
  }

  async analyzeMatch(
    resumeAnalysis: AnalyzeResumeResponse,
    jobAnalysis: AnalyzeJobDescriptionResponse,
    resumeText?: string,
    jobText?: string,
    options?: ProviderOptions
  ): Promise<ProviderResult<MatchAnalysisResponse>> {
    const startTime = Date.now();
    
    try {
      // Anthropic uses comprehensive analysis approach
      const result = await Promise.race([
        anthropicProvider.analyzeMatch(resumeAnalysis, jobAnalysis),
        this.createTimeoutPromise(options?.timeout || config.ai.providers.anthropic.timeout)
      ]);

      const processingTime = Date.now() - startTime;
      this.recordSuccess();

      return {
        success: true,
        data: result as MatchAnalysisResponse,
        metadata: createProviderMetadata('anthropic', this.getModel(), processingTime, options?.retryCount)
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.recordError();
      
      logger.warn('Anthropic match analysis failed', {
        error: error instanceof Error ? error.message : String(error),
        processingTime
      });

      return {
        success: false,
        error: normalizeProviderError(error, 'Anthropic'),
        metadata: createProviderMetadata('anthropic', this.getModel(), processingTime, options?.retryCount)
      };
    }
  }

  async analyzeBias(
    title: string, 
    description: string, 
    options?: ProviderOptions
  ): Promise<ProviderResult<BiasAnalysisResponse>> {
    const startTime = Date.now();
    
    try {
      const result = await Promise.race([
        anthropicProvider.analyzeBias(title, description),
        this.createTimeoutPromise(options?.timeout || config.ai.providers.anthropic.timeout)
      ]);

      const processingTime = Date.now() - startTime;
      this.recordSuccess();

      return {
        success: true,
        data: result as BiasAnalysisResponse,
        metadata: createProviderMetadata('anthropic', this.getModel(), processingTime, options?.retryCount)
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.recordError();
      
      logger.warn('Anthropic bias analysis failed', {
        error: error instanceof Error ? error.message : String(error),
        processingTime
      });

      return {
        success: false,
        error: normalizeProviderError(error, 'Anthropic'),
        metadata: createProviderMetadata('anthropic', this.getModel(), processingTime, options?.retryCount)
      };
    }
  }

  private createTimeoutPromise<T>(timeoutMs: number): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Anthropic request timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }

  private recordSuccess(): void {
    this.lastSuccess = new Date();
    this.errorCount = Math.max(0, this.errorCount - 1);
  }

  private recordError(): void {
    this.lastError = new Date();
    this.errorCount++;
  }
}

// Export singleton instance
export const anthropicAdapter = new AnthropicAdapter();