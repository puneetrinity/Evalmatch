/**
 * This file handles storage initialization, providing intelligent switching between
 * database and in-memory storage with robust fallback mechanisms.
 * 
 * The hybrid storage approach maintains application availability even during
 * database connectivity issues, providing seamless user experience.
 */
import { IStorage } from './storage';
import { MemStorage } from './storage';
import { config } from './config';

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
      const { DatabaseStorage } = await import('./database-storage.js');
      const { HybridStorage } = await import('./hybrid-storage.js');
      
      // Create the database storage implementation
      const dbStorage = new DatabaseStorage();
      
      // Wrap it in the hybrid storage for reliability
      storageImplementation = new HybridStorage(dbStorage);
      console.log('Using hybrid PostgreSQL storage with automatic fallback');
    } catch (error) {
      console.error('Failed to initialize database storage:', error);
      console.warn('Falling back to in-memory storage');
      storageImplementation = new MemStorage();
    }
  } else {
    console.log('Using in-memory storage');
    storageImplementation = new MemStorage();
  }
  
  return storageImplementation;
}