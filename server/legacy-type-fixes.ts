// Quick type fixes for legacy files without refactoring
// This file contains type suppressions and workarounds

// Global type augmentations for legacy compatibility
declare global {
  namespace Express {
    interface Request {
      id?: string;
      startTime?: number;
      user?: any;
      batchValidation?: any;
    }
  }
}

// Error handling utility
export const safeErrorMessage = (error: unknown): string => {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as any).message);
  }
  return String(error);
};

// Type assertion helpers
export const asError = (error: unknown): Error => error as Error;
export const asAny = (value: unknown): any => value as any;

// Property access helpers for legacy objects
export const safeGet = (obj: any, key: string, defaultValue: any = undefined) => {
  return obj && typeof obj === 'object' && key in obj ? obj[key] : defaultValue;
};

// TypeScript configuration for legacy files
export const LEGACY_CONFIG = {
  skipLibCheck: true,
  noImplicitAny: false,
  strictNullChecks: false,
  noImplicitReturns: false
};