/**
 * Mock implementation of client validation for tests
 */
import { jest } from '@jest/globals';

export class ClientValidator {
  static validateInput = jest.fn((input: any, schema: any) => {
    return { success: true, data: input };
  });

  static sanitizeInput = jest.fn((input: string) => {
    return input.replace(/<script[^>]*>.*?<\/script>/gi, '');
  });

  static validateFileType = jest.fn((file: File) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];
    return allowedTypes.includes(file.type);
  });

  static validateFileSize = jest.fn((file: File) => {
    return file.size <= 10 * 1024 * 1024; // 10MB
  });
}

export default ClientValidator;