/**
 * This file handles storage initialization, providing intelligent switching between
 * database and in-memory storage with robust fallback mechanisms.
 * 
 * The hybrid storage approach maintains application availability even during
 * database connectivity issues, providing seamless user experience.
 */
import { IStorage } from './storage';
import { MemStorage } from './storage';
import { config } from './config/unified-config';
import { logger } from './config/logger';

let storageImplementation: IStorage | null = null;

export async function initializeStorage(): Promise<IStorage> {
  // If we've already initialized, return the existing instance
  if (storageImplementation) {
    return storageImplementation;
  }
  
  // Choose storage implementation based on environment
  if (process.env.NODE_ENV === 'production' || process.env.DATABASE_URL) {
    try {
      // Import modules only when needed
      const { DatabaseStorage } = await import('./database-storage');
      const { HybridStorage } = await import('./hybrid-storage');
      
      // Create the database storage implementation
      const dbStorage = new DatabaseStorage();
      
      // Wrap it in the hybrid storage for reliability
      storageImplementation = new HybridStorage(dbStorage);
      logger.info('Using hybrid PostgreSQL storage with automatic fallback');
    } catch (error) {
      logger.error('Failed to initialize database storage:', error);
      logger.warn('Falling back to in-memory storage');
      storageImplementation = new MemStorage();
    }
  } else {
    logger.info('Using in-memory storage');
    storageImplementation = new MemStorage();
  }
  
  return storageImplementation;
}