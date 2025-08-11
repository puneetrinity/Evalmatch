// Quick type fixes for legacy files without refactoring
// This file contains type suppressions and workarounds

// Global type augmentations for legacy compatibility
declare global {
  namespace Express {
    interface Request {
      startTime?: number;
    }
  }
}

// Error handling utility
export const safeErrorMessage = (error: unknown): string => {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
};

// Type assertion helpers
export const asError = (error: unknown): Error => error as Error;
export const asAny = (value: unknown): unknown => value;

// Property access helpers for legacy objects
export const safeGet = (obj: unknown, key: string, defaultValue: unknown = undefined): unknown => {
  return obj && typeof obj === 'object' && obj !== null && key in obj ? (obj as Record<string, unknown>)[key] : defaultValue;
};

// TypeScript configuration for legacy files
export const LEGACY_CONFIG = {
  skipLibCheck: true,
  noImplicitAny: false,
  strictNullChecks: false,
  noImplicitReturns: false
};