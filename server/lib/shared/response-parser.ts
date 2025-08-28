/**
 * Unified Response Parser for AI Providers
 * 
 * Consolidates JSON extraction, markdown cleaning, and response validation
 * logic that was previously duplicated across anthropic.ts, openai.ts, and groq.ts
 * 
 * Eliminates ~150 lines of duplicate code per provider.
 */

import { logger } from "../logger";

export interface ParsedResponse<T = unknown> {
  success: boolean;
  data: T | null;
  error?: string;
  warnings?: string[];
}

export interface ValidationSchema {
  required?: string[];
  optional?: string[];
  types?: Record<string, string>;
}

/**
 * Unified response parser for all AI providers
 */
export class ResponseParser {
  /**
   * Extract JSON from AI response text, handling multiple formats
   */
  static extractJSON(response: string, context?: string): ParsedResponse {
    if (!response || response.trim().length === 0) {
      return {
        success: false,
        data: null,
        error: 'Empty response received'
      };
    }

    const warnings: string[] = [];
    const originalLength = response.length;

    // Clean markdown formatting (from groq.ts)
    const cleanedResponse = this.stripMarkdown(response);
    
    if (cleanedResponse.length !== originalLength) {
      warnings.push('Markdown formatting was stripped from response');
    }

    // Multiple JSON extraction strategies (consolidated from all providers)
    const strategies = [
      () => this.extractDirectJSON(cleanedResponse),
      () => this.extractCodeBlockJSON(cleanedResponse),
      () => this.extractBetweenMarkers(cleanedResponse),
      () => this.extractWithRegex(cleanedResponse)
    ];

    let lastError = '';

    for (const strategy of strategies) {
      try {
        const result = strategy();
        if (result) {
          logger.debug(`JSON extraction successful using ${strategy.name}`, { 
            context, 
            responseLength: response.length,
            extractedKeys: Object.keys(result).length
          });
          
          return {
            success: true,
            data: result,
            warnings: warnings.length > 0 ? warnings : undefined
          };
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        logger.debug(`JSON extraction strategy failed: ${strategy.name}`, { 
          error: lastError,
          context 
        });
      }
    }

    // All strategies failed
    logger.warn('All JSON extraction strategies failed', {
      context,
      lastError,
      responsePreview: response.substring(0, 200) + '...'
    });

    return {
      success: false,
      data: null,
      error: `JSON extraction failed: ${lastError}`,
      warnings
    };
  }

  /**
   * Strip markdown formatting from text (enhanced from groq.ts)
   */
  static stripMarkdown(text: string): string {
    return text
      // Remove code block markers
      .replace(/```(?:json|typescript|javascript)?\n?/gi, '')
      .replace(/```/g, '')
      // Remove inline code markers
      .replace(/`([^`]+)`/g, '$1')
      // Remove headers
      .replace(/^#+\s+.*$/gm, '')
      // Remove bold/italic
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      // Remove list markers
      .replace(/^[-*+]\s+/gm, '')
      .replace(/^\d+\.\s+/gm, '')
      // Clean up extra whitespace
      .replace(/\n\s*\n/g, '\n')
      .trim();
  }

  /**
   * Validate parsed response against schema
   */
  static validateResponse<T>(data: unknown, schema: ValidationSchema, context?: string): ParsedResponse<T> {
    if (!data || typeof data !== 'object') {
      return {
        success: false,
        data: null,
        error: 'Response data is not an object'
      };
    }

    const obj = data as Record<string, unknown>;
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required fields
    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in obj) || obj[field] === undefined || obj[field] === null) {
          errors.push(`Missing required field: ${field}`);
        }
      }
    }

    // Check types
    if (schema.types) {
      for (const [field, expectedType] of Object.entries(schema.types)) {
        if (field in obj) {
          const actualType = Array.isArray(obj[field]) ? 'array' : typeof obj[field];
          if (actualType !== expectedType) {
            errors.push(`Field '${field}' should be ${expectedType}, got ${actualType}`);
          }
        }
      }
    }

    // Log validation results
    if (errors.length > 0) {
      logger.warn('Response validation failed', { 
        context, 
        errors,
        receivedKeys: Object.keys(obj) 
      });
      
      return {
        success: false,
        data: null,
        error: `Validation failed: ${errors.join(', ')}`,
        warnings
      };
    }

    if (warnings.length > 0) {
      logger.debug('Response validation passed with warnings', { context, warnings });
    }

    return {
      success: true,
      data: data as T,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Create consistent fallback response structure
   */
  static createFallbackResponse<T>(baseData: Partial<T>, warnings: string[] = []): T {
    const fallbackWarnings = [
      'AI provider returned incomplete response',
      'Using fallback data structure',
      ...warnings
    ];

    return {
      processingTime: 0,
      confidence: 0,
      warnings: fallbackWarnings,
      ...baseData
    } as T;
  }

  // ==================== PRIVATE EXTRACTION STRATEGIES ====================

  private static extractDirectJSON(text: string): unknown {
    // Try direct JSON parsing
    const trimmed = text.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
        (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      return JSON.parse(trimmed);
    }
    throw new Error('Not direct JSON format');
  }

  private static extractCodeBlockJSON(text: string): unknown {
    // Extract from code blocks (from anthropic.ts)
    const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
    if (codeBlockMatch) {
      return JSON.parse(codeBlockMatch[1]);
    }
    throw new Error('No code block JSON found');
  }

  private static extractBetweenMarkers(text: string): unknown {
    // Extract between specific markers (from multiple providers)
    const markers = [
      ['{', '}'],
      ['[', ']'],
      ['JSON:', '\n'],
      ['RESULT:', '\n']
    ];

    for (const [start, end] of markers) {
      const startIndex = text.indexOf(start);
      if (startIndex !== -1) {
        const endIndex = end === '\n' ? text.indexOf('\n', startIndex) : text.lastIndexOf(end);
        if (endIndex !== -1) {
          const extracted = end === '\n' ? 
            text.substring(startIndex + start.length, endIndex) :
            text.substring(startIndex, endIndex + 1);
          
          try {
            return JSON.parse(extracted.trim());
          } catch {
            // Continue to next marker
          }
        }
      }
    }
    throw new Error('No JSON found between markers');
  }

  private static extractWithRegex(text: string): unknown {
    // Regex-based extraction (enhanced from openai.ts)
    const jsonPatterns = [
      /\{[\s\S]*\}/,  // Any object
      /\[[\s\S]*\]/,  // Any array
      /"?\w+"?\s*:\s*"?[\w\s]*"?[\s\S]*\}/,  // Partial object patterns
    ];

    for (const pattern of jsonPatterns) {
      const match = text.match(pattern);
      if (match) {
        try {
          return JSON.parse(match[0]);
        } catch {
          // Continue to next pattern
        }
      }
    }
    throw new Error('No JSON found with regex patterns');
  }
}

/**
 * Provider-specific response parsers
 */
export class AnthropicResponseParser extends ResponseParser {
  static parseAnalysisResponse<T>(response: string): ParsedResponse<T> {
    // Anthropic-specific parsing optimizations
    const result = this.extractJSON(response, 'anthropic');
    if (result.success && result.data) {
      // Apply Anthropic-specific transformations if needed
      return result as ParsedResponse<T>;
    }
    return result as ParsedResponse<T>;
  }
}

export class OpenAIResponseParser extends ResponseParser {
  static parseAnalysisResponse<T>(response: string): ParsedResponse<T> {
    // OpenAI-specific parsing optimizations
    const result = this.extractJSON(response, 'openai');
    if (result.success && result.data) {
      // Apply OpenAI-specific transformations if needed
      return result as ParsedResponse<T>;
    }
    return result as ParsedResponse<T>;
  }
}

export class GroqResponseParser extends ResponseParser {
  static parseAnalysisResponse<T>(response: string): ParsedResponse<T> {
    // Groq-specific parsing optimizations (already has good JSON cleaning)
    const result = this.extractJSON(response, 'groq');
    if (result.success && result.data) {
      // Apply Groq-specific transformations if needed
      return result as ParsedResponse<T>;
    }
    return result as ParsedResponse<T>;
  }
}