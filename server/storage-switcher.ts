/**
 * This file handles storage initialization, providing intelligent switching between
 * database and in-memory storage with robust fallback mechanisms.
 * 
 * The hybrid storage approach maintains application availability even during
 * database connectivity issues, providing seamless user experience.
 * 
 * RACE CONDITION FIXES:
 * - Added initialization mutex to prevent concurrent initialization
 * - Added initialization state tracking with proper validation
 * - Added timeout handling for initialization operations
 * - Added proper cleanup on failed initialization
 */
import { IStorage } from './storage';
import { MemStorage } from './storage';
import { config } from './config/unified-config';
import { logger } from './config/logger';

// Storage initialization state management
interface StorageInitializationState {
  isInitializing: boolean;
  isInitialized: boolean;
  initializationStartTime: number | null;
  lastInitializationError: Error | null;
  initializationAttempts: number;
  maxRetries: number;
  initializationTimeout: number;
}

// Global storage state
let storageImplementation: IStorage | null = null;
let initializationState: StorageInitializationState = {
  isInitializing: false,
  isInitialized: false,
  initializationStartTime: null,
  lastInitializationError: null,
  initializationAttempts: 0,
  maxRetries: config.storage.initialization.maxRetries,
  initializationTimeout: config.storage.initialization.timeoutMs,
};

// Initialization mutex using a promise-based semaphore
let initializationMutex: Promise<IStorage> | null = null;

/**
 * Thread-safe storage initialization with race condition protection
 */
export async function initializeStorage(): Promise<IStorage> {
  // If already initialized, return immediately
  if (storageImplementation && initializationState.isInitialized) {
    logger.debug('Storage already initialized, returning existing instance');
    return storageImplementation;
  }
  
  // If another thread is initializing, wait for it to complete
  if (initializationMutex) {
    logger.debug('Storage initialization in progress, waiting for completion');
    try {
      return await initializationMutex;
    } catch (error) {
      // If the other initialization failed, we'll try again below
      logger.warn('Previous storage initialization failed, attempting new initialization', error);
      initializationMutex = null;
    }
  }
  
  // Check for timeout on previous initialization attempts
  if (initializationState.isInitializing && initializationState.initializationStartTime) {
    const elapsed = Date.now() - initializationState.initializationStartTime;
    if (elapsed > initializationState.initializationTimeout) {
      logger.error('Storage initialization timed out, resetting state', {
        elapsed,
        timeout: initializationState.initializationTimeout,
        attempts: initializationState.initializationAttempts,
      });
      resetInitializationState();
    }
  }
  
  // Start initialization with mutex protection
  initializationMutex = performStorageInitialization();
  
  try {
    return await initializationMutex;
  } finally {
    // Clear mutex after initialization completes (success or failure)
    initializationMutex = null;
  }
}

/**
 * Perform the actual storage initialization with proper error handling
 */
async function performStorageInitialization(): Promise<IStorage> {
  // Check retry limits
  if (initializationState.initializationAttempts >= initializationState.maxRetries) {
    logger.error('Maximum storage initialization attempts exceeded', {
      attempts: initializationState.initializationAttempts,
      maxRetries: initializationState.maxRetries,
      lastError: initializationState.lastInitializationError?.message,
    });
    return createFallbackStorage();
  }
  
  // Set initialization state
  initializationState.isInitializing = true;
  initializationState.initializationStartTime = Date.now();
  initializationState.initializationAttempts++;
  
  logger.info('Starting storage initialization', {
    attempt: initializationState.initializationAttempts,
    maxRetries: initializationState.maxRetries,
    hasDatabase: !!(process.env.NODE_ENV === 'production' || process.env.DATABASE_URL),
  });
  
  try {
    let storage: IStorage;
    
    // Choose storage implementation based on environment
    if (process.env.NODE_ENV === 'production' || process.env.DATABASE_URL) {
      try {
        logger.debug('Attempting to initialize database storage');
        
        // Import modules only when needed with timeout
        const importPromise = Promise.all([
          import('./database-storage'),
          import('./hybrid-storage'),
        ]);
        
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Module import timeout')), 10000);
        });
        
        const [{ DatabaseStorage }, { HybridStorage }] = await Promise.race([
          importPromise,
          timeoutPromise,
        ]);
        
        // Create the database storage implementation with validation
        logger.debug('Creating database storage instance');
        const dbStorage = new DatabaseStorage();
        
        // Test database storage before wrapping
        await validateStorageInstance(dbStorage, 'database');
        
        // Wrap it in the hybrid storage for reliability
        logger.debug('Creating hybrid storage wrapper');
        storage = new HybridStorage(dbStorage);
        
        // Final validation of hybrid storage
        await validateStorageInstance(storage, 'hybrid');
        
        logger.info('Successfully initialized hybrid PostgreSQL storage with automatic fallback');
      } catch (error) {
        logger.error('Failed to initialize database storage', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          attempt: initializationState.initializationAttempts,
        });
        
        initializationState.lastInitializationError = error instanceof Error ? error : new Error(String(error));
        
        // Fall back to memory storage
        logger.warn('Falling back to in-memory storage due to database initialization failure');
        storage = await createFallbackStorage();
      }
    } else {
      logger.info('Development/test environment detected, using in-memory storage');
      storage = await createFallbackStorage();
    }
    
    // Successful initialization
    storageImplementation = storage;
    initializationState.isInitialized = true;
    initializationState.isInitializing = false;
    initializationState.lastInitializationError = null;
    
    logger.info('Storage initialization completed successfully', {
      storageType: storage.constructor.name,
      attempt: initializationState.initializationAttempts,
      duration: Date.now() - (initializationState.initializationStartTime || Date.now()),
    });
    
    return storage;
  } catch (error) {
    // Initialization failed
    const errorObj = error instanceof Error ? error : new Error(String(error));
    initializationState.lastInitializationError = errorObj;
    initializationState.isInitializing = false;
    
    logger.error('Storage initialization failed completely', {
      error: errorObj.message,
      stack: errorObj.stack,
      attempt: initializationState.initializationAttempts,
      duration: Date.now() - (initializationState.initializationStartTime || Date.now()),
    });
    
    // If we still have retries left, throw error to trigger retry
    if (initializationState.initializationAttempts < initializationState.maxRetries) {
      throw errorObj;
    }
    
    // No more retries, return fallback storage
    logger.warn('Maximum initialization attempts exceeded, using fallback storage');
    const fallbackStorage = new MemStorage();
    storageImplementation = fallbackStorage;
    initializationState.isInitialized = true;
    initializationState.isInitializing = false;
    
    return fallbackStorage;
  }
}

/**
 * Create fallback memory storage with validation
 */
async function createFallbackStorage(): Promise<MemStorage> {
  logger.debug('Creating fallback memory storage');
  const storage = new MemStorage();
  await validateStorageInstance(storage, 'memory');
  return storage;
}

/**
 * Validate that a storage instance is properly initialized and functional
 */
async function validateStorageInstance(storage: IStorage, storageType: string): Promise<void> {
  if (!storage) {
    throw new Error(`${storageType} storage instance is null or undefined`);
  }
  
  logger.debug(`Validating ${storageType} storage instance`);
  
  try {
    // Basic method existence checks
    const requiredMethods: (keyof IStorage)[] = ['getJobDescriptions', 'getResumes', 'createJobDescription'];
    for (const method of requiredMethods) {
      if (typeof storage[method] !== 'function') {
        throw new Error(`${storageType} storage missing required method: ${method}`);
      }
    }
    
    // Basic functional test (non-intrusive)
    const testResult = await Promise.race([
      storage.getJobDescriptions(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Storage validation timeout')), 5000);
      }),
    ]);
    
    // Result should be an array (even if empty)
    if (!Array.isArray(testResult)) {
      throw new Error(`${storageType} storage validation failed: getJobDescriptions() did not return an array`);
    }
    
    logger.debug(`${storageType} storage validation successful`);
  } catch (error) {
    logger.error(`${storageType} storage validation failed`, {
      error: error instanceof Error ? error.message : String(error),
      storageType,
    });
    throw new Error(`${storageType} storage validation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Reset initialization state (used for timeout recovery)
 */
function resetInitializationState(): void {
  logger.debug('Resetting storage initialization state');
  initializationState.isInitializing = false;
  initializationState.initializationStartTime = null;
  initializationState.initializationAttempts = Math.max(0, initializationState.initializationAttempts - 1); // Allow one more retry
}

/**
 * Get current storage initialization status (for monitoring)
 */
export function getStorageInitializationStatus(): StorageInitializationState & {
  hasStorage: boolean;
  storageType: string | null;
} {
  return {
    ...initializationState,
    hasStorage: storageImplementation !== null,
    storageType: storageImplementation?.constructor.name || null,
  };
}

/**
 * Force storage reinitialization (use with caution)
 */
export async function reinitializeStorage(): Promise<IStorage> {
  logger.warn('Forcing storage reinitialization');
  
  // Clear existing state
  storageImplementation = null;
  initializationState = {
    isInitializing: false,
    isInitialized: false,
    initializationStartTime: null,
    lastInitializationError: null,
    initializationAttempts: 0,
    maxRetries: config.storage.initialization.maxRetries,
    initializationTimeout: config.storage.initialization.timeoutMs,
  };
  initializationMutex = null;
  
  // Re-initialize
  return await initializeStorage();
}