/**
 * Consistency Testing Utility
 *
 * This module provides tools to test and validate the consistency
 * of AI scoring across multiple runs with the same inputs.
 */

import { logger } from "./logger";
import { validateScoreConsistency } from "./consistent-scoring";
import * as groq from "./groq";
import type {
  AnalyzeResumeResponse,
  AnalyzeJobDescriptionResponse,
  MatchAnalysisResponse,
} from "@shared/schema";

export interface ConsistencyTestResult {
  testId: string;
  inputs: {
    resumeText: string;
    jobText: string;
  };
  results: {
    run: number;
    matchPercentage: number;
    matchedSkillsCount: number;
    confidenceLevel: string;
    timestamp: string;
  }[];
  analysis: {
    isConsistent: boolean;
    variance: number;
    recommendation: string;
    averageScore: number;
    minScore: number;
    maxScore: number;
    range: number;
  };
}

export class ConsistencyTester {
  private testResults: Map<string, ConsistencyTestResult> = new Map();

  /**
   * Run consistency test for resume-job matching
   */
  async testMatchConsistency(
    resumeText: string,
    jobText: string,
    runs: number = 5,
    testId?: string,
  ): Promise<ConsistencyTestResult> {
    const id = testId || `test_${Date.now()}`;

    logger.info(`Starting consistency test: ${id} with ${runs} runs`);

    // First, analyze resume and job separately (these should also be consistent)
    const resumeAnalysis = await groq.analyzeResume(resumeText);
    const jobAnalysis = await groq.analyzeJobDescription("Test Job", jobText);

    const results: ConsistencyTestResult["results"] = [];

    // Run multiple analyses
    for (let i = 1; i <= runs; i++) {
      logger.debug(`Running consistency test ${id}, iteration ${i}/${runs}`);

      try {
        const matchResult = await groq.analyzeMatch(
          resumeAnalysis,
          jobAnalysis,
          resumeText,
          jobText,
        );

        results.push({
          run: i,
          matchPercentage: matchResult.matchPercentage || 0,
          matchedSkillsCount: matchResult.matchedSkills?.length || 0,
          confidenceLevel: matchResult.confidenceLevel || "unknown",
          timestamp: new Date().toISOString(),
        });

        // Small delay to avoid overwhelming the API
        if (i < runs) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } catch (error) {
        logger.error(`Error in consistency test run ${i}`, error);
        results.push({
          run: i,
          matchPercentage: 0,
          matchedSkillsCount: 0,
          confidenceLevel: "error",
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Analyze consistency
    const scores = results.map((r) => ({ matchPercentage: r.matchPercentage }));
    const consistency = validateScoreConsistency(scores);

    const scoreValues = results
      .map((r) => r.matchPercentage)
      .filter((s) => s > 0);
    const averageScore =
      scoreValues.length > 0
        ? scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length
        : 0;
    const minScore = Math.min(...scoreValues);
    const maxScore = Math.max(...scoreValues);
    const range = maxScore - minScore;

    const testResult: ConsistencyTestResult = {
      testId: id,
      inputs: { resumeText, jobText },
      results,
      analysis: {
        ...consistency,
        averageScore,
        minScore,
        maxScore,
        range,
      },
    };

    this.testResults.set(id, testResult);

    logger.info(`Consistency test ${id} completed`, {
      isConsistent: consistency.isConsistent,
      variance: consistency.variance.toFixed(2),
      averageScore: averageScore.toFixed(1),
      range: range.toFixed(1),
    });

    return testResult;
  }

  /**
   * Get all test results
   */
  getAllResults(): ConsistencyTestResult[] {
    return Array.from(this.testResults.values());
  }

  /**
   * Get specific test result
   */
  getResult(testId: string): ConsistencyTestResult | undefined {
    return this.testResults.get(testId);
  }

  /**
   * Clear all test results
   */
  clearResults(): void {
    this.testResults.clear();
    logger.info("Consistency test results cleared");
  }

  /**
   * Generate consistency report
   */
  generateReport(): {
    totalTests: number;
    consistentTests: number;
    consistencyRate: number;
    averageVariance: number;
    recommendations: string[];
  } {
    const results = this.getAllResults();

    if (results.length === 0) {
      return {
        totalTests: 0,
        consistentTests: 0,
        consistencyRate: 0,
        averageVariance: 0,
        recommendations: ["No tests have been run yet"],
      };
    }

    const consistentTests = results.filter(
      (r) => r.analysis.isConsistent,
    ).length;
    const consistencyRate = (consistentTests / results.length) * 100;
    const averageVariance =
      results.reduce((sum, r) => sum + r.analysis.variance, 0) / results.length;

    const recommendations: string[] = [];

    if (consistencyRate < 80) {
      recommendations.push(
        "Consistency rate below 80%. Consider adjusting prompts or model parameters.",
      );
    }

    if (averageVariance > 10) {
      recommendations.push(
        "High average variance detected. Review scoring rubrics and normalization.",
      );
    }

    const highRangeTests = results.filter((r) => r.analysis.range > 15).length;
    if (highRangeTests > 0) {
      recommendations.push(
        `${highRangeTests} tests showed high score range (>15 points). Check input quality.`,
      );
    }

    if (recommendations.length === 0) {
      recommendations.push(
        "Consistency metrics look good. Continue monitoring.",
      );
    }

    return {
      totalTests: results.length,
      consistentTests,
      consistencyRate,
      averageVariance,
      recommendations,
    };
  }

  /**
   * Export results for analysis
   */
  exportResults(): string {
    const results = this.getAllResults();
    return JSON.stringify(results, null, 2);
  }
}

// Singleton instance
export const consistencyTester = new ConsistencyTester();

// Quick test function for debugging
export async function quickConsistencyTest(
  resumeText: string,
  jobText: string,
  runs: number = 3,
): Promise<boolean> {
  logger.info("Running quick consistency test");

  const result = await consistencyTester.testMatchConsistency(
    resumeText,
    jobText,
    runs,
    `quick_${Date.now()}`,
  );

  const isConsistent = result.analysis.isConsistent;
  const variance = result.analysis.variance;

  console.log(`\n🧪 Quick Consistency Test Results:`);
  console.log(`✅ Consistent: ${isConsistent}`);
  console.log(`📊 Variance: ${variance.toFixed(2)}`);
  console.log(`📈 Average Score: ${result.analysis.averageScore.toFixed(1)}`);
  console.log(`📏 Range: ${result.analysis.range.toFixed(1)}`);
  console.log(`💡 ${result.analysis.recommendation}\n`);

  return isConsistent;
}
