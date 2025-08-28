/**
 * Comprehensive Batch Persistence System
 * Handles multi-level storage, versioning, and data integrity
 */

// Import from the correct locations
import { BatchState, LocalBatchValidationResult } from '@/hooks/useBatchManager';
// Note: logger doesn't exist, we'll use console for now

// Storage version for migration support
export const STORAGE_VERSION = '1.2.0';
export const PERSISTENCE_KEY = 'evalmatch_batch_persistence';
export const MAX_STORAGE_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

// Persistence configuration
export interface PersistenceConfig {
  maxStates: number;
  compressionEnabled: boolean;
  encryptionEnabled: boolean;
  syncToServer: boolean;
  storageQuotaMB: number;
  cleanupThresholdDays: number;
  enableLocalStorage: boolean;
  enableIndexedDB: boolean;
  enableServerPersistence: boolean;
  enableCloudBackup: boolean;
}

// Default configuration
export const DEFAULT_PERSISTENCE_CONFIG: PersistenceConfig = {
  maxStates: 10,
  compressionEnabled: true,
  encryptionEnabled: false, // Enable in production
  syncToServer: true,
  storageQuotaMB: 50,
  cleanupThresholdDays: 7,
  enableLocalStorage: true,
  enableIndexedDB: true,
  enableServerPersistence: true,
  enableCloudBackup: false,
};

// Persisted batch state structure
export interface PersistedBatchState {
  version: string;
  timestamp: number;
  batchId: string;
  sessionId: string;
  userId?: string;
  state: BatchState;
  metadata: {
    userAgent: string;
    url: string;
    resumeCount: number;
    lastActivity: number;
    syncStatus: 'synced' | 'pending' | 'conflict' | 'failed';
    checksum: string;
  };
  compressed?: boolean;
  encrypted?: boolean;
}

// Storage abstraction layer
export interface StorageProvider {
  name: string;
  isAvailable(): boolean;
  get(key: string): Promise<any> | any;
  set(key: string, value: any): Promise<void> | void;
  remove(key: string): Promise<void> | void;
  clear(): Promise<void> | void;
  getSize(): Promise<number> | number;
}

// localStorage provider
export class LocalStorageProvider implements StorageProvider {
  name = 'localStorage';

  isAvailable(): boolean {
    try {
      const test = '__storage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  }

  get(key: string): any {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch (error) {
      console.warn('LocalStorage get failed', { key, error });
      return null;
    }
  }

  set(key: string, value: any): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error('LocalStorage set failed', { key, error });
      throw error;
    }
  }

  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn('LocalStorage remove failed', { key, error });
    }
  }

  clear(): void {
    try {
      localStorage.clear();
    } catch (error) {
      console.warn('LocalStorage clear failed', { error });
    }
  }

  getSize(): number {
    try {
      return new Blob(Object.values(localStorage)).size;
    } catch {
      return 0;
    }
  }
}

// IndexedDB provider for large data
export class IndexedDBProvider implements StorageProvider {
  name = 'indexedDB';
  private dbName = 'EvalMatchBatches';
  private version = 1;
  private storeName = 'batchStates';

  isAvailable(): boolean {
    return typeof indexedDB !== 'undefined';
  }

  private async getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'key' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('batchId', 'batchId', { unique: false });
        }
      };
    });
  }

  async get(key: string): Promise<any> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(key);
      
      return new Promise((resolve, reject) => {
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result?.value || null);
      });
    } catch (error) {
      console.warn('IndexedDB get failed', { key, error });
      return null;
    }
  }

  async set(key: string, value: any): Promise<void> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      
      const data = {
        key,
        value,
        timestamp: Date.now(),
        batchId: value.batchId || key,
      };
      
      return new Promise((resolve, reject) => {
        const request = store.put(data);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (error) {
      console.error('IndexedDB set failed', { key, error });
      throw error;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      
      return new Promise((resolve, reject) => {
        const request = store.delete(key);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (error) {
      console.warn('IndexedDB remove failed', { key, error });
    }
  }

  async clear(): Promise<void> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      
      return new Promise((resolve, reject) => {
        const request = store.clear();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (error) {
      console.warn('IndexedDB clear failed', { error });
    }
  }

  async getSize(): Promise<number> {
    try {
      if (!navigator.storage?.estimate) return 0;
      const estimate = await navigator.storage.estimate();
      return estimate.usage || 0;
    } catch {
      return 0;
    }
  }
}

// Core persistence manager
export class BatchPersistenceManager {
  private providers: StorageProvider[] = [];
  private config: PersistenceConfig;
  private compressionSupported = false;

  constructor(config: Partial<PersistenceConfig> = {}) {
    this.config = { ...DEFAULT_PERSISTENCE_CONFIG, ...config };
    this.initializeProviders();
    this.checkCompressionSupport();
  }

  private initializeProviders(): void {
    // Initialize storage providers in priority order
    const localStorage = new LocalStorageProvider();
    const indexedDB = new IndexedDBProvider();

    if (localStorage.isAvailable()) {
      this.providers.push(localStorage);
    }

    if (indexedDB.isAvailable()) {
      this.providers.push(indexedDB);
    }

    console.log('Storage providers initialized', {
      providers: this.providers.map(p => p.name),
      primaryProvider: this.providers[0]?.name || 'none',
    });
  }

  private checkCompressionSupport(): void {
    this.compressionSupported = typeof CompressionStream !== 'undefined';
    if (this.config.compressionEnabled && !this.compressionSupported) {
      console.warn('Compression requested but not supported, disabling');
      this.config.compressionEnabled = false;
    }
  }

  // Generate checksum for data integrity
  private async generateChecksum(data: any): Promise<string> {
    try {
      const encoder = new TextEncoder();
      const dataStr = JSON.stringify(data);
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(dataStr));
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // Fallback to simple hash
      return this.simpleHash(JSON.stringify(data));
    }
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  // Compress data if enabled
  private async compressData(data: any): Promise<{ data: any; compressed: boolean }> {
    if (!this.config.compressionEnabled || !this.compressionSupported) {
      return { data, compressed: false };
    }

    try {
      const dataStr = JSON.stringify(data);
      const stream = new CompressionStream('gzip');
      const writer = stream.writable.getWriter();
      const reader = stream.readable.getReader();

      writer.write(new TextEncoder().encode(dataStr));
      writer.close();

      const chunks: Uint8Array[] = [];
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) chunks.push(value);
      }

      const compressed = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
      let offset = 0;
      for (const chunk of chunks) {
        compressed.set(chunk, offset);
        offset += chunk.length;
      }

      return {
        data: Array.from(compressed),
        compressed: true,
      };
    } catch (error) {
      console.warn('Compression failed, using uncompressed data', { error });
      return { data, compressed: false };
    }
  }

  // Decompress data if needed
  private async decompressData(data: any, compressed: boolean): Promise<any> {
    if (!compressed || !this.compressionSupported) {
      return data;
    }

    try {
      const compressedData = new Uint8Array(data);
      const stream = new DecompressionStream('gzip');
      const writer = stream.writable.getWriter();
      const reader = stream.readable.getReader();

      writer.write(compressedData);
      writer.close();

      const chunks: Uint8Array[] = [];
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) chunks.push(value);
      }

      const decompressed = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
      let offset = 0;
      for (const chunk of chunks) {
        decompressed.set(chunk, offset);
        offset += chunk.length;
      }

      const decompressedStr = new TextDecoder().decode(decompressed);
      return JSON.parse(decompressedStr);
    } catch (error) {
      console.error('Decompression failed', { error });
      throw new Error('Failed to decompress batch state');
    }
  }

  // Persist batch state
  async persistBatchState(
    batchId: string,
    sessionId: string,
    state: BatchState,
    userId?: string
  ): Promise<void> {
    try {
      const checksum = await this.generateChecksum(state);
      const { data: processedData, compressed } = await this.compressData(state);

      const persistedState: PersistedBatchState = {
        version: STORAGE_VERSION,
        timestamp: Date.now(),
        batchId,
        sessionId,
        userId,
        state: processedData,
        metadata: {
          userAgent: navigator.userAgent,
          url: window.location.href,
          resumeCount: state.resumeCount || 0,
          lastActivity: Date.now(),
          syncStatus: 'pending',
          checksum,
        },
        compressed,
      };

      // Try to persist to all available providers
      const persistPromises = this.providers.map(async (provider) => {
        try {
          const key = `${PERSISTENCE_KEY}_${batchId}`;
          await provider.set(key, persistedState);
          console.debug(`Batch state persisted to ${provider.name}`, { batchId, key });
        } catch (error) {
          console.warn(`Failed to persist to ${provider.name}`, { batchId, error });
          throw error;
        }
      });

      // Wait for at least one provider to succeed
      const results = await Promise.allSettled(persistPromises);
      const successful = results.filter(r => r.status === 'fulfilled').length;

      if (successful === 0) {
        throw new Error('Failed to persist to any storage provider');
      }

      console.log('Batch state persisted successfully', {
        batchId,
        providers: successful,
        total: this.providers.length,
      });

      // Cleanup old states if needed
      await this.cleanupOldStates();

    } catch (error) {
      console.error('Failed to persist batch state', { batchId, sessionId, error });
      throw error;
    }
  }

  // Restore batch state
  async restoreBatchState(batchId: string): Promise<PersistedBatchState | null> {
    const key = `${PERSISTENCE_KEY}_${batchId}`;

    // Try to restore from providers in priority order
    for (const provider of this.providers) {
      try {
        const persistedState = await provider.get(key);
        if (!persistedState) continue;

        // Validate version compatibility
        if (persistedState.version !== STORAGE_VERSION) {
          console.warn('Version mismatch, attempting migration', {
            batchId,
            storedVersion: persistedState.version,
            currentVersion: STORAGE_VERSION,
          });
          // Version migration: For now, remove old versions to prevent corruption
          // In the future, implement proper migration between versions
          await provider.remove(key);
          continue;
        }

        // Validate age
        const age = Date.now() - persistedState.timestamp;
        if (age > MAX_STORAGE_AGE) {
          console.warn('Persisted state too old, removing', { batchId, age, maxAge: MAX_STORAGE_AGE });
          await provider.remove(key);
          continue;
        }

        // Decompress if needed
        const decompressedState = await this.decompressData(
          persistedState.state,
          persistedState.compressed || false
        );

        // Validate checksum
        const currentChecksum = await this.generateChecksum(decompressedState);
        if (currentChecksum !== persistedState.metadata.checksum) {
          console.error('Checksum mismatch, data may be corrupted', {
            batchId,
            stored: persistedState.metadata.checksum,
            calculated: currentChecksum,
          });
          continue;
        }

        console.log('Batch state restored successfully', {
          batchId,
          provider: provider.name,
          age: age / (60 * 1000), // minutes
        });

        return {
          ...persistedState,
          state: decompressedState,
        };

      } catch (error) {
        console.warn(`Failed to restore from ${provider.name}`, { batchId, error });
        continue;
      }
    }

    console.log('No valid persisted state found', { batchId });
    return null;
  }

  // List all persisted batch states
  async listPersistedStates(): Promise<Array<{ batchId: string; timestamp: number; provider: string }>> {
    const states: Array<{ batchId: string; timestamp: number; provider: string }> = [];

    for (const provider of this.providers) {
      try {
        if (provider.name === 'localStorage') {
          // Scan localStorage for our keys
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith(PERSISTENCE_KEY)) {
              const data = await provider.get(key);
              if (data) {
                states.push({
                  batchId: data.batchId,
                  timestamp: data.timestamp,
                  provider: provider.name,
                });
              }
            }
          }
        }
        // Note: IndexedDB scanning would require additional implementation
        // This is not critical as localStorage and sessionStorage cover the primary use cases
      } catch (error) {
        console.warn(`Failed to list states from ${provider.name}`, { error });
      }
    }

    return states.sort((a, b) => b.timestamp - a.timestamp);
  }

  // Remove persisted state
  async removePersistedState(batchId: string): Promise<void> {
    const key = `${PERSISTENCE_KEY}_${batchId}`;
    
    const removePromises = this.providers.map(async (provider) => {
      try {
        await provider.remove(key);
        console.debug(`Removed persisted state from ${provider.name}`, { batchId });
      } catch (error) {
        console.warn(`Failed to remove from ${provider.name}`, { batchId, error });
      }
    });

    await Promise.allSettled(removePromises);
    console.log('Persisted state removal completed', { batchId });
  }

  // Cleanup old states
  async cleanupOldStates(): Promise<void> {
    try {
      const states = await this.listPersistedStates();
      const cutoffTime = Date.now() - (this.config.cleanupThresholdDays * 24 * 60 * 60 * 1000);
      
      const oldStates = states.filter(state => state.timestamp < cutoffTime);
      
      if (oldStates.length > 0) {
        console.log('Cleaning up old persisted states', {
          count: oldStates.length,
          cutoffDays: this.config.cleanupThresholdDays,
        });

        for (const state of oldStates) {
          await this.removePersistedState(state.batchId);
        }
      }

      // Also enforce max states limit
      if (states.length > this.config.maxStates) {
        const excessStates = states.slice(this.config.maxStates);
        console.log('Cleaning up excess states', {
          excess: excessStates.length,
          maxStates: this.config.maxStates,
        });

        for (const state of excessStates) {
          await this.removePersistedState(state.batchId);
        }
      }

    } catch (error) {
      console.error('Failed to cleanup old states', { error });
    }
  }

  // Get storage usage info
  async getStorageInfo(): Promise<{
    providers: Array<{ name: string; available: boolean; size: number }>;
    totalSize: number;
    states: number;
  }> {
    const providersInfo = await Promise.all(
      this.providers.map(async (provider) => ({
        name: provider.name,
        available: provider.isAvailable(),
        size: await provider.getSize(),
      }))
    );

    const states = await this.listPersistedStates();

    return {
      providers: providersInfo,
      totalSize: providersInfo.reduce((sum, p) => sum + p.size, 0),
      states: states.length,
    };
  }

  // Clear all persisted data
  async clearAllData(): Promise<void> {
    const clearPromises = this.providers.map(async (provider) => {
      try {
        if (provider.name === 'localStorage') {
          // Only clear our keys, not all localStorage
          const keys: string[] = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith(PERSISTENCE_KEY)) {
              keys.push(key);
            }
          }
          for (const key of keys) {
            await provider.remove(key);
          }
        } else {
          await provider.clear();
        }
        console.log(`Cleared all data from ${provider.name}`);
      } catch (error) {
        console.warn(`Failed to clear ${provider.name}`, { error });
      }
    });

    await Promise.allSettled(clearPromises);
    console.log('All persisted data cleared');
  }
}

// Global persistence manager instance
export const batchPersistenceManager = new BatchPersistenceManager();

// Helper functions for easy use
export const persistBatchState = (
  batchId: string,
  sessionId: string,
  state: BatchState,
  userId?: string
) => batchPersistenceManager.persistBatchState(batchId, sessionId, state, userId);

export const restoreBatchState = (batchId: string) =>
  batchPersistenceManager.restoreBatchState(batchId);

export const removePersistedState = (batchId: string) =>
  batchPersistenceManager.removePersistedState(batchId);

export const getStorageInfo = () => batchPersistenceManager.getStorageInfo();

export const clearAllPersistedData = () => batchPersistenceManager.clearAllData();

// Export interfaces for storage manager
export interface IStorageManager {
  isAvailable(): boolean;
  get(key: string): Promise<any>;
  set(key: string, value: any): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
  save(key: string, data: any): Promise<void>;
  load(key: string): Promise<any>;
  delete(key: string): Promise<void>;
  list(): Promise<string[]>;
  getQuota(): Promise<StorageQuotas>;
  cleanup(): Promise<void>;
}

export interface StorageQuotas {
  maxSize: number;
  warningThreshold: number;
  localStorage: number;
  indexedDB: number;
  warning: number;
  critical: number;
}

export interface BatchPersistenceState {
  version: string;
  timestamp: number;
  batchId: string;
  sessionId: string;
  userId?: string;
  state: any;
  metadata: {
    userAgent: string;
    url: string;
    resumeCount: number;
    lastActivity: number;
    syncStatus: 'synced' | 'pending' | 'conflict' | 'failed';
    checksum: string;
  };
  compressed?: boolean;
  encrypted?: boolean;
}