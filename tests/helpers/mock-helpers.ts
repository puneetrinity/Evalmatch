/**
 * Mock Helper Utilities
 * Provides typed mock functions and utilities for testing
 */

import { jest } from '@jest/globals';

/**
 * Creates a properly typed Jest mock function
 */
export function createMockFunction<T extends (...args: any[]) => any>(): jest.MockedFunction<T> {
  return jest.fn() as unknown as jest.MockedFunction<T>;
}

/**
 * Creates a mock API request function with proper typing
 */
export function createMockApiRequest() {
  type ApiRequestFn = (method: string, endpoint: string, options?: any) => Promise<any>;
  return createMockFunction<ApiRequestFn>();
}

/**
 * Creates a mock toast function
 */
export function createMockToast() {
  type ToastFn = (options: { title?: string; description?: string; variant?: string }) => void;
  return createMockFunction<ToastFn>();
}

/**
 * Helper to mock localStorage with proper typing
 */
export function createMockLocalStorage() {
  const store: Record<string, string> = {};
  
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: jest.fn((key: string) => { delete store[key]; }),
    clear: jest.fn(() => { Object.keys(store).forEach(key => delete store[key]); }),
    length: Object.keys(store).length,
    key: jest.fn((index: number) => Object.keys(store)[index] || null),
  };
}

/**
 * Helper to setup common mocks for React Query tests
 */
export function setupReactQueryMocks() {
  const mockApiRequest = createMockApiRequest();
  const mockToast = createMockToast();
  
  // Mock API request module
  jest.mock('@/lib/queryClient', () => ({
    apiRequest: mockApiRequest,
  }));
  
  // Mock toast module
  jest.mock('@/hooks/use-toast', () => ({
    useToast: () => ({ toast: mockToast }),
    toast: mockToast,
  }));
  
  return { mockApiRequest, mockToast };
}

/**
 * Helper to mock successful API responses
 */
export function mockApiSuccess<T>(mockFn: jest.MockedFunction<any>, data: T) {
  mockFn.mockResolvedValueOnce({
    success: true,
    data,
    message: 'Success',
  });
}

/**
 * Helper to mock API errors
 */
export function mockApiError(mockFn: jest.MockedFunction<any>, message: string = 'API Error') {
  mockFn.mockRejectedValueOnce(new Error(message));
}