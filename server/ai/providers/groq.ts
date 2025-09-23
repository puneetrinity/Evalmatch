/**
 * Groq Provider Adapter
 * 
 * Implements the ProviderAdapter interface for Groq AI services
 * Prioritized for speed and cost efficiency in the failover chain
 */

import { ProviderAdapter, ProviderResult, ProviderOptions, normalizeProviderError, createProviderMetadata } from './base';
import { AnalyzeResumeResponse, AnalyzeJobDescriptionResponse, MatchAnalysisResponse, BiasAnalysisResponse } from "@shared/schema";
import * as groqProvider from "../../lib/groq";
import { config } from "../../config/unified-config";
import { logger } from "../../lib/logger";

export class GroqAdapter implements ProviderAdapter {
  private lastSuccess?: Date;
  private lastError?: Date;
  private errorCount: number = 0;

  getName(): 'groq' {
    return 'groq';
  }

  getModel(): string {
    return 'llama-3.1-70b-versatile'; // Groq's primary model
  }

  isAvailable(): boolean {
    // ✅ CRITICAL FIX: Conservative Groq availability with health checks
    const basicAvailability = !!config.ai.providers.groq.apiKey && config.ai.providers.groq.enabled;
    
    // Conservative check: if too many recent errors, consider unavailable
    const recentErrorThreshold = 3;
    const errorTimeWindow = 5 * 60 * 1000; // 5 minutes
    const now = Date.now();
    
    // If we had recent errors, be more conservative
    if (this.lastError && (now - this.lastError.getTime()) < errorTimeWindow && this.errorCount >= recentErrorThreshold) {
      logger.warn('✅ CONSERVATIVE GROQ: Too many recent errors, marking unavailable', {
        errorCount: this.errorCount,
        lastError: this.lastError,
        threshold: recentErrorThreshold
      });
      return false;
    }
    
    return basicAvailability;
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
      // Use existing Groq implementation with timeout
      const result = await Promise.race([
        groqProvider.analyzeResume(resumeText),
        this.createTimeoutPromise(options?.timeout || config.ai.providers.groq.timeout)
      ]);

      const processingTime = Date.now() - startTime;
      this.recordSuccess();

      return {
        success: true,
        data: result as any,
        metadata: createProviderMetadata('groq', this.getModel(), processingTime, options?.retryCount)
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.recordError();
      
      logger.warn('Groq resume analysis failed', {
        error: error instanceof Error ? error.message : String(error),
        processingTime
      });

      return {
        success: false,
        error: normalizeProviderError(error, 'Groq'),
        metadata: createProviderMetadata('groq', this.getModel(), processingTime, options?.retryCount)
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
        groqProvider.analyzeJobDescription(title, description),
        this.createTimeoutPromise(options?.timeout || config.ai.providers.groq.timeout)
      ]);

      const processingTime = Date.now() - startTime;
      this.recordSuccess();

      return {
        success: true,
        data: result as any,
        metadata: createProviderMetadata('groq', this.getModel(), processingTime, options?.retryCount)
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.recordError();
      
      logger.warn('Groq job analysis failed', {
        error: error instanceof Error ? error.message : String(error),
        processingTime
      });

      return {
        success: false,
        error: normalizeProviderError(error, 'Groq'),
        metadata: createProviderMetadata('groq', this.getModel(), processingTime, options?.retryCount)
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
      // Groq supports enhanced match analysis with raw text
      const result = await Promise.race([
        groqProvider.analyzeMatch(resumeAnalysis, jobAnalysis, resumeText, jobText),
        this.createTimeoutPromise(options?.timeout || config.ai.providers.groq.timeout)
      ]);

      const processingTime = Date.now() - startTime;
      this.recordSuccess();

      return {
        success: true,
        data: result as any,
        metadata: createProviderMetadata('groq', this.getModel(), processingTime, options?.retryCount)
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.recordError();
      
      logger.warn('Groq match analysis failed', {
        error: error instanceof Error ? error.message : String(error),
        processingTime
      });

      return {
        success: false,
        error: normalizeProviderError(error, 'Groq'),
        metadata: createProviderMetadata('groq', this.getModel(), processingTime, options?.retryCount)
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
        groqProvider.analyzeBias(title, description),
        this.createTimeoutPromise(options?.timeout || config.ai.providers.groq.timeout)
      ]);

      const processingTime = Date.now() - startTime;
      this.recordSuccess();

      return {
        success: true,
        data: result as any,
        metadata: createProviderMetadata('groq', this.getModel(), processingTime, options?.retryCount)
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.recordError();
      
      logger.warn('Groq bias analysis failed', {
        error: error instanceof Error ? error.message : String(error),
        processingTime
      });

      return {
        success: false,
        error: normalizeProviderError(error, 'Groq'),
        metadata: createProviderMetadata('groq', this.getModel(), processingTime, options?.retryCount)
      };
    }
  }

  private createTimeoutPromise<T>(timeoutMs: number): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Groq request timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }

  private recordSuccess(): void {
    this.lastSuccess = new Date();
    this.errorCount = Math.max(0, this.errorCount - 1); // Gradually reduce error count on success
  }

  private recordError(): void {
    this.lastError = new Date();
    this.errorCount++;
  }
}

// Export singleton instance
export const groqAdapter = new GroqAdapter();