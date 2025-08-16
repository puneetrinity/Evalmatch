/**
 * EvalMatch TypeScript SDK
 * AI-powered recruitment platform client library
 */

// Export all generated types and client functions
export * from './generated';

// Export custom auth and client classes
export { EvalMatchClient } from './client';
export { FirebaseAuthProvider } from './auth/firebase-auth-provider';
export type { AuthProvider, EvalMatchConfig } from './types';

// Export error classes
export { EvalMatchError, ValidationError, RateLimitError, AuthenticationError } from './errors';

// Re-export commonly used types for convenience
export type {
  ApiResponse,
  ApiError,
  Resume,
  JobDescription,
  AnalysisResult,
  BiasAnalysis,
  InterviewQuestions
} from './generated/types.gen';