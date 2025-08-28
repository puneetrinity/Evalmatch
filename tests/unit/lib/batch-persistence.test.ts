/**
 * Unit Tests for Batch Persistence System
 * 
 * Tests core functionality:
 * - localStorage and basic persistence
 * - Manager instantiation and configuration
 * - Basic storage operations
 */

import { jest, describe, test, expect, beforeEach, afterEach, beforeAll, afterAll, it } from '@jest/globals';
import type { SessionId } from '@shared/api-contracts';
import { BatchError, BatchErrorType, LocalBatchStatus } from '@/hooks/useBatchManager';

// Mock types
interface BatchState {
  currentBatchId: string | null;
  sessionId: SessionId | null;
  status: LocalBatchStatus;
  resumeCount: number;
  isLoading: boolean;
  error: BatchError | null;
  lastValidated: Date | null;
  retryCount: number;
  ownership: any | null;
  securityFlags: string[];
  canClaim: boolean;
  isOrphaned: boolean;
  serverValidated: boolean;
}

// Mock logger
const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

// Mock logger
jest.mock('@/lib/error-handling', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock crypto
const mockCrypto = {
  subtle: {
    digest: jest.fn(),
  },
};
Object.defineProperty(global, 'crypto', {
  value: mockCrypto,
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

Object.defineProperty(global, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
});

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
});

// Mock console methods
const originalConsole = { ...console };
beforeAll(() => {
  console.log = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
  console.info = jest.fn();
});

afterAll(() => {
  Object.assign(console, originalConsole);
});

// Now import the actual implementation
import {
  BatchPersistenceManager,
  LocalStorageProvider,
  PersistedBatchState,
  STORAGE_VERSION,
  PERSISTENCE_KEY,
  batchPersistenceManager,
  persistBatchState,
  restoreBatchState,
} from '@/lib/batch-persistence';

// ===== TEST DATA =====

const mockBatchId = 'batch_test123';
const mockSessionId = 'session_test456' as SessionId;
const mockUserId = 'user_test789';

const mockBatchState: BatchState = {
  currentBatchId: mockBatchId,
  sessionId: mockSessionId,
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
  batchId: mockBatchId,
  sessionId: mockSessionId,
  userId: mockUserId,
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

// ===== TEST SUITES =====

describe('Batch Persistence System', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Setup basic crypto mock
    (mockCrypto.subtle.digest as any).mockResolvedValue(new ArrayBuffer(32));
  });

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

    it('should set item in localStorage', () => {
      const testData = { test: 'data' };
      
      // Reset the mock to success for this test
      mockLocalStorage.setItem.mockReset();
      mockLocalStorage.setItem.mockImplementation(() => {});

      provider.set('test_key', testData);

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'test_key',
        JSON.stringify(testData)
      );
    });

    it('should remove item from localStorage', () => {
      provider.remove('test_key');

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('test_key');
    });

    it('should clear localStorage', () => {
      provider.clear();

      expect(mockLocalStorage.clear).toHaveBeenCalled();
    });
  });

  describe('BatchPersistenceManager', () => {
    let manager: BatchPersistenceManager;

    beforeEach(() => {
      manager = new BatchPersistenceManager({
        maxStates: 5,
        compressionEnabled: false, // Disable compression for faster tests
        encryptionEnabled: false,
        syncToServer: false,
        storageQuotaMB: 10,
        cleanupThresholdDays: 3,
      });
    });

    it('should create manager with default config', () => {
      const defaultManager = new BatchPersistenceManager();
      expect(defaultManager).toBeInstanceOf(BatchPersistenceManager);
    });

    it('should persist batch state to localStorage', async () => {
      // Reset all mocks for this test
      mockLocalStorage.setItem.mockReset();
      mockLocalStorage.setItem.mockImplementation(() => {});
      mockLocalStorage.removeItem.mockImplementation(() => {});

      await manager.persistBatchState(
        mockBatchId,
        mockSessionId,
        mockBatchState,
        mockUserId
      );

      expect(mockLocalStorage.setItem).toHaveBeenCalled();
    }, 10000);

    it('should handle persistence failures gracefully', async () => {
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });

      await expect(
        manager.persistBatchState(
          mockBatchId,
          mockSessionId,
          mockBatchState
        )
      ).rejects.toThrow('Failed to persist to any storage provider');
    }, 10000);

    it('should restore batch state from storage', async () => {
      const validPersistedState = {
        ...mockPersistedState,
        metadata: {
          ...mockPersistedState.metadata,
          checksum: 'valid_checksum', // Use simple string instead of generating
        },
      };

      mockLocalStorage.getItem.mockReturnValue(
        JSON.stringify(validPersistedState)
      );

      // Mock the checksum validation to pass
      manager['generateChecksum'] = jest.fn().mockResolvedValue('valid_checksum');

      const result = await manager.restoreBatchState(mockBatchId);

      expect(result).toBeTruthy();
      expect(result!.batchId).toBe(mockBatchId);
    }, 10000);

    it('should handle malformed JSON gracefully', async () => {
      mockLocalStorage.getItem.mockReturnValue('invalid json {');

      const result = await manager.restoreBatchState(mockBatchId);

      expect(result).toBeNull();
    }, 10000);

    it('should remove persisted state', async () => {
      await manager.removePersistedState(mockBatchId);

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(
        `${PERSISTENCE_KEY}_${mockBatchId}`
      );
    }, 10000);
  });

  describe('Helper Functions', () => {
    beforeEach(() => {
      mockLocalStorage.setItem.mockImplementation(() => {});
      mockLocalStorage.getItem.mockImplementation(() => 
        JSON.stringify(mockPersistedState)
      );
    });

    it('should persist batch state using helper function', async () => {
      await persistBatchState(
        mockBatchId,
        mockSessionId,
        mockBatchState,
        mockUserId
      );

      expect(mockLocalStorage.setItem).toHaveBeenCalled();
    }, 10000);

    it('should restore batch state using helper function', async () => {
      // Mock the manager's checksum validation
      jest.spyOn(batchPersistenceManager as any, 'generateChecksum').mockResolvedValue('mock_checksum');

      const result = await restoreBatchState(mockBatchId);

      expect(result).toBeTruthy();
      expect(result!.batchId).toBe(mockBatchId);
    }, 10000);
  });

  describe('Configuration', () => {
    it('should accept custom configuration', () => {
      const customConfig = {
        maxStates: 10,
        compressionEnabled: true,
        encryptionEnabled: false,
        syncToServer: true,
        storageQuotaMB: 20,
        cleanupThresholdDays: 7,
      };

      const manager = new BatchPersistenceManager(customConfig);
      expect(manager).toBeInstanceOf(BatchPersistenceManager);
    });

    it('should use default values when no config provided', () => {
      const manager = new BatchPersistenceManager();
      expect(manager).toBeInstanceOf(BatchPersistenceManager);
    });
  });

  describe('Error Handling', () => {
    let manager: BatchPersistenceManager;

    beforeEach(() => {
      manager = new BatchPersistenceManager({
        compressionEnabled: false,
      });
    });

    it('should handle storage errors', async () => {
      mockLocalStorage.setItem.mockImplementation(() => {
        const error = new Error('QuotaExceededError');
        error.name = 'QuotaExceededError';
        throw error;
      });

      await expect(
        manager.persistBatchState(mockBatchId, mockSessionId, mockBatchState)
      ).rejects.toThrow('Failed to persist to any storage provider');
    }, 10000);

    it('should handle malformed stored data', async () => {
      mockLocalStorage.getItem.mockReturnValue('invalid json');

      const result = await manager.restoreBatchState(mockBatchId);

      expect(result).toBeNull();
    }, 10000);
  });
});