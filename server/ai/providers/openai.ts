/**
 * OpenAI Provider Adapter
 * 
 * Implements the ProviderAdapter interface for OpenAI services
 * Secondary provider in failover chain, prioritized for reliability
 */

import { ProviderAdapter, ProviderResult, ProviderOptions, normalizeProviderError, createProviderMetadata } from './base';
import { AnalyzeResumeResponse, AnalyzeJobDescriptionResponse, MatchAnalysisResponse, BiasAnalysisResponse } from "@shared/schema";
import * as openaiProvider from "../../lib/openai";
import { config } from "../../config/unified-config";
import { logger } from "../../lib/logger";

export class OpenAIAdapter implements ProviderAdapter {
  private lastSuccess?: Date;
  private lastError?: Date;
  private errorCount: number = 0;

  getName(): 'openai' {
    return 'openai';
  }

  getModel(): string {
    return 'gpt-4o-mini'; // OpenAI's cost-effective model
  }

  isAvailable(): boolean {
    return !!config.ai.providers.openai.apiKey && config.ai.providers.openai.enabled;
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
        openaiProvider.analyzeResume(resumeText),
        this.createTimeoutPromise(options?.timeout || config.ai.providers.openai.timeout)
      ]);

      const processingTime = Date.now() - startTime;
      this.recordSuccess();

      return {
        success: true,
        data: result as any,
        metadata: createProviderMetadata('openai', this.getModel(), processingTime, options?.retryCount)
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.recordError();
      
      logger.warn('OpenAI resume analysis failed', {
        error: error instanceof Error ? error.message : String(error),
        processingTime
      });

      return {
        success: false,
        error: normalizeProviderError(error, 'OpenAI'),
        metadata: createProviderMetadata('openai', this.getModel(), processingTime, options?.retryCount)
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
        openaiProvider.analyzeJobDescription(title, description),
        this.createTimeoutPromise(options?.timeout || config.ai.providers.openai.timeout)
      ]);

      const processingTime = Date.now() - startTime;
      this.recordSuccess();

      return {
        success: true,
        data: result as any,
        metadata: createProviderMetadata('openai', this.getModel(), processingTime, options?.retryCount)
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.recordError();
      
      logger.warn('OpenAI job analysis failed', {
        error: error instanceof Error ? error.message : String(error),
        processingTime
      });

      return {
        success: false,
        error: normalizeProviderError(error, 'OpenAI'),
        metadata: createProviderMetadata('openai', this.getModel(), processingTime, options?.retryCount)
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
      // OpenAI uses structured analysis approach
      const result = await Promise.race([
        openaiProvider.analyzeMatch(resumeAnalysis, jobAnalysis),
        this.createTimeoutPromise(options?.timeout || config.ai.providers.openai.timeout)
      ]);

      const processingTime = Date.now() - startTime;
      this.recordSuccess();

      return {
        success: true,
        data: result as any,
        metadata: createProviderMetadata('openai', this.getModel(), processingTime, options?.retryCount)
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.recordError();
      
      logger.warn('OpenAI match analysis failed', {
        error: error instanceof Error ? error.message : String(error),
        processingTime
      });

      return {
        success: false,
        error: normalizeProviderError(error, 'OpenAI'),
        metadata: createProviderMetadata('openai', this.getModel(), processingTime, options?.retryCount)
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
        openaiProvider.analyzeBias(title, description),
        this.createTimeoutPromise(options?.timeout || config.ai.providers.openai.timeout)
      ]);

      const processingTime = Date.now() - startTime;
      this.recordSuccess();

      return {
        success: true,
        data: result as any,
        metadata: createProviderMetadata('openai', this.getModel(), processingTime, options?.retryCount)
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.recordError();
      
      logger.warn('OpenAI bias analysis failed', {
        error: error instanceof Error ? error.message : String(error),
        processingTime
      });

      return {
        success: false,
        error: normalizeProviderError(error, 'OpenAI'),
        metadata: createProviderMetadata('openai', this.getModel(), processingTime, options?.retryCount)
      };
    }
  }

  private createTimeoutPromise<T>(timeoutMs: number): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`OpenAI request timeout after ${timeoutMs}ms`));
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
export const openaiAdapter = new OpenAIAdapter();