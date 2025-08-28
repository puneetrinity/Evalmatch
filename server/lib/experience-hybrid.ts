/**
 * Phase 4.7: Experience Hybrid Implementation (LLM + regex blending)
 * 
 * Intelligent blending of LLM-based and regex-based experience extraction
 * for improved accuracy and reliability in experience parsing.
 */

import { logger } from './logger';

interface ExperienceParseResult {
  totalYears: number;
  confidence: number;
  method: 'llm' | 'regex' | 'hybrid';
  details: {
    llmExtracted?: number;
    regexExtracted?: number;
    positions?: Array<{
      title: string;
      duration: number;
      startDate?: string;
      endDate?: string;
    }>;
  };
}

// ✅ CRITICAL: Implement hybrid LLM + regex experience extraction
export async function extractExperienceHybrid(
  resumeText: string,
  llmExtractionFunction: (_text: string) => Promise<any>
): Promise<ExperienceParseResult> {

  const startTime = Date.now();

  try {
    // Run both extraction methods in parallel
    const [llmResult, regexResult] = await Promise.all([
      extractExperienceLLM(resumeText, llmExtractionFunction),
      extractExperienceRegex(resumeText)
    ]);

    // ✅ CRITICAL: Intelligent blending instead of hard override
    const hybridResult = blendExperienceResults(llmResult, regexResult, resumeText);

    const processingTime = Date.now() - startTime;

    logger.debug('Experience hybrid extraction completed', {
      llmYears: llmResult.totalYears,
      llmConfidence: llmResult.confidence,
      regexYears: regexResult.totalYears,
      regexConfidence: regexResult.confidence,
      finalYears: hybridResult.totalYears,
      finalConfidence: hybridResult.confidence,
      method: hybridResult.method,
      processingTime
    });

    return hybridResult;

  } catch (error) {
    logger.error('Experience hybrid extraction failed', { error });
    return {
      totalYears: 0,
      confidence: 0.1,
      method: 'hybrid',
      details: {}
    };
  }
}

async function extractExperienceLLM(
  resumeText: string,
  llmFunction: (_text: string) => Promise<any>
): Promise<ExperienceParseResult> {
  try {
    const llmResponse = await llmFunction(resumeText);

    const totalYears = parseFloat(llmResponse.totalExperience || '0');
    const confidence = llmResponse.confidence || 0.7;

    return {
      totalYears: isNaN(totalYears) ? 0 : Math.max(0, totalYears),
      confidence: Math.max(0.1, Math.min(1.0, confidence)),
      method: 'llm',
      details: {
        llmExtracted: totalYears,
        positions: llmResponse.positions || []
      }
    };

  } catch (error) {
    logger.warn('LLM experience extraction failed', { error });
    return {
      totalYears: 0,
      confidence: 0.1,
      method: 'llm',
      details: { llmExtracted: 0 }
    };
  }
}

// ✅ CRITICAL: Enhanced regex with month handling, ranges, unicode dashes
function extractExperienceRegex(resumeText: string): ExperienceParseResult {
  const text = resumeText.toLowerCase();
  const positions: Array<{ title: string; duration: number; startDate?: string; endDate?: string }> = [];
  let totalYears = 0;
  let confidence = 0.5;

  // ✅ Pattern 1: "X years Y months" format
  const yearMonthPattern = /(\d+)\s*(?:yrs?|years?)\s*(?:(?:and\s*)?(\d+)\s*(?:mos?|months?))?/g;
  const yearMonthMatches = Array.from(text.matchAll(yearMonthPattern));

  for (const match of yearMonthMatches) {
    const matchText = match[0];
    const fullContext = text.substring(Math.max(0, match.index! - 20), match.index! + matchText.length + 20);
    
    // ✅ Skip if this looks like age rather than experience
    if (fullContext.includes('old') || fullContext.includes('age') || fullContext.includes('born')) {
      continue;
    }

    const years = parseInt(match[1]) || 0;
    const months = parseInt(match[2]) || 0;
    const total = years + (months / 12);

    if (total > totalYears) {
      totalYears = total;
      confidence = 0.8; // High confidence for explicit format
    }
  }

  // ✅ Pattern 2: Date ranges with unicode dash support
  const dateRangePattern = /(\d{4})\s*[-–—]\s*(\d{4}|present|current)/g;
  const dateRangeMatches = Array.from(text.matchAll(dateRangePattern));

  for (const match of dateRangeMatches) {
    const startYear = parseInt(match[1]);
    const endYear = match[2] === 'present' || match[2] === 'current'
      ? new Date().getFullYear()
      : parseInt(match[2]);

    if (startYear && endYear && endYear >= startYear) {
      const duration = endYear - startYear;
      positions.push({
        title: 'Position', // Could be enhanced with title extraction
        duration,
        startDate: match[1],
        endDate: match[2]
      });
    }
  }

  // Calculate total from positions
  if (positions.length > 0) {
    const positionTotal = positions.reduce((sum, pos) => sum + pos.duration, 0);
    if (positionTotal > totalYears) {
      totalYears = positionTotal;
      confidence = 0.7;
    }
  }

  // ✅ Pattern 3: "Since YYYY" format
  const sincePattern = /since\s+(\d{4})/g;
  const sinceMatches = Array.from(text.matchAll(sincePattern));

  for (const match of sinceMatches) {
    const startYear = parseInt(match[1]);
    const currentYear = new Date().getFullYear();
    const sinceDuration = currentYear - startYear;

    if (sinceDuration > 0 && sinceDuration > totalYears) {
      totalYears = sinceDuration;
      confidence = 0.6;
    }
  }

  // ✅ Lower bound policy - use minimum reasonable value if nothing found
  if (totalYears === 0 && text.includes('experience')) {
    totalYears = 1; // Assume minimum 1 year if experience mentioned
    confidence = 0.3;
  }

  return {
    totalYears: Math.round(totalYears * 10) / 10, // Round to 1 decimal place
    confidence,
    method: 'regex',
    details: {
      regexExtracted: totalYears,
      positions
    }
  };
}

// ✅ CRITICAL: Intelligent blending of LLM and regex results
function blendExperienceResults(
  llmResult: ExperienceParseResult,
  regexResult: ExperienceParseResult,
  _originalText: string
): ExperienceParseResult {

  // If both methods agree (within 1 year), use LLM with high confidence
  const yearsDiff = Math.abs(llmResult.totalYears - regexResult.totalYears);
  if (yearsDiff <= 1 && llmResult.totalYears > 0 && regexResult.totalYears > 0) {
    return {
      totalYears: llmResult.totalYears,
      confidence: Math.min(1.0, (llmResult.confidence + regexResult.confidence) / 2 + 0.2),
      method: 'hybrid',
      details: {
        llmExtracted: llmResult.totalYears,
        regexExtracted: regexResult.totalYears,
        positions: regexResult.details.positions
      }
    };
  }

  // If LLM has high confidence and reasonable value, prefer it
  if (llmResult.confidence >= 0.7 && llmResult.totalYears > 0 && llmResult.totalYears < 50) {
    return {
      ...llmResult,
      method: 'hybrid',
      details: {
        ...llmResult.details,
        regexExtracted: regexResult.totalYears
      }
    };
  }

  // If regex found explicit date ranges, prefer regex
  if (regexResult.details.positions && regexResult.details.positions.length > 0) {
    return {
      ...regexResult,
      method: 'hybrid',
      details: {
        ...regexResult.details,
        llmExtracted: llmResult.totalYears
      }
    };
  }

  // Default: use higher confidence result
  if (llmResult.confidence > regexResult.confidence) {
    return { ...llmResult, method: 'hybrid' };
  } else {
    return { ...regexResult, method: 'hybrid' };
  }
}

// ✅ Helper function for extracting position titles from context
function _extractPositionTitles(text: string): string[] {
  const titlePatterns = [
    /(?:(?:worked as|position as|role as)\s+(?:a\s+)?(\w+(?:\s+\w+)*?))/gi,
    /(?:(\w+(?:\s+\w+)*?)\s+at\s+\w+)/gi,
    /(?:(\w+(?:\s+\w+)*?)\s+\|\s+\d{4})/gi
  ];

  const titles: string[] = [];
  
  for (const pattern of titlePatterns) {
    const matches = Array.from(text.matchAll(pattern));
    for (const match of matches) {
      if (match[1] && match[1].length > 2) {
        titles.push(match[1].trim());
      }
    }
  }

  return Array.from(new Set(titles)); // Remove duplicates
}

// ✅ Helper function to validate experience results
export function validateExperienceResult(result: ExperienceParseResult): {
  isValid: boolean;
  issues: string[];
  correctedResult?: ExperienceParseResult;
} {
  const issues: string[] = [];

  // Check for unreasonable values
  if (result.totalYears < 0) {
    issues.push('Negative experience years detected');
  }

  if (result.totalYears > 60) {
    issues.push('Unusually high experience years (>60)');
  }

  if (result.confidence < 0 || result.confidence > 1) {
    issues.push('Confidence value out of range [0,1]');
  }

  // Check for NaN values
  if (isNaN(result.totalYears)) {
    issues.push('Experience years is NaN');
  }

  if (isNaN(result.confidence)) {
    issues.push('Confidence is NaN');
  }

  // Apply corrections if needed
  let correctedResult: ExperienceParseResult | undefined;
  if (issues.length > 0) {
    correctedResult = {
      ...result,
      totalYears: Math.max(0, Math.min(60, isNaN(result.totalYears) ? 0 : result.totalYears)),
      confidence: Math.max(0.1, Math.min(1.0, isNaN(result.confidence) ? 0.1 : result.confidence))
    };
  }

  return {
    isValid: issues.length === 0,
    issues,
    correctedResult
  };
}

// Export types for use in other modules
export type { ExperienceParseResult };