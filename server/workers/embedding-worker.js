/**
 * Phase 3.1: Production-Safe Embedding Worker
 * 
 * Real file (not eval:true) with ESM compatibility and proper error handling.
 * Implements worker thread isolation for embedding generation with model caching.
 */

// ✅ CRITICAL: Real file (not eval: true) with ESM compatibility
import { parentPort } from 'worker_threads';
import { pipeline } from '@xenova/transformers';
import { env } from '@xenova/transformers';

// ✅ RAILWAY-SPECIFIC: Configure persistent caching to avoid re-downloads
// Use persistent volume or local cache directory instead of /tmp
const cacheDir = process.env.XDG_CACHE_HOME || process.env.HOME + '/.cache' || '/tmp';
env.cacheDir = cacheDir + '/transformers';
env.allowLocalModels = true;
env.allowRemoteModels = true;

let model = null;
let isModelLoading = false;

// ✅ CRITICAL: Proper error handling and model loading
async function initializeModel(modelName) {
  if (isModelLoading) return;
  if (model) return;

  try {
    isModelLoading = true;
    console.log(`🔥 Loading embedding model: ${modelName}`, {
      cacheDir: env.cacheDir,
      environment: process.env.NODE_ENV || 'unknown',
      railwayEnvironment: process.env.RAILWAY_ENVIRONMENT || 'unknown'
    });
    model = await pipeline('feature-extraction', modelName);
    console.log('✅ Embedding model loaded successfully', {
      model: modelName,
      cacheLocation: env.cacheDir
    });
  } catch (error) {
    console.error('Failed to load embedding model:', error);
    throw error;
  } finally {
    isModelLoading = false;
  }
}

// ✅ CRITICAL: L2 normalization for consistent embeddings
function l2Normalize(embedding) {
  const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (norm === 0) return embedding; // Prevent division by zero
  return embedding.map(val => val / norm);
}

// ✅ CRITICAL: Validate embedding dimensions and properties
function validateEmbedding(embedding, expectedDimensions = 384) {
  if (!Array.isArray(embedding)) {
    throw new Error('Embedding must be an array');
  }
  
  if (embedding.length !== expectedDimensions) {
    throw new Error(`Expected ${expectedDimensions} dimensions, got ${embedding.length}`);
  }
  
  // Check for invalid values (NaN, Infinity)
  const hasInvalidValues = embedding.some(val => !isFinite(val));
  if (hasInvalidValues) {
    throw new Error('Embedding contains invalid values (NaN or Infinity)');
  }
  
  return true;
}

parentPort.on('message', async ({ id, text, modelName, options: _options = {} }) => {
  try {
    await initializeModel(modelName);

    if (!model) {
      throw new Error('Model failed to initialize');
    }

    // Generate embedding
    const startTime = Date.now();
    const output = await model(text);
    
    // Extract embedding array from output
    let embedding;
    if (output?.data) {
      embedding = Array.from(output.data);
    } else if (Array.isArray(output)) {
      embedding = Array.from(output);
    } else if (output?.length) {
      embedding = Array.from(output);
    } else {
      throw new Error('Invalid embedding output format');
    }

    // ✅ CRITICAL: Validate and normalize embedding
    validateEmbedding(embedding, 384);
    const normalizedEmbedding = l2Normalize(embedding);
    
    // Calculate L2 norm for verification
    const norm = Math.sqrt(normalizedEmbedding.reduce((sum, val) => sum + val * val, 0));
    const processingTime = Date.now() - startTime;

    // Send result back to main thread
    parentPort.postMessage({
      id,
      success: true,
      embedding: normalizedEmbedding,
      dimensions: normalizedEmbedding.length,
      norm: norm,
      processingTime,
      modelName,
      textLength: text.length
    });

  } catch (error) {
    // ✅ CRITICAL: Proper error reporting
    console.error('Embedding generation error:', {
      id,
      error: error.message,
      modelName,
      textLength: text?.length || 0
    });

    parentPort.postMessage({
      id,
      success: false,
      error: error.message,
      modelName,
      textLength: text?.length || 0
    });
  }
});

// ✅ CRITICAL: Handle worker lifecycle
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception in embedding worker:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, _promise) => {
  console.error('Unhandled rejection in embedding worker:', reason);
  process.exit(1);
});

// ✅ Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('Embedding worker received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Embedding worker received SIGINT, shutting down gracefully');
  process.exit(0);
});

console.log('Embedding worker initialized and ready for requests');