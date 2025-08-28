/**
 * Mock implementation of security validation for tests
 */
import { jest } from '@jest/globals';

export class SecurityValidator {
  static sanitizeString = jest.fn((input: string) => {
    // Simple sanitization for tests
    return input
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+="[^"]*"/gi, '');
  });

  static validateFileContent = jest.fn((content: Buffer, mimeType: string) => {
    // Mock file validation - always return true for tests
    return true;
  });

  static detectMaliciousPatterns = jest.fn((content: string) => {
    const patterns = ['<script', 'javascript:', 'on\\w+="'];
    return patterns.some(pattern => new RegExp(pattern, 'i').test(content));
  });

  static analyzeEntropy = jest.fn((content: Buffer) => {
    // Mock entropy analysis
    return Math.random() * 100;
  });

  static validateSchema = jest.fn((data: any, schema: any) => {
    return { success: true, data };
  });
}

export const SecureSchemas = {
  JobDescription: {
    parse: jest.fn((data: any) => data),
  },
  Resume: {
    parse: jest.fn((data: any) => data),
  },
  User: {
    parse: jest.fn((data: any) => data),
  },
};

export default SecurityValidator;