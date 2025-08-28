/**
 * Jest Mock Type Definitions
 * Properly typed Jest mock functions to avoid TypeScript errors
 */

import { jest } from '@jest/globals';

// Extend Jest mock function types
declare global {
  namespace jest {
    interface MockedFunction<T extends (...args: any[]) => any> extends jest.Mock<T> {
      (...args: Parameters<T>): ReturnType<T>;
      mockReturnValue(value: ReturnType<T>): this;
      mockReturnValueOnce(value: ReturnType<T>): this;
      mockResolvedValue(value: Awaited<ReturnType<T>>): this;
      mockResolvedValueOnce(value: Awaited<ReturnType<T>>): this;
      mockRejectedValue(value: any): this;
      mockRejectedValueOnce(value: any): this;
      mockImplementation(fn: T): this;
      mockImplementationOnce(fn: T): this;
    }
  }
}

// Helper type for creating mocked modules
export type MockedModule<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any
    ? jest.MockedFunction<T[K]>
    : T[K] extends object
    ? MockedModule<T[K]>
    : T[K];
};

// Helper function to create typed mocks
export function createMock<T extends (...args: any[]) => any>(
  implementation?: T
): jest.MockedFunction<T> {
  return jest.fn(implementation) as jest.MockedFunction<T>;
}

// Helper to mock modules with proper types
export function mockModule<T>(modulePath: string, factory: () => Partial<T>): void {
  jest.mock(modulePath, factory);
}