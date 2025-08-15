# Error Transformation Utilities Guide

This guide demonstrates how to use the error transformation utilities to bridge the gap between service-level interface errors and route-level concrete error classes.

## Problem Overview

The codebase has two different error type hierarchies:

1. **Interface Error Types** (used in service-level operations):
   - `ValidationError`, `ExternalServiceError`, `BusinessLogicError`, etc.
   - These are defined in `shared/result-types.ts` and used in Result type definitions

2. **Concrete App Error Classes** (used in routes and business logic):
   - `AppValidationError`, `AppExternalServiceError`, `AppBusinessLogicError`, etc.
   - These are concrete classes defined in `shared/errors.ts` with methods like `toJSON()`

## Available Transformation Functions

### Individual Error Transformers

```typescript
import {
  transformValidationError,
  transformExternalServiceError,
  transformBusinessLogicError,
  transformNotFoundError,
  transformAuthenticationError,
  transformRateLimitError
} from '@shared/type-utilities';

// Transform specific error types
const validationError: ValidationError = transformValidationError(appValidationError);
const serviceError: ExternalServiceError = transformExternalServiceError(appServiceError);
```

### Generic Error Transformer

```typescript
import { transformAppError } from '@shared/type-utilities';

// Automatically routes to correct transformer based on error type/code
const interfaceError = transformAppError(appError);
```

### Result Transformers

```typescript
import {
  transformResult,
  transformResumeServiceResult,
  transformDatabaseResult,
  transformAuthResult
} from '@shared/type-utilities';

// Generic result transformation
const interfaceResult = transformResult(appErrorResult);

// Service-specific transformations
const resumeResult = transformResumeServiceResult(result);
const dbResult = transformDatabaseResult(result);
const authResult = transformAuthResult(result);
```

## Usage Examples

### 1. Service Method Error Handling

When a service method needs to return concrete App error classes but calls functions that return interface errors:

```typescript
// Before: Type error - returning interface error when App error expected
async analyzeResume(input: AnalyzeResumeInput): Promise<Result<AnalyzeResumeResponse, AppNotFoundError | AppExternalServiceError | AppValidationError>> {
  const resumeResult = await this.getResumeById(userId, resumeId);
  if (isFailure(resumeResult)) {
    return failure(resumeResult.error); // ❌ Type error: interface error vs App error
  }
}

// After: Transform interface errors to concrete App errors
async analyzeResume(input: AnalyzeResumeInput): Promise<Result<AnalyzeResumeResponse, AppNotFoundError | AppExternalServiceError | AppValidationError>> {
  const resumeResult = await this.getResumeById(userId, resumeId);
  if (isFailure(resumeResult)) {
    // Transform interface error to concrete App error class
    if (resumeResult.error.code === 'NOT_FOUND') {
      return failure(AppNotFoundError.resume(resumeId));
    } else {
      return failure(AppExternalServiceError.databaseFailure('get_resume', resumeResult.error.message));
    }
  }
}
```

### 2. Generic Error Transformation

For more complex scenarios where you need to handle multiple error types:

```typescript
import { transformAppError } from '@shared/type-utilities';

async processRequest(result: Result<Data, ValidationError | ExternalServiceError | BusinessLogicError>): Promise<Result<Data, AppValidationError | AppExternalServiceError | AppBusinessLogicError>> {
  if (isFailure(result)) {
    const transformedError = transformAppError(result.error);
    
    // Convert interface error to appropriate concrete App error
    switch (transformedError.code) {
      case 'VALIDATION_ERROR':
        return failure(new AppValidationError(transformedError.message, transformedError.field, transformedError.validationRules));
      
      case 'EXTERNAL_SERVICE_ERROR':
      case 'AI_PROVIDER_ERROR':
      case 'DATABASE_ERROR':
        return failure(new AppExternalServiceError(
          transformedError.code, 
          transformedError.service || 'Unknown', 
          transformedError.message,
          transformedError.originalError
        ));
      
      case 'BUSINESS_LOGIC_ERROR':
        return failure(new AppBusinessLogicError(transformedError.operation || 'Unknown', transformedError.message));
      
      default:
        return failure(AppExternalServiceError.aiProviderFailure('Unknown', 'process_request', transformedError.message));
    }
  }
  
  return result;
}
```

### 3. Service-Specific Result Transformation

For services that consistently need the same error type transformations:

```typescript
import { transformResumeServiceResult } from '@shared/type-utilities';

// Service layer function that calls multiple operations
async batchProcessResumes(resumes: ResumeData[]): Promise<Result<BatchResult, ValidationError | ExternalServiceError | BusinessLogicError>> {
  // ... service logic that returns interface errors
}

// Route handler that needs App error classes
async handleBatchProcess(req: Request, res: Response) {
  const serviceResult = await resumeService.batchProcessResumes(req.body.resumes);
  
  // Transform service result to have concrete App error classes
  const routeResult = transformResumeServiceResult(serviceResult);
  
  if (isFailure(routeResult)) {
    // routeResult.error is now a concrete App error class with toJSON(), statusCode, etc.
    return res.status(routeResult.error.statusCode).json({
      success: false,
      error: routeResult.error.code,
      message: routeResult.error.message,
      timestamp: routeResult.error.timestamp
    });
  }
  
  return res.json({ success: true, data: routeResult.data });
}
```

## Best Practices

### 1. Update Service Method Return Types

When updating services to use the transformation utilities, also update the return types to be more specific:

```typescript
// Instead of generic DatabaseResult<T>
async getResumeById(userId: string, resumeId: number): Promise<DatabaseResult<Resume>> {

// Use specific App error types that routes expect
async getResumeById(userId: string, resumeId: number): Promise<Result<Resume, AppNotFoundError | AppExternalServiceError>> {
```

### 2. Error Context Preservation

Always preserve error context when transforming:

```typescript
// ✅ Good: Preserve original error information
const appError = toAppError(error, 'operation_context');
if (appError.code === 'NOT_FOUND') {
  return failure(AppNotFoundError.resume(resumeId));
} else {
  return failure(AppExternalServiceError.databaseFailure('operation_name', appError.message));
}

// ❌ Bad: Lose error context
return failure(new AppExternalServiceError('DATABASE_ERROR', 'Database', 'Something went wrong'));
```

### 3. Consistent Error Mapping

Use consistent mappings between interface errors and App errors:

- `ValidationError` → `AppValidationError`
- `NotFoundError` → `AppNotFoundError`
- `ExternalServiceError` → `AppExternalServiceError`
- `BusinessLogicError` → `AppBusinessLogicError`
- `AuthenticationError` → `AppAuthenticationError`
- `RateLimitError` → `AppRateLimitError`

## Migration Strategy

1. **Update Service Return Types**: Change service methods to return concrete App error types
2. **Add Transformation Logic**: Use the transformation utilities to convert interface errors to App errors
3. **Update Service-to-Service Calls**: When services call other services, handle the type conversions
4. **Verify Route Compatibility**: Ensure routes can handle the concrete App error types properly

This approach provides type safety while maintaining the separation of concerns between interface definitions and concrete implementations.