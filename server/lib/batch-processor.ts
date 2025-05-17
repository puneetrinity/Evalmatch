/**
 * Batch processing utilities for handling large datasets efficiently
 * Improves performance when processing multiple resumes or job descriptions
 */

import { analysisCache, generateMatchAnalysisKey } from './cache';
import type { Resume, JobDescription } from '@shared/schema';

/**
 * Process a batch of items with controlled concurrency
 * @param items - Array of items to process
 * @param processFn - Async function to process each item
 * @param concurrency - Maximum number of concurrent operations
 * @returns Array of results in the same order as the input
 */
export async function processBatch<T, R>(
  items: T[],
  processFn: (item: T, index: number) => Promise<R>,
  concurrency: number = 3
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  // Process items in batches with controlled concurrency
  async function processNext(): Promise<void> {
    const index = currentIndex++;
    if (index >= items.length) return;

    try {
      results[index] = await processFn(items[index], index);
    } catch (error) {
      console.error(`Error processing item at index ${index}:`, error);
      // Store error in results array
      results[index] = { error: error.message } as any;
    }

    // Process next item
    return processNext();
  }

  // Start initial batch of concurrent processes
  const initialBatch = Array(Math.min(concurrency, items.length))
    .fill(0)
    .map(() => processNext());

  // Wait for all processes to complete
  await Promise.all(initialBatch);

  return results;
}

/**
 * Process a batch of resumes against a job description
 * Uses caching to avoid redundant processing
 */
export async function processResumesBatch(
  resumes: Resume[],
  jobDescription: JobDescription,
  processFn: (resume: Resume, jobDescription: JobDescription) => Promise<any>,
  options: { concurrency?: number; useCache?: boolean } = {}
): Promise<any[]> {
  const { concurrency = 3, useCache = true } = options;

  return processBatch(
    resumes,
    async (resume) => {
      // Check cache first if enabled
      if (useCache) {
        const cacheKey = generateMatchAnalysisKey(resume.id, jobDescription.id);
        const cachedResult = analysisCache.get(cacheKey);
        if (cachedResult) {
          console.log(`Using cached analysis for resume ${resume.id} and job ${jobDescription.id}`);
          return cachedResult;
        }
      }

      // Process and cache result
      const result = await processFn(resume, jobDescription);
      
      if (useCache) {
        const cacheKey = generateMatchAnalysisKey(resume.id, jobDescription.id);
        analysisCache.set(cacheKey, result);
      }
      
      return result;
    },
    concurrency
  );
}

/**
 * Process large text in chunks to avoid hitting token limits
 * Useful for very large resumes or job descriptions
 */
export function processLargeText(text: string, maxChunkSize: number = 8000): string[] {
  const chunks: string[] = [];
  
  // Simple chunking by character count
  for (let i = 0; i < text.length; i += maxChunkSize) {
    chunks.push(text.slice(i, i + maxChunkSize));
  }
  
  return chunks;
}

/**
 * Generate chunk-based embedding for large documents
 * Breaks text into chunks, generates embeddings, and combines results
 */
export async function processLargeDocument(
  text: string,
  processFn: (chunk: string) => Promise<any>,
  combineResults: (results: any[]) => any,
  chunkSize: number = 8000
): Promise<any> {
  const chunks = processLargeText(text, chunkSize);
  
  // Process chunks in parallel with controlled concurrency
  const chunkResults = await processBatch(
    chunks,
    processFn,
    3 // Limit concurrency to 3 chunks at a time
  );
  
  // Combine results from all chunks
  return combineResults(chunkResults);
}