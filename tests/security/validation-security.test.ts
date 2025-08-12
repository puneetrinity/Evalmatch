/**
 * Comprehensive Security Validation Tests
 * 
 * Tests all input validation and sanitization mechanisms
 * to ensure robust protection against various attack vectors
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import { SecurityValidator, SecureSchemas } from '../../shared/security-validation';
import { ClientValidator } from '../../client/src/lib/client-validation';
import { DatabaseSecurity } from '../../server/lib/database-security';
import { ValidationErrorHandler } from '../../server/lib/validation-error-handler';

describe('Security Validation Tests', () => {
  
  describe('SecurityValidator', () => {
    
    describe('String Sanitization', () => {
      test('should remove script tags', () => {
        const malicious = '<script>alert("xss")</script>Hello World';
        const sanitized = SecurityValidator.sanitizeString(malicious);
        expect(sanitized).not.toContain('<script>');
        expect(sanitized).not.toContain('alert');
        expect(sanitized).toContain('Hello World');
      });

      test('should remove javascript: URLs', () => {
        const malicious = 'javascript:alert("xss")';
        const sanitized = SecurityValidator.sanitizeString(malicious);
        expect(sanitized).not.toContain('javascript:');
        expect(sanitized).not.toContain('alert');
      });

      test('should remove event handlers', () => {
        const malicious = '<div onclick="alert(1)">Click me</div>';
        const sanitized = SecurityValidator.sanitizeString(malicious);
        expect(sanitized).not.toContain('onclick');
        expect(sanitized).not.toContain('alert');
      });

      test('should remove SQL injection patterns', () => {
        const malicious = "'; DROP TABLE users; --";
        const sanitized = SecurityValidator.sanitizeString(malicious);
        expect(sanitized).not.toContain('DROP');
        expect(sanitized).not.toContain('TABLE');
        expect(sanitized).not.toContain('--');
      });

      test('should handle path traversal attempts', () => {
        const malicious = '../../../etc/passwd';
        const sanitized = SecurityValidator.sanitizeString(malicious);
        expect(sanitized).not.toContain('../');
        expect(sanitized).not.toContain('etc/passwd');
      });

      test('should respect maxLength option', () => {
        const longString = 'A'.repeat(1000);
        const sanitized = SecurityValidator.sanitizeString(longString, { maxLength: 100 });
        expect(sanitized.length).toBeLessThanOrEqual(100);
      });

      test('should handle special character filtering', () => {
        const input = 'Hello @#$% World 123';
        const sanitized = SecurityValidator.sanitizeString(input, { 
          allowSpecialChars: false,
          allowNumbers: false 
        });
        expect(sanitized).not.toContain('@');
        expect(sanitized).not.toContain('#');
        expect(sanitized).not.toContain('123');
        expect(sanitized).toContain('Hello');
        expect(sanitized).toContain('World');
      });
    });

    describe('Email Validation', () => {
      test('should validate correct email formats', () => {
        const validEmails = [
          'user@example.com',
          'test.email@domain.co.uk',
          'user+tag@example.org'
        ];

        validEmails.forEach(email => {
          expect(() => SecurityValidator.sanitizeEmail(email)).not.toThrow();
        });
      });

      test('should reject invalid email formats', () => {
        const invalidEmails = [
          'invalid-email',
          '@domain.com',
          'user@',
          'user@domain',
          'user space@domain.com'
        ];

        invalidEmails.forEach(email => {
          expect(() => SecurityValidator.sanitizeEmail(email)).toThrow();
        });
      });

      test('should normalize email case', () => {
        const email = 'USER@EXAMPLE.COM';
        const sanitized = SecurityValidator.sanitizeEmail(email);
        expect(sanitized).toBe('user@example.com');
      });
    });

    describe('Number Validation', () => {
      test('should validate numbers within bounds', () => {
        expect(SecurityValidator.sanitizeNumber('123', { min: 0, max: 1000 })).toBe(123);
        expect(SecurityValidator.sanitizeNumber(456, { min: 0, max: 1000 })).toBe(456);
      });

      test('should reject numbers outside bounds', () => {
        expect(() => SecurityValidator.sanitizeNumber(2000, { min: 0, max: 1000 })).toThrow();
        expect(() => SecurityValidator.sanitizeNumber(-100, { min: 0, max: 1000 })).toThrow();
      });

      test('should validate integer requirement', () => {
        expect(SecurityValidator.sanitizeNumber(123, { integer: true })).toBe(123);
        expect(() => SecurityValidator.sanitizeNumber(123.45, { integer: true })).toThrow();
      });

      test('should handle string to number conversion', () => {
        expect(SecurityValidator.sanitizeNumber('  123  ')).toBe(123);
        expect(() => SecurityValidator.sanitizeNumber('abc123')).toThrow();
      });
    });

    describe('Filename Validation', () => {
      test('should sanitize valid filenames', () => {
        const filename = 'document.pdf';
        const sanitized = SecurityValidator.sanitizeFilename(filename);
        expect(sanitized).toBe('document.pdf');
      });

      test('should remove dangerous characters', () => {
        const malicious = 'file<script>.pdf';
        const sanitized = SecurityValidator.sanitizeFilename(malicious);
        expect(sanitized).not.toContain('<');
        expect(sanitized).not.toContain('>');
        expect(sanitized).toContain('file');
        expect(sanitized).toContain('.pdf');
      });

      test('should handle Windows reserved filenames', () => {
        const reserved = 'CON.txt';
        const sanitized = SecurityValidator.sanitizeFilename(reserved);
        expect(sanitized).toMatch(/^_CON\.txt$/);
      });

      test('should truncate long filenames', () => {
        const longName = 'A'.repeat(300) + '.pdf';
        const sanitized = SecurityValidator.sanitizeFilename(longName, 100);
        expect(sanitized.length).toBeLessThanOrEqual(100);
        expect(sanitized).toEndWith('.pdf');
      });
    });

    describe('URL Validation', () => {
      test('should validate safe URLs', () => {
        const urls = [
          'https://example.com',
          'http://test.org/path?query=value'
        ];

        urls.forEach(url => {
          expect(() => SecurityValidator.sanitizeUrl(url)).not.toThrow();
        });
      });

      test('should reject dangerous schemes', () => {
        const dangerousUrls = [
          'javascript:alert(1)',
          'data:text/html,<script>alert(1)</script>',
          'file:///etc/passwd'
        ];

        dangerousUrls.forEach(url => {
          expect(() => SecurityValidator.sanitizeUrl(url)).toThrow();
        });
      });

      test('should reject localhost URLs', () => {
        const localUrls = [
          'http://localhost:3000',
          'http://127.0.0.1',
          'http://[::1]'
        ];

        localUrls.forEach(url => {
          expect(() => SecurityValidator.sanitizeUrl(url)).toThrow();
        });
      });
    });

    describe('Array Validation', () => {
      test('should validate string arrays', () => {
        const array = ['item1', 'item2', 'item3'];
        const sanitized = SecurityValidator.sanitizeStringArray(array);
        expect(sanitized).toEqual(array);
      });

      test('should limit array size', () => {
        const largeArray = new Array(150).fill('item');
        expect(() => SecurityValidator.sanitizeStringArray(largeArray, { maxItems: 100 }))
          .toThrow();
      });

      test('should sanitize array items', () => {
        const array = ['<script>alert(1)</script>', 'normal item'];
        const sanitized = SecurityValidator.sanitizeStringArray(array);
        expect(sanitized[0]).not.toContain('<script>');
        expect(sanitized[1]).toBe('normal item');
      });
    });

    describe('Password Strength Validation', () => {
      test('should validate strong passwords', () => {
        const strongPassword = 'MyStr0ng!P@ssw0rd';
        const result = SecurityValidator.validatePasswordStrength(strongPassword);
        expect(result.isValid).toBe(true);
        expect(result.strength).toBe('very-strong');
      });

      test('should reject weak passwords', () => {
        const weakPasswords = [
          '123456',
          'password',
          'qwerty',
          'abc123'
        ];

        weakPasswords.forEach(password => {
          const result = SecurityValidator.validatePasswordStrength(password);
          expect(result.isValid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
        });
      });

      test('should detect sequential patterns', () => {
        const sequentialPassword = 'Password123';
        const result = SecurityValidator.validatePasswordStrength(sequentialPassword);
        expect(result.errors).toContain('Password contains sequential characters');
      });
    });

    describe('File Content Validation', () => {
      test('should validate PDF magic numbers', () => {
        const pdfHeader = Buffer.from('%PDF-1.4\n');
        const isValid = SecurityValidator.validateFileContent(pdfHeader, 'application/pdf');
        expect(isValid).toBe(true);
      });

      test('should reject mismatched content types', () => {
        const textContent = Buffer.from('This is text content');
        const isValid = SecurityValidator.validateFileContent(textContent, 'application/pdf');
        expect(isValid).toBe(false);
      });
    });

    describe('Rate Limiting', () => {
      beforeEach(() => {
        // Reset rate limiting state before each test
        (SecurityValidator as any).rateLimitStore.clear();
      });

      test('should allow requests within rate limit', () => {
        const key = 'test-user';
        expect(SecurityValidator.checkRateLimit(key, 5, 60000)).toBe(true);
        expect(SecurityValidator.checkRateLimit(key, 5, 60000)).toBe(true);
      });

      test('should block requests exceeding rate limit', () => {
        const key = 'test-user-2';
        // Make 5 requests (should all pass)
        for (let i = 0; i < 5; i++) {
          expect(SecurityValidator.checkRateLimit(key, 5, 60000)).toBe(true);
        }
        // 6th request should be blocked
        expect(SecurityValidator.checkRateLimit(key, 5, 60000)).toBe(false);
      });
    });
  });

  describe('DatabaseSecurity', () => {
    
    describe('SQL Injection Prevention', () => {
      test('should sanitize basic SQL injection attempts', () => {
        const malicious = "'; DROP TABLE users; --";
        const sanitized = DatabaseSecurity.sanitizeForDatabase(malicious, 'string');
        expect(sanitized).not.toContain('DROP');
        expect(sanitized).not.toContain('--');
      });

      test('should handle search query sanitization', () => {
        const maliciousQuery = "test'; DROP TABLE users; --";
        const sanitized = DatabaseSecurity.sanitizeSearchQuery(maliciousQuery);
        expect(sanitized).not.toContain('DROP');
        expect(sanitized).not.toContain('--');
        expect(sanitized).toContain('test');
      });

      test('should validate order by columns', () => {
        const allowedColumns = ['name', 'created_at', 'updated_at'];
        
        expect(DatabaseSecurity.sanitizeOrderBy('name', allowedColumns)).toBe('name');
        expect(DatabaseSecurity.sanitizeOrderBy('created_at', allowedColumns)).toBe('created_at');
        expect(DatabaseSecurity.sanitizeOrderBy('malicious_column', allowedColumns)).toBe('created_at');
        expect(DatabaseSecurity.sanitizeOrderBy('name; DROP TABLE users', allowedColumns)).toBe('created_at');
      });

      test('should validate order direction', () => {
        expect(DatabaseSecurity.sanitizeOrderDirection('ASC')).toBe('ASC');
        expect(DatabaseSecurity.sanitizeOrderDirection('DESC')).toBe('DESC');
        expect(DatabaseSecurity.sanitizeOrderDirection('asc')).toBe('ASC');
        expect(DatabaseSecurity.sanitizeOrderDirection('MALICIOUS')).toBe('DESC');
      });
    });

    describe('Data Type Validation', () => {
      test('should validate user IDs', () => {
        expect(DatabaseSecurity.sanitizeUserId('user123')).toBe('user123');
        expect(DatabaseSecurity.sanitizeUserId('user-123_test')).toBe('user-123_test');
        expect(() => DatabaseSecurity.sanitizeUserId('user@domain.com')).toThrow();
        expect(() => DatabaseSecurity.sanitizeUserId('')).toThrow();
      });

      test('should validate numeric IDs', () => {
        expect(DatabaseSecurity.sanitizeNumericId('123')).toBe(123);
        expect(DatabaseSecurity.sanitizeNumericId(456)).toBe(456);
        expect(() => DatabaseSecurity.sanitizeNumericId('abc')).toThrow();
        expect(() => DatabaseSecurity.sanitizeNumericId(0)).toThrow();
        expect(() => DatabaseSecurity.sanitizeNumericId(-1)).toThrow();
      });

      test('should validate pagination parameters', () => {
        const result = DatabaseSecurity.sanitizePagination('5', '25');
        expect(result.page).toBe(5);
        expect(result.limit).toBe(25);

        const bounded = DatabaseSecurity.sanitizePagination('0', '200');
        expect(bounded.page).toBe(1);
        expect(bounded.limit).toBe(100);
      });
    });

    describe('JSON Data Validation', () => {
      test('should validate and sanitize JSON', () => {
        const validJson = { name: 'test', value: 123 };
        const sanitized = DatabaseSecurity.sanitizeJsonData(validJson);
        expect(JSON.parse(sanitized)).toEqual(validJson);
      });

      test('should reject JSON with dangerous content', () => {
        const dangerousJson = { 
          script: '<script>alert(1)</script>',
          eval: 'eval("malicious")'
        };
        expect(() => DatabaseSecurity.sanitizeJsonData(dangerousJson)).toThrow();
      });

      test('should respect size limits', () => {
        const largeData = { data: 'A'.repeat(2000000) };
        expect(() => DatabaseSecurity.sanitizeJsonData(largeData, 1000000)).toThrow();
      });
    });
  });

  describe('ClientValidator', () => {
    
    describe('Display Sanitization', () => {
      test('should escape HTML for display', () => {
        const html = '<script>alert("xss")</script><p>Hello</p>';
        const escaped = ClientValidator.sanitizeForDisplay(html);
        expect(escaped).toContain('&lt;script&gt;');
        expect(escaped).toContain('&lt;/script&gt;');
        expect(escaped).not.toContain('<script>');
      });

      test('should escape quotes and slashes', () => {
        const input = 'Hello "world" and \'test\' with /slash';
        const escaped = ClientValidator.sanitizeForDisplay(input);
        expect(escaped).toContain('&quot;');
        expect(escaped).toContain('&#x27;');
        expect(escaped).toContain('&#x2F;');
      });
    });

    describe('Input Sanitization', () => {
      test('should remove script tags', () => {
        const input = 'Hello <script>alert(1)</script> World';
        const sanitized = ClientValidator.sanitizeInput(input);
        expect(sanitized).not.toContain('<script>');
        expect(sanitized).toContain('Hello');
        expect(sanitized).toContain('World');
      });

      test('should handle length limits', () => {
        const longInput = 'A'.repeat(1000);
        const sanitized = ClientValidator.sanitizeInput(longInput, { maxLength: 100 });
        expect(sanitized.length).toBeLessThanOrEqual(100);
      });

      test('should handle newline options', () => {
        const inputWithNewlines = 'Line 1\nLine 2\r\nLine 3';
        const noNewlines = ClientValidator.sanitizeInput(inputWithNewlines, { allowNewlines: false });
        expect(noNewlines).not.toContain('\n');
        expect(noNewlines).not.toContain('\r');
      });
    });

    describe('File Validation', () => {
      test('should validate allowed file types', () => {
        const mockPdfFile = new File(['content'], 'test.pdf', { type: 'application/pdf' });
        const result = ClientValidator.validateFile(mockPdfFile);
        expect(result.isValid).toBe(true);
      });

      test('should reject disallowed file types', () => {
        const mockExeFile = new File(['content'], 'malware.exe', { type: 'application/x-executable' });
        const result = ClientValidator.validateFile(mockExeFile);
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });

      test('should check file size limits', () => {
        const largeContent = 'A'.repeat(60 * 1024 * 1024); // 60MB
        const largeFile = new File([largeContent], 'large.pdf', { type: 'application/pdf' });
        const result = ClientValidator.validateFile(largeFile);
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.includes('size'))).toBe(true);
      });
    });

    describe('Password Validation', () => {
      test('should validate strong passwords', () => {
        const password = 'MyStr0ng!P@ssw0rd';
        const result = ClientValidator.validatePassword(password);
        expect(result.isValid).toBe(true);
        expect(result.strength).toBe('very-strong');
      });

      test('should provide helpful suggestions', () => {
        const weakPassword = 'weak';
        const result = ClientValidator.validatePassword(weakPassword);
        expect(result.isValid).toBe(false);
        expect(result.suggestions.length).toBeGreaterThan(0);
      });
    });

    describe('Rate Limiting', () => {
      beforeEach(() => {
        // Clear client-side rate limiting state
        (ClientValidator as any).rateLimits.clear();
      });

      test('should implement client-side rate limiting', () => {
        const key = 'test-action';
        expect(ClientValidator.checkClientRateLimit(key, 3, 60000)).toBe(true);
        expect(ClientValidator.checkClientRateLimit(key, 3, 60000)).toBe(true);
        expect(ClientValidator.checkClientRateLimit(key, 3, 60000)).toBe(true);
        expect(ClientValidator.checkClientRateLimit(key, 3, 60000)).toBe(false);
      });
    });
  });

  describe('Integration Tests', () => {
    
    test('should handle coordinated XSS attempts', () => {
      const xssPayloads = [
        '<script>alert("xss")</script>',
        'javascript:alert(1)',
        '<img src="x" onerror="alert(1)">',
        '<svg onload="alert(1)">',
        'data:text/html,<script>alert(1)</script>'
      ];

      xssPayloads.forEach(payload => {
        // Test server-side protection
        const serverSanitized = SecurityValidator.sanitizeString(payload);
        expect(serverSanitized).not.toContain('<script>');
        expect(serverSanitized).not.toContain('javascript:');
        expect(serverSanitized).not.toContain('onerror');
        expect(serverSanitized).not.toContain('onload');
        
        // Test client-side protection
        const clientSanitized = ClientValidator.sanitizeInput(payload);
        expect(clientSanitized).not.toContain('<script>');
        expect(clientSanitized).not.toContain('javascript:');
      });
    });

    test('should handle coordinated SQL injection attempts', () => {
      const sqlPayloads = [
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "'; INSERT INTO users VALUES ('hacker', 'password'); --",
        "' UNION SELECT * FROM passwords --",
        "'; EXEC xp_cmdshell('dir'); --"
      ];

      sqlPayloads.forEach(payload => {
        // Test database sanitization
        const dbSanitized = DatabaseSecurity.sanitizeForDatabase(payload, 'string');
        expect(dbSanitized).not.toContain('DROP');
        expect(dbSanitized).not.toContain('INSERT');
        expect(dbSanitized).not.toContain('UNION');
        expect(dbSanitized).not.toContain('EXEC');
        expect(dbSanitized).not.toContain('--');
        
        // Test search query sanitization
        const searchSanitized = DatabaseSecurity.sanitizeSearchQuery(payload);
        if (searchSanitized) {
          expect(searchSanitized).not.toContain('DROP');
          expect(searchSanitized).not.toContain('--');
        }
      });
    });

    test('should maintain data integrity during sanitization', () => {
      const validData = [
        'Hello World',
        'user@example.com',
        'My name is John & I like coffee!',
        'Product price: $19.99',
        'Meeting at 2:30 PM'
      ];

      validData.forEach(data => {
        const serverSanitized = SecurityValidator.sanitizeString(data);
        const clientSanitized = ClientValidator.sanitizeInput(data);
        
        // Should preserve legitimate content
        expect(serverSanitized).toContain('Hello World'.includes(data) ? 'Hello World' : data.split(' ')[0]);
        expect(clientSanitized).toContain('Hello World'.includes(data) ? 'Hello World' : data.split(' ')[0]);
      });
    });
  });

  describe('Performance Tests', () => {
    
    test('should handle large inputs efficiently', () => {
      const largeInput = 'A'.repeat(10000);
      const start = performance.now();
      
      SecurityValidator.sanitizeString(largeInput, { maxLength: 5000 });
      
      const end = performance.now();
      expect(end - start).toBeLessThan(100); // Should complete within 100ms
    });

    test('should handle many small inputs efficiently', () => {
      const inputs = Array(1000).fill('test input');
      const start = performance.now();
      
      inputs.forEach(input => {
        SecurityValidator.sanitizeString(input);
      });
      
      const end = performance.now();
      expect(end - start).toBeLessThan(1000); // Should complete within 1 second
    });
  });

  describe('Error Handling', () => {
    
    test('should provide detailed error information for invalid types', () => {
      expect(() => SecurityValidator.sanitizeString(123 as any)).toThrow('Input must be a string');
      expect(() => SecurityValidator.sanitizeEmail(null as any)).toThrow('Email must be a string');
      expect(() => SecurityValidator.sanitizeNumber('abc')).toThrow('Invalid number');
    });

    test('should handle edge cases gracefully', () => {
      expect(SecurityValidator.sanitizeString('')).toBe('');
      expect(SecurityValidator.sanitizeEmail('a@b.co')).toBe('a@b.co');
      expect(DatabaseSecurity.sanitizeSearchQuery('')).toBe(null);
      expect(DatabaseSecurity.sanitizeSearchQuery(null)).toBe(null);
    });
  });
});

describe('Security Metrics and Monitoring', () => {
  
  test('should track security incidents', () => {
    const initialMetrics = ValidationErrorHandler.getSecurityMetrics();
    expect(typeof initialMetrics.blockedIPs).toBe('number');
    expect(typeof initialMetrics.suspiciousUsers).toBe('number');
    expect(typeof initialMetrics.totalIncidents).toBe('number');
  });

  test('should identify blocked IPs', () => {
    // This would need to be implemented based on actual blocking logic
    const isBlocked = ValidationErrorHandler.isIPBlocked('192.168.1.1');
    expect(typeof isBlocked).toBe('boolean');
  });

  test('should identify suspicious users', () => {
    // This would need to be implemented based on actual suspicious user logic
    const isSuspicious = ValidationErrorHandler.isUserSuspicious('test-user');
    expect(typeof isSuspicious).toBe('boolean');
  });
});