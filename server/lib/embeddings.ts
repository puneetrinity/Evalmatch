import { pipeline, FeatureExtractionPipeline } from "@xenova/transformers";
import { logger } from "./logger";
import { embeddingManager } from "./embedding-manager";

// Global embedding pipeline
let embeddingPipeline: FeatureExtractionPipeline | null = null;

/**
 * Initialize the embedding pipeline
 * With 8GB RAM, we can use better models for higher accuracy
 */
async function initializeEmbeddingPipeline(): Promise<FeatureExtractionPipeline> {
  if (!embeddingPipeline) {
    try {
      logger.info("Initializing sentence-transformers embedding pipeline");

      // With 8GB RAM, we can use better models
      const modelName =
        process.env.EMBEDDING_MODEL || "Xenova/all-MiniLM-L12-v2"; // 134MB, better accuracy

      embeddingPipeline = (await pipeline("feature-extraction", modelName, {
        progress_callback: (progress: { status?: string; file?: string; progress?: number }) => {
          if (
            progress?.status === "downloading" &&
            typeof progress.progress === "number"
          ) {
            logger.info(
              `Downloading embedding model (${modelName}): ${Math.round(progress.progress)}%`,
            );
          }
        },
        // Optimize for Railway deployment
        cache_dir:
          process.env.NODE_ENV === "production"
            ? "/tmp/transformers_cache"
            : undefined,
        // dtype: 'fp32' // Full precision with 8GB RAM
      })) as FeatureExtractionPipeline;
      logger.info(
        `Embedding pipeline initialized successfully with model: ${modelName}`,
      );
    } catch (error) {
      logger.error("Failed to initialize embedding pipeline:", error);
      throw error;
    }
  }
  return embeddingPipeline;
}

/**
 * Generate embeddings for text using local model
 * Falls back to OpenAI if local model fails
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  // Use embedding manager for caching and memory management
  return embeddingManager.getEmbedding(text, async (textToEmbed) => {
    try {
      // Try local model first
      const pipeline = await initializeEmbeddingPipeline();
      const result = await pipeline(textToEmbed, { pooling: "mean", normalize: true });

      // Convert to regular array
      if (
        result &&
        typeof result === "object" &&
        "data" in result &&
        result.data
      ) {
        return Array.from(result.data as ArrayLike<number>);
      } else {
        throw new Error("Invalid embedding result format");
      }
    } catch (error) {
      logger.warn("Local embedding failed, falling back to OpenAI:", error);

      // Fallback to OpenAI embeddings
      try {
        const openaiModule = await import("./openai");
        return await openaiModule.generateEmbedding(textToEmbed);
      } catch (fallbackError) {
        logger.error("Both local and OpenAI embedding failed:", fallbackError);
        throw fallbackError;
      }
    }
  });
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  // Handle empty arrays
  if (a.length === 0 || b.length === 0) {
    logger.warn("Cosine similarity called with empty vector(s)", {
      aLength: a.length,
      bLength: b.length,
    });
    return 0; // Empty vectors have no similarity
  }

  if (a.length !== b.length) {
    logger.error("Cosine similarity vector length mismatch", {
      aLength: a.length,
      bLength: b.length,
    });
    throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  let validElements = 0;

  for (let i = 0; i < a.length; i++) {
    // Skip NaN or infinite values
    if (!isFinite(a[i]) || !isFinite(b[i])) {
      logger.warn("Invalid values in cosine similarity calculation", {
        index: i,
        aValue: a[i],
        bValue: b[i],
      });
      continue;
    }
    
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
    validElements++;
  }

  // Check if we have any valid elements to work with
  if (validElements === 0) {
    logger.warn("No valid elements found for cosine similarity calculation");
    return 0;
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  // Handle zero vectors (all elements are zero)
  if (normA === 0 && normB === 0) {
    // Both vectors are zero vectors - they are identical
    logger.debug("Both vectors are zero vectors, returning perfect similarity");
    return 1.0;
  }

  if (normA === 0 || normB === 0) {
    // One vector is zero, the other is not - no similarity
    logger.debug("One vector is zero vector, returning no similarity");
    return 0;
  }

  const similarity = dotProduct / (normA * normB);

  // Final validation of result
  if (!isFinite(similarity)) {
    logger.error("Cosine similarity calculation produced invalid result", {
      dotProduct,
      normA,
      normB,
      similarity,
    });
    return 0;
  }

  // Clamp result to valid range [-1, 1] (though for embeddings it should be [0, 1])
  return Math.max(-1, Math.min(1, similarity));
}

/**
 * Generate embeddings for multiple texts in batch
 * Optimized for Railway's 8GB memory with concurrency control
 */
export async function generateBatchEmbeddings(
  texts: string[],
): Promise<number[][]> {
  const embeddings: number[][] = [];
  const maxConcurrent = parseInt(process.env.MAX_CONCURRENT_EMBEDDINGS || "3");
  const startMemory = process.memoryUsage().heapUsed;

  // Process in batches to optimize memory usage
  for (let i = 0; i < texts.length; i += maxConcurrent) {
    // Check memory before processing batch
    const currentMemory = process.memoryUsage().heapUsed;
    const memoryDelta = currentMemory - startMemory;
    
    if (memoryDelta > 200 * 1024 * 1024) { // 200MB increase
      logger.warn("High memory usage in batch embeddings, forcing garbage collection", {
        batchIndex: i,
        memoryDeltaMB: Math.round(memoryDelta / 1024 / 1024),
        processed: i
      });
      
      if (global.gc) {
        global.gc();
      }
    }

    const batch = texts.slice(i, i + maxConcurrent);
    const batchPromises = batch.map((text) => generateEmbedding(text));

    try {
      const batchResults = await Promise.all(batchPromises);
      embeddings.push(...batchResults);
    } catch (error) {
      logger.error(
        `Error processing embedding batch ${i}-${i + maxConcurrent}:`,
        error,
      );
      // Process individually as fallback
      for (const text of batch) {
        try {
          const embedding = await generateEmbedding(text);
          embeddings.push(embedding);
        } catch (individualError) {
          logger.error("Individual embedding failed:", {
            error: individualError instanceof Error ? individualError.message : "Unknown error",
            text: text.substring(0, 100), // Log first 100 chars for debugging
          });
          // Don't push empty embeddings - they cause downstream calculation issues
          // Instead, generate a zero vector with the expected dimensionality
          const _pipeline = embeddingPipeline || await initializeEmbeddingPipeline();
          const expectedDim = 384; // Default dimension for sentence-transformers/all-MiniLM-L6-v2
          const zeroVector = new Array(expectedDim).fill(0);
          embeddings.push(zeroVector);
        }
      }
    }
  }

  return embeddings;
}

/**
 * Find most similar text to query from a list of candidates
 */
export async function findMostSimilar(
  query: string,
  candidates: string[],
): Promise<{ text: string; similarity: number; index: number }> {
  const queryEmbedding = await generateEmbedding(query);
  const candidateEmbeddings = await generateBatchEmbeddings(candidates);

  let maxSimilarity = -1;
  let mostSimilarIndex = -1;

  for (let i = 0; i < candidateEmbeddings.length; i++) {
    const similarity = cosineSimilarity(queryEmbedding, candidateEmbeddings[i]);
    if (similarity > maxSimilarity) {
      maxSimilarity = similarity;
      mostSimilarIndex = i;
    }
  }

  return {
    text: candidates[mostSimilarIndex],
    similarity: maxSimilarity,
    index: mostSimilarIndex,
  };
}

/**
 * Calculate semantic similarity between resume and job description
 * LEGACY: This generates embeddings on-the-fly (slow)
 * Use calculateSemanticSimilarityFromEmbeddings() for better performance when embeddings are stored
 */
export async function calculateSemanticSimilarity(
  resumeText: string,
  jobDescriptionText: string,
): Promise<number> {
  try {
    const resumeEmbedding = await generateEmbedding(resumeText);
    const jobEmbedding = await generateEmbedding(jobDescriptionText);

    const similarity = cosineSimilarity(resumeEmbedding, jobEmbedding);

    // Convert to 0-100 scale
    return Math.max(0, Math.min(100, similarity * 100));
  } catch (error) {
    logger.error("Error calculating semantic similarity:", error);
    return 0;
  }
}

/**
 * Calculate semantic similarity using pre-stored embeddings (OPTIMIZED)
 * This is much faster than generateEmbedding on-the-fly
 */
export function calculateSemanticSimilarityFromEmbeddings(
  resumeEmbedding: number[] | null,
  jobEmbedding: number[] | null,
): number {
  try {
    // Check if embeddings exist
    if (!resumeEmbedding || !jobEmbedding) {
      logger.warn("Cannot calculate semantic similarity: missing embeddings", {
        hasResumeEmbedding: !!resumeEmbedding,
        hasJobEmbedding: !!jobEmbedding
      });
      return 0;
    }

    const similarity = cosineSimilarity(resumeEmbedding, jobEmbedding);

    // Convert to 0-100 scale
    return Math.max(0, Math.min(100, similarity * 100));
  } catch (error) {
    logger.error("Error calculating semantic similarity from embeddings:", error);
    return 0;
  }
}
