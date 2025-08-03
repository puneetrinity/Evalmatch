/**
 * Multi-Storage Manager
 * 
 * Provides unified abstraction over localStorage, IndexedDB, server storage,
 * and cloud storage with automatic failover, quota management, and
 * intelligent storage selection based on data size and type.
 */

import type { SessionId } from '@shared/api-contracts';
import type { 
  BatchPersistenceState,
  IStorageManager,
  StorageQuotas,
  PersistenceConfig 
} from './batch-persistence';
import { apiRequest } from '@/lib/queryClient';

// ===== TYPE DEFINITIONS =====

export interface StorageStrategy {
  primary: StorageType;
  fallback: StorageType[];
  rules: StorageRule[];
}

export interface StorageRule {
  condition: (data: any, size: number) => boolean;
  storage: StorageType;
  priority: number;
}

export type StorageType = 'memory' | 'localStorage' | 'indexedDB' | 'server' | 'cloudStorage';

export interface StorageHealth {
  type: StorageType;
  available: boolean;
  responsive: boolean;
  quota: StorageQuotas | null;
  latency: number;
  errorRate: number;
  lastError?: string;
  lastCheck: number;
}

export interface CloudStorageConfig {
  provider: 'firebase' | 'aws' | 'azure' | 'gcp';
  endpoint: string;
  bucket: string;
  apiKey?: string;
  region?: string;
  timeout: number;
  maxFileSize: number;
  compression: boolean;
  encryption: boolean;
}

export interface StorageMetrics {
  operations: {
    read: { total: number; successful: number; failed: number; avgTime: number };
    write: { total: number; successful: number; failed: number; avgTime: number };
    delete: { total: number; successful: number; failed: number; avgTime: number };
  };
  storageHealth: Map<StorageType, StorageHealth>;
  quotaUsage: StorageQuotas;
  cacheMisses: number;
  cacheHits: number;
  compressionRatio: number;
}

export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  size: number;
  accessCount: number;
  lastAccessed: number;
  ttl: number;
}

// ===== CLOUD STORAGE MANAGER =====

class CloudStorageManager implements IStorageManager {
  private config: CloudStorageConfig;
  private uploadQueue: Map<string, BatchPersistenceState> = new Map();

  constructor(config: CloudStorageConfig) {
    this.config = config;
  }

  isAvailable(): boolean {
    return !!this.config.endpoint && !!this.config.bucket;
  }

  async get(key: string): Promise<any> {
    return await this.load(key);
  }

  async set(key: string, value: any): Promise<void> {
    return await this.save(key, value);
  }

  async remove(key: string): Promise<void> {
    return await this.delete(key);
  }

  async clear(): Promise<void> {
    const keys = await this.list();
    await Promise.all(keys.map(key => this.delete(key)));
  }

  async save(key: string, data: BatchPersistenceState): Promise<void> {
    try {
      const payload = this.config.compression ? await this.compress(data) : data;
      const encryptedPayload = this.config.encryption ? await this.encrypt(payload) : payload;
      
      const response = await fetch(`${this.config.endpoint}/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
          'X-Bucket': this.config.bucket,
          'X-Region': this.config.region || 'us-east-1'
        },
        body: JSON.stringify({
          key,
          data: encryptedPayload,
          metadata: {
            batchId: data.batchId,
            sessionId: data.sessionId,
            timestamp: data.timestamp,
            compressed: this.config.compression,
            encrypted: this.config.encryption
          }
        }),
        signal: AbortSignal.timeout(this.config.timeout)
      });

      if (!response.ok) {
        throw new Error(`Cloud storage error: ${response.status} ${response.statusText}`);
      }

      console.log(`[CLOUD_STORAGE] Saved to cloud: ${key}`);
    } catch (error) {
      console.error(`[CLOUD_STORAGE] Save failed: ${error}`);
      // Queue for retry
      this.uploadQueue.set(key, data);
      throw error;
    }
  }

  async load(key: string): Promise<BatchPersistenceState | null> {
    try {
      const response = await fetch(`${this.config.endpoint}/download/${encodeURIComponent(key)}`, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'X-Bucket': this.config.bucket,
          'X-Region': this.config.region || 'us-east-1'
        },
        signal: AbortSignal.timeout(this.config.timeout)
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`Cloud storage error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      let data = result.data;

      if (result.metadata?.encrypted) {
        data = await this.decrypt(data);
      }

      if (result.metadata?.compressed) {
        data = await this.decompress(data);
      }

      return data;
    } catch (error) {
      console.error(`[CLOUD_STORAGE] Load failed: ${error}`);
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const response = await fetch(`${this.config.endpoint}/delete/${encodeURIComponent(key)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'X-Bucket': this.config.bucket,
          'X-Region': this.config.region || 'us-east-1'
        },
        signal: AbortSignal.timeout(this.config.timeout)
      });

      if (!response.ok && response.status !== 404) {
        throw new Error(`Cloud storage error: ${response.status} ${response.statusText}`);
      }

      this.uploadQueue.delete(key);
      console.log(`[CLOUD_STORAGE] Deleted from cloud: ${key}`);
    } catch (error) {
      console.error(`[CLOUD_STORAGE] Delete failed: ${error}`);
      throw error;
    }
  }

  async list(): Promise<string[]> {
    try {
      const response = await fetch(`${this.config.endpoint}/list`, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'X-Bucket': this.config.bucket,
          'X-Region': this.config.region || 'us-east-1'
        },
        signal: AbortSignal.timeout(this.config.timeout)
      });

      if (!response.ok) {
        throw new Error(`Cloud storage error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      return result.keys || [];
    } catch (error) {
      console.error(`[CLOUD_STORAGE] List failed: ${error}`);
      return [];
    }
  }


  async getQuota(): Promise<StorageQuotas> {
    try {
      const response = await fetch(`${this.config.endpoint}/quota`, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'X-Bucket': this.config.bucket,
        },
        signal: AbortSignal.timeout(this.config.timeout)
      });

      if (!response.ok) {
        throw new Error(`Cloud storage quota check failed: ${response.status}`);
      }

      const quota = await response.json();
      return {
        maxSize: quota.limit || this.config.maxFileSize,
        warningThreshold: quota.limit * 0.8,
        localStorage: quota.used || 0,
        indexedDB: 0,
        warning: quota.used > quota.limit * 0.8 ? quota.limit * 0.8 : 0,
        critical: quota.used > quota.limit * 0.95 ? quota.limit * 0.95 : 0
      };
    } catch {
      return {
        maxSize: this.config.maxFileSize,
        warningThreshold: this.config.maxFileSize * 0.8,
        localStorage: 0,
        indexedDB: 0,
        warning: 0,
        critical: 0
      };
    }
  }

  async cleanup(): Promise<void> {
    // Cloud storage cleanup is typically handled server-side
    console.log('[CLOUD_STORAGE] Cleanup requested (handled server-side)');
  }

  private async compress(data: any): Promise<any> {
    // Simple compression simulation (use pako or similar in production)
    return { compressed: true, data: JSON.stringify(data) };
  }

  private async decompress(data: any): Promise<any> {
    if (data.compressed) {
      return JSON.parse(data.data);
    }
    return data;
  }

  private async encrypt(data: any): Promise<any> {
    // Simple encryption simulation (use crypto-js or similar in production)
    return { encrypted: true, data: btoa(JSON.stringify(data)) };
  }

  private async decrypt(data: any): Promise<any> {
    if (data.encrypted) {
      return JSON.parse(atob(data.data));
    }
    return data;
  }
}

// ===== SERVER STORAGE MANAGER =====

class ServerStorageManager implements IStorageManager {
  private baseUrl: string;

  constructor(baseUrl = '/api/batches') {
    this.baseUrl = baseUrl;
  }

  isAvailable(): boolean {
    return navigator.onLine;
  }

  async get(key: string): Promise<any> {
    return await this.load(key);
  }

  async set(key: string, value: any): Promise<void> {
    return await this.save(key, value);
  }

  async remove(key: string): Promise<void> {
    return await this.delete(key);
  }

  async clear(): Promise<void> {
    const keys = await this.list();
    await Promise.all(keys.map(key => this.delete(key)));
  }

  async save(key: string, data: BatchPersistenceState): Promise<void> {
    try {
      const response = await apiRequest('POST', `${this.baseUrl}/${data.batchId}/state`, {
        key,
        state: data
      });

      if (!response.ok) {
        throw new Error(`Server storage error: ${response.status}`);
      }

      console.log(`[SERVER_STORAGE] Saved to server: ${key}`);
    } catch (error) {
      console.error(`[SERVER_STORAGE] Save failed: ${error}`);
      throw error;
    }
  }

  async load(key: string): Promise<BatchPersistenceState | null> {
    try {
      const batchId = this.extractBatchIdFromKey(key);
      if (!batchId) return null;

      const response = await apiRequest('GET', `${this.baseUrl}/${batchId}/state`);
      
      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`Server storage error: ${response.status}`);
      }

      const result = await response.json();
      return result.success ? result.data : null;
    } catch (error) {
      console.error(`[SERVER_STORAGE] Load failed: ${error}`);
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const batchId = this.extractBatchIdFromKey(key);
      if (!batchId) return;

      const response = await apiRequest('DELETE', `${this.baseUrl}/${batchId}/state`);
      
      if (!response.ok && response.status !== 404) {
        throw new Error(`Server storage error: ${response.status}`);
      }

      console.log(`[SERVER_STORAGE] Deleted from server: ${key}`);
    } catch (error) {
      console.error(`[SERVER_STORAGE] Delete failed: ${error}`);
      throw error;
    }
  }

  async list(): Promise<string[]> {
    try {
      const response = await apiRequest('GET', `${this.baseUrl}/states`);
      
      if (!response.ok) {
        throw new Error(`Server storage error: ${response.status}`);
      }

      const result = await response.json();
      return result.success ? result.data.keys : [];
    } catch (error) {
      console.error(`[SERVER_STORAGE] List failed: ${error}`);
      return [];
    }
  }



  async getQuota(): Promise<StorageQuotas> {
    try {
      const response = await apiRequest('GET', `${this.baseUrl}/quota`);
      if (!response.ok) {
        throw new Error(`Server quota check failed: ${response.status}`);
      }
      const result = await response.json();
      const quota = result.data || {};
      return {
        maxSize: quota.maxSize || 100 * 1024 * 1024, // 100MB default
        warningThreshold: quota.warningThreshold || 80 * 1024 * 1024,
        localStorage: quota.used || 0,
        indexedDB: 0,
        warning: quota.warning || 0,
        critical: quota.critical || 0
      };
    } catch {
      return {
        maxSize: 100 * 1024 * 1024,
        warningThreshold: 80 * 1024 * 1024,
        localStorage: 0,
        indexedDB: 0,
        warning: 0,
        critical: 0
      };
    }
  }

  async cleanup(): Promise<void> {
    try {
      const response = await apiRequest('POST', `${this.baseUrl}/cleanup`);
      if (!response.ok) {
        console.warn(`[SERVER_STORAGE] Cleanup failed: ${response.status}`);
      }
      console.log('[SERVER_STORAGE] Cleanup completed');
    } catch (error) {
      console.error('[SERVER_STORAGE] Cleanup failed:', error);
    }
  }

  private extractBatchIdFromKey(key: string): string | null {
    const match = key.match(/evalmatch_batch_(.+)$/);
    return match ? match[1] : null;
  }
}

// ===== MEMORY STORAGE MANAGER =====

class MemoryStorageManager implements IStorageManager {
  private cache = new Map<string, CacheEntry<BatchPersistenceState>>();
  private maxSize: number;
  private ttl: number;

  constructor(maxSize = 50, ttl = 30 * 60 * 1000) { // 50 items, 30 min TTL
    this.maxSize = maxSize;
    this.ttl = ttl;
    
    // Cleanup expired entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  isAvailable(): boolean {
    return true;
  }

  async get(key: string): Promise<any> {
    return await this.load(key);
  }

  async set(key: string, value: any): Promise<void> {
    return await this.save(key, value);
  }

  async remove(key: string): Promise<void> {
    return await this.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
    console.log('[MEMORY_STORAGE] Cache cleared');
  }

  async save(key: string, data: BatchPersistenceState): Promise<void> {
    const size = JSON.stringify(data).length;
    const now = Date.now();

    // Evict LRU if at capacity
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    this.cache.set(key, {
      data,
      timestamp: now,
      size,
      accessCount: 0,
      lastAccessed: now,
      ttl: this.ttl
    });

    console.log(`[MEMORY_STORAGE] Cached: ${key}`);
  }

  async load(key: string): Promise<BatchPersistenceState | null> {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    const now = Date.now();
    
    // Check if expired
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Update access stats
    entry.accessCount++;
    entry.lastAccessed = now;

    return entry.data;
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async list(): Promise<string[]> {
    const now = Date.now();
    const validKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp <= entry.ttl) {
        validKeys.push(key);
      }
    }

    return validKeys;
  }

  async getQuota(): Promise<StorageQuotas> {
    const totalSize = Array.from(this.cache.values()).reduce((sum, entry) => sum + entry.size, 0);
    const maxMemory = this.maxSize * 1024 * 1024; // Estimate

    return {
      maxSize: maxMemory,
      warningThreshold: maxMemory * 0.8,
      localStorage: 0, // Memory storage doesn't use localStorage
      indexedDB: totalSize,
      warning: totalSize > maxMemory * 0.8 ? maxMemory * 0.8 : 0,
      critical: totalSize > maxMemory * 0.95 ? maxMemory * 0.95 : 0
    };
  }

  async cleanup(): Promise<void> {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach(key => this.cache.delete(key));
    
    if (expiredKeys.length > 0) {
      console.log(`[MEMORY_STORAGE] Cleaned up ${expiredKeys.length} expired entries`);
    }
  }


  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      console.log(`[MEMORY_STORAGE] Evicted LRU: ${oldestKey}`);
    }
  }
}

// ===== UNIFIED STORAGE MANAGER =====

export class UnifiedStorageManager {
  private storageManagers: Map<StorageType, IStorageManager> = new Map();
  private strategy!: StorageStrategy;
  private health: Map<StorageType, StorageHealth> = new Map();
  private metrics!: StorageMetrics;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(
    config: PersistenceConfig,
    cloudConfig?: CloudStorageConfig
  ) {
    this.initializeStorageManagers(config, cloudConfig);
    this.initializeStrategy();
    this.initializeMetrics();
    this.startHealthMonitoring();
  }

  // ===== PUBLIC API =====

  async save(key: string, data: BatchPersistenceState): Promise<void> {
    const size = JSON.stringify(data).length;
    const storage = this.selectStorageForSave(data, size);
    const startTime = Date.now();

    try {
      const manager = this.storageManagers.get(storage);
      if (!manager || !manager.isAvailable()) {
        throw new Error(`Storage ${storage} not available`);
      }

      await manager.save(key, data);
      
      // Update metrics
      this.updateOperationMetrics('write', storage, true, Date.now() - startTime);
      
      console.log(`[UNIFIED_STORAGE] Saved to ${storage}: ${key}`);
    } catch (error) {
      this.updateOperationMetrics('write', storage, false, Date.now() - startTime);
      
      // Try fallback storage
      await this.saveWithFallback(key, data, storage);
    }
  }

  async load(key: string): Promise<BatchPersistenceState | null> {
    const storages = this.getStorageReadOrder();
    const startTime = Date.now();

    for (const storage of storages) {
      try {
        const manager = this.storageManagers.get(storage);
        if (!manager || !manager.isAvailable()) {
          continue;
        }

        const data = await manager.load(key);
        
        if (data) {
          this.updateOperationMetrics('read', storage, true, Date.now() - startTime);
          this.metrics.cacheHits++;
          
          // Cache in memory if not from memory
          if (storage !== 'memory') {
            const memoryManager = this.storageManagers.get('memory');
            if (memoryManager) {
              await memoryManager.save(key, data);
            }
          }
          
          console.log(`[UNIFIED_STORAGE] Loaded from ${storage}: ${key}`);
          return data;
        }
      } catch (error) {
        this.updateOperationMetrics('read', storage, false, Date.now() - startTime);
        console.warn(`[UNIFIED_STORAGE] Load failed from ${storage}: ${error}`);
      }
    }

    this.metrics.cacheMisses++;
    return null;
  }

  async delete(key: string): Promise<void> {
    const promises = Array.from(this.storageManagers.entries()).map(
      async ([type, manager]) => {
        if (manager.isAvailable()) {
          const startTime = Date.now();
          try {
            await manager.delete(key);
            this.updateOperationMetrics('delete', type, true, Date.now() - startTime);
          } catch (error) {
            this.updateOperationMetrics('delete', type, false, Date.now() - startTime);
            console.warn(`[UNIFIED_STORAGE] Delete failed from ${type}: ${error}`);
          }
        }
      }
    );

    await Promise.allSettled(promises);
    console.log(`[UNIFIED_STORAGE] Deleted from all storages: ${key}`);
  }

  async list(): Promise<string[]> {
    const allKeys = new Set<string>();
    
    for (const [type, manager] of this.storageManagers.entries()) {
      if (manager.isAvailable()) {
        try {
          const keys = await manager.list();
          keys.forEach(key => allKeys.add(key));
        } catch (error) {
          console.warn(`[UNIFIED_STORAGE] List failed from ${type}: ${error}`);
        }
      }
    }

    return Array.from(allKeys);
  }

  async getStorageQuotas(): Promise<StorageQuotas> {
    const quotas: StorageQuotas = {
      maxSize: 0,
      warningThreshold: 0,
      localStorage: 0,
      indexedDB: 0,
      warning: 0,
      critical: 0
    };

    for (const [type, manager] of this.storageManagers.entries()) {
      if (manager.isAvailable()) {
        try {
          const quota = await manager.getQuota();
          if (quota) {
            if (type === 'localStorage') {
              quotas.localStorage = quota.localStorage;
            } else if (type === 'indexedDB') {
              quotas.indexedDB = quota.indexedDB;
            }
            quotas.warning = quotas.warning || quota.warning;
            quotas.critical = quotas.critical || quota.critical;
          }
        } catch (error) {
          console.warn(`[UNIFIED_STORAGE] Quota check failed for ${type}: ${error}`);
        }
      }
    }

    return quotas;
  }

  async cleanup(): Promise<void> {
    const promises = Array.from(this.storageManagers.entries()).map(
      async ([type, manager]) => {
        if (manager.isAvailable()) {
          try {
            await manager.cleanup();
            console.log(`[UNIFIED_STORAGE] Cleaned up ${type}`);
          } catch (error) {
            console.warn(`[UNIFIED_STORAGE] Cleanup failed for ${type}: ${error}`);
          }
        }
      }
    );

    await Promise.allSettled(promises);
  }

  getMetrics(): StorageMetrics {
    return { ...this.metrics };
  }

  getHealthStatus(): Map<StorageType, StorageHealth> {
    return new Map(this.health);
  }

  // ===== PRIVATE METHODS =====

  private initializeStorageManagers(
    config: PersistenceConfig, 
    cloudConfig?: CloudStorageConfig
  ): void {
    // Memory storage (always available)
    this.storageManagers.set('memory', new MemoryStorageManager());

    // Local storage
    if (config.enableLocalStorage) {
      const { LocalStorageManager } = require('./batch-persistence');
      this.storageManagers.set('localStorage', new LocalStorageManager());
    }

    // IndexedDB
    if (config.enableIndexedDB) {
      const { IndexedDBManager } = require('./batch-persistence');
      this.storageManagers.set('indexedDB', new IndexedDBManager());
    }

    // Server storage
    if (config.enableServerPersistence) {
      this.storageManagers.set('server', new ServerStorageManager());
    }

    // Cloud storage
    if (config.enableCloudBackup && cloudConfig) {
      this.storageManagers.set('cloudStorage', new CloudStorageManager(cloudConfig));
    }
  }

  private initializeStrategy(): void {
    this.strategy = {
      primary: 'indexedDB',
      fallback: ['localStorage', 'memory', 'server', 'cloudStorage'],
      rules: [
        {
          condition: (data, size) => size < 1024, // < 1KB
          storage: 'memory',
          priority: 1
        },
        {
          condition: (data, size) => size < 100 * 1024, // < 100KB
          storage: 'localStorage',
          priority: 2
        },
        {
          condition: (data, size) => size < 10 * 1024 * 1024, // < 10MB
          storage: 'indexedDB',
          priority: 3
        },
        {
          condition: (data, size) => size >= 10 * 1024 * 1024, // >= 10MB
          storage: 'cloudStorage',
          priority: 4
        }
      ]
    };
  }

  private initializeMetrics(): void {
    this.metrics = {
      operations: {
        read: { total: 0, successful: 0, failed: 0, avgTime: 0 },
        write: { total: 0, successful: 0, failed: 0, avgTime: 0 },
        delete: { total: 0, successful: 0, failed: 0, avgTime: 0 }
      },
      storageHealth: new Map(),
      quotaUsage: {
        maxSize: 0,
        warningThreshold: 0,
        localStorage: 0,
        indexedDB: 0,
        warning: 0,
        critical: 0
      },
      cacheMisses: 0,
      cacheHits: 0,
      compressionRatio: 1.0
    };
  }

  private selectStorageForSave(data: BatchPersistenceState, size: number): StorageType {
    // Apply rules to find best storage
    const applicableRules = this.strategy.rules
      .filter(rule => rule.condition(data, size))
      .sort((a, b) => a.priority - b.priority);

    for (const rule of applicableRules) {
      const health = this.health.get(rule.storage);
      if (health?.available && health.responsive) {
        return rule.storage;
      }
    }

    // Fallback to primary strategy
    const primaryHealth = this.health.get(this.strategy.primary);
    if (primaryHealth?.available && primaryHealth.responsive) {
      return this.strategy.primary;
    }

    // Use first available fallback
    for (const storage of this.strategy.fallback) {
      const health = this.health.get(storage);
      if (health?.available && health.responsive) {
        return storage;
      }
    }

    return 'memory'; // Last resort
  }

  private getStorageReadOrder(): StorageType[] {
    const order: StorageType[] = ['memory']; // Always check memory first
    
    // Add other storages based on health and preference
    const healthyStorages = Array.from(this.health.entries())
      .filter(([type, health]) => type !== 'memory' && health.available && health.responsive)
      .sort((a, b) => a[1].latency - b[1].latency) // Sort by latency
      .map(([type]) => type);

    order.push(...healthyStorages);
    
    return order;
  }

  private async saveWithFallback(
    key: string, 
    data: BatchPersistenceState, 
    failedStorage: StorageType
  ): Promise<void> {
    const fallbacks = this.strategy.fallback.filter(s => s !== failedStorage);
    
    for (const storage of fallbacks) {
      try {
        const manager = this.storageManagers.get(storage);
        if (manager && manager.isAvailable()) {
          const startTime = Date.now();
          await manager.save(key, data);
          this.updateOperationMetrics('write', storage, true, Date.now() - startTime);
          console.log(`[UNIFIED_STORAGE] Saved to fallback ${storage}: ${key}`);
          return;
        }
      } catch (error) {
        console.warn(`[UNIFIED_STORAGE] Fallback ${storage} failed: ${error}`);
      }
    }

    throw new Error('All storage options failed');
  }

  private updateOperationMetrics(
    operation: 'read' | 'write' | 'delete',
    storage: StorageType,
    success: boolean,
    time: number
  ): void {
    const opMetrics = this.metrics.operations[operation];
    opMetrics.total++;
    
    if (success) {
      opMetrics.successful++;
      opMetrics.avgTime = (opMetrics.avgTime + time) / 2;
    } else {
      opMetrics.failed++;
    }

    // Update storage health
    const health = this.health.get(storage);
    if (health) {
      health.latency = success ? (health.latency + time) / 2 : health.latency;
      health.errorRate = opMetrics.failed / opMetrics.total;
      health.lastCheck = Date.now();
      
      if (!success) {
        health.responsive = health.errorRate < 0.1; // 10% error threshold
      }
    }
  }

  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.checkStorageHealth();
    }, 30000); // Check every 30 seconds
  }

  private async checkStorageHealth(): Promise<void> {
    for (const [type, manager] of this.storageManagers.entries()) {
      const startTime = Date.now();
      
      try {
        const available = manager.isAvailable();
        const latency = Date.now() - startTime;
        
        this.health.set(type, {
          type,
          available,
          responsive: latency < 5000, // 5 second threshold
          quota: available ? await manager.getQuota() : null,
          latency,
          errorRate: this.health.get(type)?.errorRate || 0,
          lastCheck: Date.now()
        });
      } catch (error) {
        this.health.set(type, {
          type,
          available: false,
          responsive: false,
          quota: null,
          latency: Date.now() - startTime,
          errorRate: 1.0,
          lastError: error instanceof Error ? error.message : 'Unknown error',
          lastCheck: Date.now()
        });
      }
    }
  }

  destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }
}

// ===== EXPORTS =====
// Types and classes are exported at their definition sites