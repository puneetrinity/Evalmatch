/**
 * Comprehensive Unit Tests for Batch Persistence System
 * 
 * Tests all functionality including:
 * - localStorage and IndexedDB providers
 * - Data compression and decompression
 * - Checksum validation and data integrity
 * - Storage cleanup and management
 * - Cross-storage persistence strategies
 */

import {
  BatchPersistenceManager,
  LocalStorageProvider,
  IndexedDBProvider,
  PersistedBatchState,
  STORAGE_VERSION,
  PERSISTENCE_KEY,
  MAX_STORAGE_AGE,
  batchPersistenceManager,
  persistBatchState,
  restoreBatchState,
  removePersistedState,
  getStorageInfo,
  clearAllPersistedData,
} from '@/lib/batch-persistence';
import { BatchState } from '@/lib/batch-error-handling';
import { logger } from '@/lib/error-handling';

// ===== MOCKS =====

// Mock logger
jest.mock('@/lib/error-handling', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock crypto.subtle for checksum generation
const mockCrypto = {
  subtle: {
    digest: jest.fn(),
  },
};
Object.defineProperty(global, 'crypto', {
  value: mockCrypto,
  writable: true,
});

// Mock CompressionStream and DecompressionStream
class MockCompressionStream {
  readable: ReadableStream;
  writable: WritableStream;

  constructor(format: string) {
    const transform = new TransformStream({
      transform(chunk, controller) {
        // Mock compression - just pass through
        controller.enqueue(chunk);
      },
    });
    this.readable = transform.readable;
    this.writable = transform.writable;
  }
}

class MockDecompressionStream {
  readable: ReadableStream;
  writable: WritableStream;

  constructor(format: string) {
    const transform = new TransformStream({
      transform(chunk, controller) {
        // Mock decompression - just pass through
        controller.enqueue(chunk);
      },
    });
    this.readable = transform.readable;
    this.writable = transform.writable;
  }
}

Object.defineProperty(global, 'CompressionStream', {
  value: MockCompressionStream,
  writable: true,
});

Object.defineProperty(global, 'DecompressionStream', {
  value: MockDecompressionStream,
  writable: true,
});

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  key: jest.fn(),
  length: 0,
};
Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
});

// Mock indexedDB
const mockIndexedDB = {
  open: jest.fn(),
};
Object.defineProperty(global, 'indexedDB', {
  value: mockIndexedDB,
});

// Mock navigator.storage
const mockNavigatorStorage = {
  estimate: jest.fn(),
};
Object.defineProperty(navigator, 'storage', {
  value: mockNavigatorStorage,
});

// Mock window.location
Object.defineProperty(window, 'location', {
  value: {
    href: 'https://test.example.com/batch',
  },
});

// Mock navigator.userAgent
Object.defineProperty(navigator, 'userAgent', {
  value: 'Test User Agent',
});

// ===== TEST DATA =====

const mockBatchState: BatchState = {
  currentBatchId: 'batch_test123',
  sessionId: 'session_test456' as any,
  status: 'ready',
  resumeCount: 5,
  isLoading: false,
  error: null,
  lastValidated: new Date(),
  retryCount: 0,
  ownership: null,
  securityFlags: [],
  canClaim: false,
  isOrphaned: false,
  serverValidated: true,
};

const mockPersistedState: PersistedBatchState = {
  version: STORAGE_VERSION,
  timestamp: Date.now(),
  batchId: 'batch_test123',
  sessionId: 'session_test456',
  userId: 'user_test789',
  state: mockBatchState,
  metadata: {
    userAgent: 'Test User Agent',
    url: 'https://test.example.com/batch',
    resumeCount: 5,
    lastActivity: Date.now(),
    syncStatus: 'synced',
    checksum: 'mock_checksum',
  },
  compressed: false,
};

// ===== TEST HELPERS =====

const setupMockCrypto = () => {
  const mockHashBuffer = new ArrayBuffer(32);
  const mockHashArray = new Uint8Array(mockHashBuffer);
  mockHashArray.fill(42); // Fill with a known value

  mockCrypto.subtle.digest.mockResolvedValue(mockHashBuffer);
};

const setupMockIndexedDB = (shouldSucceed = true) => {
  const mockDB = {
    objectStoreNames: {
      contains: jest.fn().mockReturnValue(false),
    },
    createObjectStore: jest.fn().mockReturnValue({
      createIndex: jest.fn(),
    }),
    transaction: jest.fn().mockReturnValue({
      objectStore: jest.fn().mockReturnValue({
        get: jest.fn().mockReturnValue({
          onsuccess: null,
          onerror: null,
          result: shouldSucceed ? { value: mockPersistedState } : null,
        }),
        put: jest.fn().mockReturnValue({
          onsuccess: null,
          onerror: null,
        }),
        delete: jest.fn().mockReturnValue({
          onsuccess: null,
          onerror: null,
        }),
        clear: jest.fn().mockReturnValue({
          onsuccess: null,
          onerror: null,
        }),
      }),
    }),
  };

  const mockRequest = {
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
    result: mockDB,
  };

  mockIndexedDB.open.mockReturnValue(mockRequest);

  // Simulate successful connection
  setTimeout(() => {
    if (mockRequest.onsuccess) {
      mockRequest.onsuccess();
    }
  }, 0);

  return { mockDB, mockRequest };
};

// ===== TEST SUITES =====

describe('Batch Persistence System', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMockCrypto();
  });

  // ===== LOCAL STORAGE PROVIDER TESTS =====

  describe('LocalStorageProvider', () => {
    let provider: LocalStorageProvider;

    beforeEach(() => {
      provider = new LocalStorageProvider();
    });

    it('should check localStorage availability', () => {
      mockLocalStorage.setItem.mockImplementation(() => {});
      mockLocalStorage.removeItem.mockImplementation(() => {});

      expect(provider.isAvailable()).toBe(true);
    });

    it('should detect localStorage unavailability', () => {
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('Storage not available');
      });

      expect(provider.isAvailable()).toBe(false);
    });

    it('should get item from localStorage', () => {
      const testData = { test: 'data' };
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(testData));

      const result = provider.get('test_key');

      expect(result).toEqual(testData);
      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('test_key');
    });

    it('should return null for non-existent item', () => {
      mockLocalStorage.getItem.mockReturnValue(null);

      const result = provider.get('non_existent');

      expect(result).toBeNull();
    });

    it('should handle JSON parse errors gracefully', () => {
      mockLocalStorage.getItem.mockReturnValue('invalid json');

      const result = provider.get('invalid_key');

      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should set item in localStorage', () => {
      const testData = { test: 'data' };

      provider.set('test_key', testData);

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'test_key',
        JSON.stringify(testData)
      );
    });

    it('should handle localStorage set errors', () => {
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });

      expect(() => provider.set('test_key', { data: 'test' })).toThrow();
      expect(logger.error).toHaveBeenCalled();
    });

    it('should remove item from localStorage', () => {
      provider.remove('test_key');

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('test_key');
    });

    it('should clear localStorage', () => {
      provider.clear();

      expect(mockLocalStorage.clear).toHaveBeenCalled();
    });

    it('should calculate storage size', () => {
      // Mock Blob constructor
      global.Blob = jest.fn().mockImplementation((data) => ({
        size: JSON.stringify(data).length,
      }));

      const size = provider.getSize();

      expect(typeof size).toBe('number');
    });
  });

  // ===== INDEXEDDB PROVIDER TESTS =====

  describe('IndexedDBProvider', () => {
    let provider: IndexedDBProvider;

    beforeEach(() => {
      provider = new IndexedDBProvider();
    });

    it('should check IndexedDB availability', () => {
      expect(provider.isAvailable()).toBe(true);
    });

    it('should detect IndexedDB unavailability', () => {
      delete (global as any).indexedDB;

      expect(provider.isAvailable()).toBe(false);

      // Restore for other tests
      (global as any).indexedDB = mockIndexedDB;
    });

    it('should get item from IndexedDB', async () => {
      setupMockIndexedDB(true);

      const result = await provider.get('test_key');

      expect(result).toEqual(mockPersistedState);
    });

    it('should return null for non-existent item', async () => {
      setupMockIndexedDB(false);

      const result = await provider.get('non_existent');

      expect(result).toBeNull();
    });

    it('should handle IndexedDB connection errors', async () => {
      const mockRequest = {
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        error: new Error('Connection failed'),
      };

      mockIndexedDB.open.mockReturnValue(mockRequest);

      // Simulate connection error
      setTimeout(() => {
        if (mockRequest.onerror) {
          mockRequest.onerror();
        }
      }, 0);

      const result = await provider.get('test_key');

      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should set item in IndexedDB', async () => {
      const { mockDB } = setupMockIndexedDB();

      await provider.set('test_key', mockPersistedState);

      expect(mockDB.transaction).toHaveBeenCalled();
    });

    it('should remove item from IndexedDB', async () => {
      const { mockDB } = setupMockIndexedDB();

      await provider.remove('test_key');

      expect(mockDB.transaction).toHaveBeenCalled();
    });

    it('should clear IndexedDB', async () => {
      const { mockDB } = setupMockIndexedDB();

      await provider.clear();

      expect(mockDB.transaction).toHaveBeenCalled();
    });

    it('should get storage size using navigator.storage', async () => {
      mockNavigatorStorage.estimate.mockResolvedValue({
        usage: 1024 * 1024, // 1MB
      });

      const size = await provider.getSize();

      expect(size).toBe(1024 * 1024);
    });
  });

  // ===== BATCH PERSISTENCE MANAGER TESTS =====

  describe('BatchPersistenceManager', () => {
    let manager: BatchPersistenceManager;

    beforeEach(() => {
      manager = new BatchPersistenceManager({
        maxStates: 5,
        compressionEnabled: true,
        encryptionEnabled: false,
        syncToServer: false,
        storageQuotaMB: 10,
        cleanupThresholdDays: 3,
      });
    });

    it('should initialize with available providers', () => {
      expect(logger.info).toHaveBeenCalledWith(
        'Storage providers initialized',
        expect.objectContaining({
          providers: expect.arrayContaining(['localStorage']),
        })
      );
    });

    it('should generate checksums for data integrity', async () => {
      const checksum = await (manager as any).generateChecksum(mockBatchState);

      expect(typeof checksum).toBe('string');
      expect(checksum.length).toBeGreaterThan(0);
      expect(mockCrypto.subtle.digest).toHaveBeenCalledWith(
        'SHA-256',
        expect.any(Uint8Array)
      );
    });

    it('should fall back to simple hash when crypto is unavailable', async () => {
      mockCrypto.subtle.digest.mockRejectedValue(new Error('Crypto unavailable'));

      const checksum = await (manager as any).generateChecksum(mockBatchState);

      expect(typeof checksum).toBe('string');
      expect(checksum.length).toBeGreaterThan(0);
    });

    it('should compress data when enabled', async () => {
      const { data, compressed } = await (manager as any).compressData(mockBatchState);

      expect(compressed).toBe(true);
      expect(Array.isArray(data)).toBe(true);
    });

    it('should skip compression when disabled', async () => {
      const noCompressionManager = new BatchPersistenceManager({
        compressionEnabled: false,
      });

      const { data, compressed } = await (noCompressionManager as any).compressData(mockBatchState);

      expect(compressed).toBe(false);
      expect(data).toEqual(mockBatchState);
    });

    it('should decompress data correctly', async () => {
      const compressedData = [1, 2, 3, 4]; // Mock compressed data
      const originalData = JSON.stringify(mockBatchState);

      // Mock TextDecoder
      global.TextDecoder = jest.fn().mockImplementation(() => ({
        decode: jest.fn().mockReturnValue(originalData),
      }));

      const result = await (manager as any).decompressData(compressedData, true);

      expect(result).toEqual(mockBatchState);
    });

    it('should persist batch state to all available providers', async () => {
      mockLocalStorage.setItem.mockImplementation(() => {});

      await manager.persistBatchState(
        'batch_test',
        'session_test' as any,
        mockBatchState,
        'user_test'
      );

      expect(mockLocalStorage.setItem).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'Batch state persisted successfully',
        expect.objectContaining({
          batchId: 'batch_test',
          providers: 1,
          total: 1,
        })
      );
    });

    it('should handle persistence failures gracefully', async () => {
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });

      await expect(
        manager.persistBatchState(
          'batch_test',
          'session_test' as any,
          mockBatchState
        )
      ).rejects.toThrow('Failed to persist to any storage provider');

      expect(logger.error).toHaveBeenCalled();
    });

    it('should restore batch state from storage', async () => {
      const validPersistedState = {
        ...mockPersistedState,
        metadata: {
          ...mockPersistedState.metadata,
          checksum: await (manager as any).generateChecksum(mockBatchState),
        },
      };

      mockLocalStorage.getItem.mockReturnValue(
        JSON.stringify(validPersistedState)
      );

      const result = await manager.restoreBatchState('batch_test');

      expect(result).toBeTruthy();
      expect(result!.batchId).toBe('batch_test');
      expect(result!.state).toEqual(mockBatchState);
    });

    it('should reject stale persisted data', async () => {
      const staleState = {
        ...mockPersistedState,
        timestamp: Date.now() - MAX_STORAGE_AGE - 1000,
      };

      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(staleState));

      const result = await manager.restoreBatchState('batch_test');

      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        'Persisted state too old, removing',
        expect.any(Object)
      );
    });

    it('should handle version mismatches', async () => {
      const oldVersionState = {
        ...mockPersistedState,
        version: '0.9.0',
      };

      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(oldVersionState));

      const result = await manager.restoreBatchState('batch_test');

      expect(logger.warn).toHaveBeenCalledWith(
        'Version mismatch, attempting migration',
        expect.objectContaining({
          storedVersion: '0.9.0',
          currentVersion: STORAGE_VERSION,
        })
      );
    });

    it('should detect checksum mismatches', async () => {
      const corruptedState = {
        ...mockPersistedState,
        metadata: {
          ...mockPersistedState.metadata,
          checksum: 'invalid_checksum',
        },
      };

      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(corruptedState));

      const result = await manager.restoreBatchState('batch_test');

      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith(
        'Checksum mismatch, data may be corrupted',
        expect.any(Object)
      );
    });

    it('should list persisted states', async () => {
      mockLocalStorage.key.mockImplementation((index) => {
        if (index === 0) return `${PERSISTENCE_KEY}_batch1`;
        if (index === 1) return `${PERSISTENCE_KEY}_batch2`;
        return null;
      });
      mockLocalStorage.length = 2;

      mockLocalStorage.getItem.mockImplementation((key) => {
        if (key.includes('batch1')) {
          return JSON.stringify({ ...mockPersistedState, batchId: 'batch1' });
        }
        if (key.includes('batch2')) {
          return JSON.stringify({ ...mockPersistedState, batchId: 'batch2' });
        }
        return null;
      });

      const states = await manager.listPersistedStates();

      expect(states).toHaveLength(2);
      expect(states[0].batchId).toBe('batch1');
      expect(states[1].batchId).toBe('batch2');
    });

    it('should remove persisted state from all providers', async () => {
      await manager.removePersistedState('batch_test');

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(
        `${PERSISTENCE_KEY}_batch_test`
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Persisted state removal completed',
        { batchId: 'batch_test' }
      );
    });

    it('should cleanup old states', async () => {
      const oldTimestamp = Date.now() - (5 * 24 * 60 * 60 * 1000); // 5 days ago
      const recentTimestamp = Date.now() - (1 * 24 * 60 * 60 * 1000); // 1 day ago

      jest.spyOn(manager, 'listPersistedStates').mockResolvedValue([
        { batchId: 'old_batch', timestamp: oldTimestamp, provider: 'localStorage' },
        { batchId: 'recent_batch', timestamp: recentTimestamp, provider: 'localStorage' },
      ]);

      jest.spyOn(manager, 'removePersistedState').mockResolvedValue();

      await manager.cleanupOldStates();

      expect(manager.removePersistedState).toHaveBeenCalledWith('old_batch');
      expect(manager.removePersistedState).not.toHaveBeenCalledWith('recent_batch');
    });

    it('should enforce max states limit', async () => {
      const states = Array.from({ length: 7 }, (_, i) => ({
        batchId: `batch_${i}`,
        timestamp: Date.now() - (i * 60000), // Different timestamps
        provider: 'localStorage',
      }));

      jest.spyOn(manager, 'listPersistedStates').mockResolvedValue(states);
      jest.spyOn(manager, 'removePersistedState').mockResolvedValue();

      await manager.cleanupOldStates();

      expect(manager.removePersistedState).toHaveBeenCalledTimes(2); // Remove 2 excess states
    });

    it('should get storage information', async () => {
      jest.spyOn(manager, 'listPersistedStates').mockResolvedValue([
        { batchId: 'batch1', timestamp: Date.now(), provider: 'localStorage' },
        { batchId: 'batch2', timestamp: Date.now(), provider: 'localStorage' },
      ]);

      const info = await manager.getStorageInfo();

      expect(info.providers).toHaveLength(1);
      expect(info.providers[0].name).toBe('localStorage');
      expect(info.states).toBe(2);
      expect(typeof info.totalSize).toBe('number');
    });

    it('should clear all persisted data', async () => {
      mockLocalStorage.key.mockImplementation((index) => {
        if (index === 0) return `${PERSISTENCE_KEY}_batch1`;
        return null;
      });
      mockLocalStorage.length = 1;

      await manager.clearAllData();

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(`${PERSISTENCE_KEY}_batch1`);
      expect(logger.info).toHaveBeenCalledWith('All persisted data cleared');
    });
  });

  // ===== HELPER FUNCTIONS TESTS =====

  describe('Helper Functions', () => {
    beforeEach(() => {
      mockLocalStorage.setItem.mockImplementation(() => {});
      mockLocalStorage.getItem.mockImplementation(() => 
        JSON.stringify(mockPersistedState)
      );
    });

    it('should persist batch state using helper function', async () => {
      await persistBatchState(
        'batch_test',
        'session_test' as any,
        mockBatchState,
        'user_test'
      );

      expect(mockLocalStorage.setItem).toHaveBeenCalled();
    });

    it('should restore batch state using helper function', async () => {
      // Setup valid checksum
      const validChecksum = await batchPersistenceManager['generateChecksum'](mockBatchState);
      const validState = {
        ...mockPersistedState,
        metadata: {
          ...mockPersistedState.metadata,
          checksum: validChecksum,
        },
      };
      
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(validState));

      const result = await restoreBatchState('batch_test');

      expect(result).toBeTruthy();
      expect(result!.batchId).toBe('batch_test');
    });

    it('should remove persisted state using helper function', async () => {
      await removePersistedState('batch_test');

      expect(mockLocalStorage.removeItem).toHaveBeenCalled();
    });

    it('should get storage info using helper function', async () => {
      jest.spyOn(batchPersistenceManager, 'listPersistedStates').mockResolvedValue([]);

      const info = await getStorageInfo();

      expect(info).toBeTruthy();
      expect(typeof info.totalSize).toBe('number');
    });

    it('should clear all data using helper function', async () => {
      await clearAllPersistedData();

      expect(logger.info).toHaveBeenCalledWith('All persisted data cleared');
    });
  });

  // ===== INTEGRATION TESTS =====

  describe('Integration Tests', () => {
    let manager: BatchPersistenceManager;

    beforeEach(() => {
      manager = new BatchPersistenceManager({
        maxStates: 3,
        compressionEnabled: true,
        cleanupThresholdDays: 1,
      });
    });

    it('should handle full persistence workflow', async () => {
      // Persist state
      await manager.persistBatchState(
        'integration_batch',
        'integration_session' as any,
        mockBatchState,
        'integration_user'
      );

      // Verify persistence occurred
      expect(mockLocalStorage.setItem).toHaveBeenCalled();

      // Setup restoration
      const persistedData = JSON.parse(mockLocalStorage.setItem.mock.calls[0][1]);
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(persistedData));

      // Restore state
      const restored = await manager.restoreBatchState('integration_batch');

      expect(restored).toBeTruthy();
      expect(restored!.batchId).toBe('integration_batch');
      expect(restored!.state.resumeCount).toBe(mockBatchState.resumeCount);
    });

    it('should handle compression/decompression workflow', async () => {
      const largeState = {
        ...mockBatchState,
        additionalData: 'x'.repeat(10000), // Large data to trigger compression
      };

      await manager.persistBatchState(
        'compressed_batch',
        'compressed_session' as any,
        largeState as any
      );

      // Verify compression was attempted
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Batch state persisted to localStorage'),
        expect.any(Object)
      );
    });

    it('should handle storage provider failures gracefully', async () => {
      // Make localStorage fail
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });

      await expect(
        manager.persistBatchState(
          'failing_batch',
          'failing_session' as any,
          mockBatchState
        )
      ).rejects.toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to persist batch state',
        expect.any(Object)
      );
    });

    it('should handle multiple concurrent operations', async () => {
      const operations = Array.from({ length: 5 }, (_, i) =>
        manager.persistBatchState(
          `concurrent_batch_${i}`,
          `concurrent_session_${i}` as any,
          { ...mockBatchState, resumeCount: i }
        )
      );

      await Promise.all(operations);

      expect(mockLocalStorage.setItem).toHaveBeenCalledTimes(5);
    });
  });

  // ===== ERROR HANDLING TESTS =====

  describe('Error Handling', () => {
    let manager: BatchPersistenceManager;

    beforeEach(() => {
      manager = new BatchPersistenceManager();
    });

    it('should handle localStorage quota exceeded', async () => {
      mockLocalStorage.setItem.mockImplementation(() => {
        const error = new Error('QuotaExceededError');
        error.name = 'QuotaExceededError';
        throw error;
      });

      await expect(
        manager.persistBatchState('test_batch', 'test_session' as any, mockBatchState)
      ).rejects.toThrow('Failed to persist to any storage provider');
    });

    it('should handle malformed JSON in storage', async () => {
      mockLocalStorage.getItem.mockReturnValue('invalid json {');

      const result = await manager.restoreBatchState('test_batch');

      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to restore from localStorage'),
        expect.any(Object)
      );
    });

    it('should handle missing storage APIs', async () => {
      // Test without IndexedDB
      delete (global as any).indexedDB;
      
      const managerWithoutIDB = new BatchPersistenceManager();
      
      // Should still work with localStorage only
      await managerWithoutIDB.persistBatchState(
        'no_idb_batch',
        'no_idb_session' as any,
        mockBatchState
      );

      expect(mockLocalStorage.setItem).toHaveBeenCalled();

      // Restore IndexedDB for other tests
      (global as any).indexedDB = mockIndexedDB;
    });

    it('should handle checksum generation failures', async () => {
      mockCrypto.subtle.digest.mockRejectedValue(new Error('Crypto not available'));

      // Should fall back to simple hash
      await manager.persistBatchState('fallback_batch', 'fallback_session' as any, mockBatchState);

      expect(mockLocalStorage.setItem).toHaveBeenCalled();
    });
  });
});