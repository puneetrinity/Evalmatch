/**
 * Mock implementation of validation error handler for tests
 */
import { jest } from '@jest/globals';

export class ValidationErrorHandler {
  static handleZodError = jest.fn((error: any) => {
    return {
      success: false,
      error: 'Validation error',
      details: error.issues || []
    };
  });

  static handleValidationError = jest.fn((error: any) => {
    return {
      success: false,
      error: error.message || 'Validation failed',
      code: 'VALIDATION_ERROR'
    };
  });

  static formatErrors = jest.fn((errors: any[]) => {
    return errors.map(err => ({
      field: err.path?.join('.') || 'unknown',
      message: err.message
    }));
  });

  static createValidationResponse = jest.fn((success: boolean, data?: any, errors?: any[]) => {
    return {
      success,
      ...(data && { data }),
      ...(errors && { errors })
    };
  });
}

export default ValidationErrorHandler;