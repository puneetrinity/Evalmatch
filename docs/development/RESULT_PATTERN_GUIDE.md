# Result Pattern Implementation Guide

This guide explains how to use the Result pattern implemented in EvalMatchAI for type-safe error handling.

## Overview

The Result pattern eliminates the need for try/catch blocks and provides consistent, type-safe error handling across the entire application. Instead of throwing exceptions, functions return a `Result<T, E>` type that explicitly represents either success or failure.

## Core Types

### Result<T, E>

```typescript
type Result<T, E = AppError> = Success<T> | Failure<E>
```

A Result is a union type that can be either:
- `Success<T>`: Contains successful data of type T
- `Failure<E>`: Contains error information of type E

### Success<T>

```typescript
interface Success<T> {
  readonly success: true;
  readonly data: T;
}
```

### Failure<E>

```typescript
interface Failure<E> {
  readonly success: false;
  readonly error: E;
}
```

## Creating Results

### Success Results

```typescript
import { success } from '@shared/result-types';

// Create a successful result
const userResult = success({ id: 1, name: 'John Doe' });
// Type: Success<{ id: number, name: string }>
```

### Failure Results

```typescript
import { failure } from '@shared/result-types';
import { AppValidationError } from '@shared/errors';

// Create a failure result
const errorResult = failure(
  AppValidationError.requiredField('email')
);
// Type: Failure<AppValidationError>
```

## Checking Results

### Type Guards

Use `isSuccess` and `isFailure` type guards to safely check and access result data:

```typescript
import { isSuccess, isFailure } from '@shared/result-types';

const result = await someOperation();

if (isSuccess(result)) {
  // TypeScript knows result.data is available
  console.log('Success:', result.data);
} else {
  // TypeScript knows result.error is available
  console.error('Error:', result.error.message);
}
```

## Converting Promises to Results

### Using fromPromise

The `fromPromise` utility converts promises that might throw into Results:

```typescript
import { fromPromise } from '@shared/result-types';
import { AppExternalServiceError } from '@shared/errors';

const result = await fromPromise(
  fetch('/api/users'),
  (error) => AppExternalServiceError.apiFailure('users', error.message)
);

if (isSuccess(result)) {
  const response = result.data; // Response object
} else {
  const error = result.error; // AppExternalServiceError
}
```

## Transforming Results

### mapResult

Transform the data in a successful Result while preserving failures:

```typescript
import { mapResult } from '@shared/result-types';

const userResult = success({ id: 1, name: 'John Doe' });
const nameResult = mapResult(userResult, user => user.name);
// nameResult: Result<string, never>
```

### chainResult

Chain multiple Result-returning operations together:

```typescript
import { chainResult } from '@shared/result-types';

const result = chainResult(userResult, user => 
  getUserProfile(user.id) // Returns Result<Profile, AppError>
);
```

### chainResultAsync

Chain async Result operations:

```typescript
import { chainResultAsync } from '@shared/result-types';

const result = await chainResultAsync(userResult, async user =>
  await fetchUserProfileFromDb(user.id)
);
```

## Error Types

EvalMatchAI provides several specialized error types:

### AppValidationError (400)

```typescript
import { AppValidationError } from '@shared/errors';

// Required field error
const error = AppValidationError.requiredField('email');

// Invalid format error
const error = AppValidationError.invalidFormat('phone', '+1234567890');

// File too large error
const error = AppValidationError.fileTooLarge('25MB');

// Unsupported file type error
const error = AppValidationError.unsupportedFileType(['pdf', 'docx']);
```

### AppNotFoundError (404)

```typescript
import { AppNotFoundError } from '@shared/errors';

// Resource not found
const error = AppNotFoundError.resume(123);
const error = AppNotFoundError.jobDescription(456);
const error = AppNotFoundError.user('user123');
```

### AppAuthenticationError (401/403)

```typescript
import { AppAuthenticationError } from '@shared/errors';

// Invalid credentials
const error = AppAuthenticationError.invalidCredentials();

// Token expired
const error = AppAuthenticationError.tokenExpired('user123');

// Insufficient permissions
const error = AppAuthenticationError.insufficientPermissions('admin_panel');
```

### AppExternalServiceError (502/503)

```typescript
import { AppExternalServiceError } from '@shared/errors';

// AI provider failure
const error = AppExternalServiceError.aiProviderFailure(
  'OpenAI', 
  'resume_analysis', 
  'Rate limit exceeded'
);

// Database failure
const error = AppExternalServiceError.databaseFailure(
  'user_lookup',
  'Connection timeout'
);
```

## Route Handler Pattern

### Using asyncHandler

Wrap route handlers with `asyncHandler` to automatically catch errors:

```typescript
import { asyncHandler } from '@server/middleware/error-handler';

router.post('/users', asyncHandler(async (req, res) => {
  const result = await createUser(req.body);
  
  if (isSuccess(result)) {
    res.json({ 
      success: true, 
      data: result.data 
    });
  } else {
    // Error handled by middleware
    throw result.error;
  }
}));
```

### Manual Error Handling

```typescript
router.post('/users', async (req, res) => {
  const result = await createUser(req.body);
  
  if (isSuccess(result)) {
    res.json({ 
      success: true, 
      data: result.data 
    });
  } else {
    const error = result.error;
    res.status(error.statusCode).json({
      success: false,
      error: error.code,
      message: error.message,
      timestamp: error.timestamp
    });
  }
});
```

## AI Operations Example

```typescript
import { analyzeResumeWithCache } from '@server/lib/cached-ai-operations';
import { isSuccess, isFailure } from '@shared/result-types';

// Analyze resume with Result pattern
const analysisResult = await analyzeResumeWithCache(content, userTier);

if (isSuccess(analysisResult)) {
  const analysis = analysisResult.data;
  console.log('Skills found:', analysis.analyzedData.skills);
  console.log('Experience:', analysis.analyzedData.experience);
} else {
  // Handle specific error types
  const error = analysisResult.error;
  
  if (error instanceof AppRateLimitError) {
    console.log('Rate limited, retry after:', error.retryAfter);
  } else if (error instanceof AppExternalServiceError) {
    console.log('AI service error:', error.service);
  } else {
    console.log('General error:', error.message);
  }
}
```

## Best Practices

### 1. Always Use Type Guards

```typescript
// Good
if (isSuccess(result)) {
  // TypeScript knows result.data is available
}

// Bad - TypeScript can't guarantee type safety
if (result.success) {
  // Less type safety
}
```

### 2. Handle Specific Error Types

```typescript
if (isFailure(result)) {
  const error = result.error;
  
  if (error instanceof AppValidationError) {
    // Handle validation errors specifically
  } else if (error instanceof AppNotFoundError) {
    // Handle not found errors specifically
  }
}
```

### 3. Use Proper Error Constructors

```typescript
// Good - specific error with context
AppValidationError.requiredField('email')
AppNotFoundError.user('user123')

// Okay - generic error
new AppValidationError('Email is required')

// Bad - loses type information
new Error('Something went wrong')
```

### 4. Chain Operations Safely

```typescript
// Chain multiple operations that might fail
const result = await chainResultAsync(
  await getUserById(userId),
  async user => await getUserProfile(user.id)
);
```

### 5. Convert Legacy Code Gradually

```typescript
// Legacy function that throws
function oldFunction(): User {
  if (!user) throw new Error('Not found');
  return user;
}

// Wrapped version using Result pattern
async function newFunction(): Promise<Result<User, AppError>> {
  return fromPromise(
    Promise.resolve(oldFunction()),
    error => AppNotFoundError.user('unknown')
  );
}
```

## Migration from Try/Catch

### Before (Try/Catch)

```typescript
async function analyzeResume(content: string) {
  try {
    const result = await aiService.analyze(content);
    return { success: true, data: result };
  } catch (error) {
    console.error('Analysis failed:', error);
    return { success: false, error: 'Analysis failed' };
  }
}
```

### After (Result Pattern)

```typescript
async function analyzeResume(content: string): Promise<Result<AnalysisData, AppError>> {
  return fromPromise(
    aiService.analyze(content),
    error => AppExternalServiceError.aiProviderFailure(
      'AIService', 
      'analyze', 
      error.message
    )
  );
}
```

The Result pattern provides:
- **Type Safety**: Compile-time guarantees about error handling
- **Consistency**: All functions return the same error format
- **Explicit**: Errors are part of the function signature
- **Composable**: Easy to chain and transform operations
- **Debuggable**: Rich error context and structured logging