/**
 * Comprehensive Security Validation Library
 * 
 * This module provides enhanced input validation and sanitization utilities
 * with defense-in-depth security measures to prevent various attack vectors.
 */

import { z } from 'zod';
import DOMPurify from 'isomorphic-dompurify';

// Enhanced security configuration for DOMPurify
const SECURITY_CONFIG = {
  ALLOWED_TAGS: [], // No HTML tags allowed by default
  ALLOWED_ATTR: [], // No HTML attributes allowed
  ALLOW_DATA_ATTR: false,
  ALLOW_UNKNOWN_PROTOCOLS: false,
  FORBID_SCRIPTS: true,
  FORBID_TAGS: ['script', 'object', 'embed', 'link', 'style', 'img', 'svg', 'math', 'iframe', 'frame', 'frameset'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'onchange', 'onsubmit', 'onreset'],
  USE_PROFILES: { html: false },
  WHOLE_DOCUMENT: false,
  RETURN_DOM: false,
  RETURN_DOM_FRAGMENT: false,
  SANITIZE_DOM: true,
  KEEP_CONTENT: false
} as const;

/**
 * Advanced input sanitization with multiple security layers
 */
export class SecurityValidator {
  
  /**
   * Sanitize string input with comprehensive security measures
   */
  static sanitizeString(input: unknown, options: {
    maxLength?: number;
    allowNewlines?: boolean;
    preserveSpaces?: boolean;
    allowNumbers?: boolean;
    allowSpecialChars?: boolean;
  } = {}): string {
    if (typeof input !== 'string') {
      throw new Error('Input must be a string');
    }

    const {
      maxLength = 1000,
      allowNewlines = false,
      preserveSpaces = true,
      allowNumbers = true,
      allowSpecialChars = false
    } = options;

    // Step 1: DOMPurify sanitization
    let sanitized = DOMPurify.sanitize(input, SECURITY_CONFIG);
    
    // Step 2: Remove dangerous patterns
    sanitized = this.removeDangerousPatterns(sanitized);
    
    // Step 3: Character filtering based on options
    if (!allowNumbers) {
      sanitized = sanitized.replace(/\d/g, '');
    }
    
    if (!allowSpecialChars) {
      // Allow only alphanumeric, basic punctuation, and spaces
      sanitized = sanitized.replace(/[^\w\s.,!?;:()\-'"]/g, '');
    }
    
    if (!allowNewlines) {
      sanitized = sanitized.replace(/[\r\n]/g, ' ');
    }
    
    // Step 4: Normalize whitespace
    if (!preserveSpaces) {
      sanitized = sanitized.replace(/\s+/g, ' ');
    }
    
    // Step 5: Length limitation
    sanitized = sanitized.substring(0, maxLength);
    
    return sanitized.trim();
  }

  /**
   * Remove dangerous patterns that could be used for various attacks
   */
  private static removeDangerousPatterns(input: string): string {
    let cleaned = input;
    
    // Remove script-like patterns
    cleaned = cleaned.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    cleaned = cleaned.replace(/javascript:/gi, '');
    cleaned = cleaned.replace(/vbscript:/gi, '');
    cleaned = cleaned.replace(/data:/gi, '');
    cleaned = cleaned.replace(/on\w+\s*=/gi, '');
    
    // Remove SQL injection patterns
    cleaned = cleaned.replace(/(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|DECLARE)\b)/gi, '');
    cleaned = cleaned.replace(/('|(\\')|(;)|(--)|(\|)|(\*)|(%)|(<)|(>)|(\{)|(\})|(\[)|(\]))/g, '');
    
    // Remove command injection patterns
    cleaned = cleaned.replace(/(\||&|;|\$|`|>|<|\n|\r)/g, '');
    
    // Remove path traversal patterns
    cleaned = cleaned.replace(/\.\.\//g, '');
    cleaned = cleaned.replace(/\.\.\\/g, '');
    
    // Remove null bytes and control characters
    cleaned = cleaned.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
    
    return cleaned;
  }

  /**
   * Validate and sanitize email addresses
   */
  static sanitizeEmail(input: unknown): string {
    if (typeof input !== 'string') {
      throw new Error('Email must be a string');
    }
    
    const email = input.toLowerCase().trim();
    
    // Basic email pattern validation
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    
    if (!emailRegex.test(email)) {
      throw new Error('Invalid email format');
    }
    
    if (email.length > 254) {
      throw new Error('Email address too long');
    }
    
    return email;
  }

  /**
   * Sanitize numeric input with bounds checking
   */
  static sanitizeNumber(input: unknown, options: {
    min?: number;
    max?: number;
    integer?: boolean;
  } = {}): number {
    const { min = -Number.MAX_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER, integer = false } = options;
    
    if (typeof input === 'string') {
      input = input.trim().replace(/[^\d.-]/g, '');
    }
    
    const num = Number(input);
    
    if (isNaN(num)) {
      throw new Error('Invalid number');
    }
    
    if (num < min || num > max) {
      throw new Error(`Number must be between ${min} and ${max}`);
    }
    
    if (integer && !Number.isInteger(num)) {
      throw new Error('Number must be an integer');
    }
    
    return num;
  }

  /**
   * Sanitize filename to prevent path traversal and dangerous characters
   */
  static sanitizeFilename(input: unknown, maxLength: number = 255): string {
    if (typeof input !== 'string') {
      throw new Error('Filename must be a string');
    }
    
    let filename = input.trim();
    
    // Remove path separators and dangerous characters
    filename = filename.replace(/[<>:"/\\|?*\x00-\x1F]/g, '');
    filename = filename.replace(/^\.+/, ''); // Remove leading dots
    filename = filename.replace(/\.+$/, ''); // Remove trailing dots
    
    // Prevent reserved Windows filenames
    const reserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;
    if (reserved.test(filename)) {
      filename = '_' + filename;
    }
    
    if (filename.length === 0) {
      throw new Error('Filename cannot be empty after sanitization');
    }
    
    if (filename.length > maxLength) {
      const ext = filename.substring(filename.lastIndexOf('.'));
      const name = filename.substring(0, filename.lastIndexOf('.'));
      filename = name.substring(0, maxLength - ext.length) + ext;
    }
    
    return filename;
  }

  /**
   * Validate and sanitize URLs
   */
  static sanitizeUrl(input: unknown, allowedSchemes: string[] = ['http', 'https']): string {
    if (typeof input !== 'string') {
      throw new Error('URL must be a string');
    }
    
    const url = input.trim();
    
    try {
      const parsed = new URL(url);
      
      if (!allowedSchemes.includes(parsed.protocol.replace(':', ''))) {
        throw new Error('URL scheme not allowed');
      }
      
      // Check for dangerous patterns
      if (parsed.hostname.includes('localhost') || 
          parsed.hostname.includes('127.0.0.1') ||
          parsed.hostname.includes('::1')) {
        throw new Error('Local URLs not allowed');
      }
      
      return parsed.toString();
    } catch (error) {
      throw new Error('Invalid URL format');
    }
  }

  /**
   * Sanitize array of strings
   */
  static sanitizeStringArray(input: unknown, options: {
    maxItems?: number;
    maxItemLength?: number;
    allowEmpty?: boolean;
  } = {}): string[] {
    if (!Array.isArray(input)) {
      throw new Error('Input must be an array');
    }
    
    const { maxItems = 100, maxItemLength = 500, allowEmpty = false } = options;
    
    if (input.length > maxItems) {
      throw new Error(`Array can contain at most ${maxItems} items`);
    }
    
    const sanitized = input
      .map(item => {
        if (typeof item !== 'string') {
          throw new Error('All array items must be strings');
        }
        return this.sanitizeString(item, { maxLength: maxItemLength });
      })
      .filter(item => allowEmpty || item.length > 0);
    
    return sanitized;
  }

  /**
   * Validate JSON input with size limits
   */
  static sanitizeJson<T>(input: unknown, schema: z.ZodSchema<T>, maxSize: number = 1048576): T {
    if (typeof input === 'string') {
      if (input.length > maxSize) {
        throw new Error('JSON input too large');
      }
      
      try {
        input = JSON.parse(input);
      } catch (error) {
        throw new Error('Invalid JSON format');
      }
    }
    
    const result = schema.safeParse(input);
    if (!result.success) {
      throw new Error(`JSON validation failed: ${result.error.message}`);
    }
    
    return result.data;
  }

  /**
   * Rate limiting validation
   */
  private static rateLimitStore = new Map<string, { count: number; resetTime: number }>();
  
  static checkRateLimit(identifier: string, maxRequests: number, windowMs: number): boolean {
    const now = Date.now();
    const key = identifier;
    
    const record = this.rateLimitStore.get(key);
    
    if (!record || now > record.resetTime) {
      this.rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
      return true;
    }
    
    if (record.count >= maxRequests) {
      return false;
    }
    
    record.count++;
    return true;
  }

  /**
   * Content Security Policy validation
   */
  static validateCSP(content: string): boolean {
    const dangerousPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /<iframe/i,
      /<embed/i,
      /<object/i,
      /data:\s*text\/html/i,
      /vbscript:/i,
      /livescript:/i,
      /mocha:/i
    ];
    
    return !dangerousPatterns.some(pattern => pattern.test(content));
  }

  /**
   * File content validation
   */
  static validateFileContent(buffer: Buffer, expectedMimeType: string, maxSize: number = 10485760): boolean {
    // Check file size
    if (buffer.length > maxSize) {
      return false;
    }
    
    // Basic magic number validation for common file types
    const magicNumbers = {
      'application/pdf': [0x25, 0x50, 0x44, 0x46], // %PDF
      'application/msword': [0xD0, 0xCF, 0x11, 0xE0], // DOC
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [0x50, 0x4B, 0x03, 0x04], // DOCX (ZIP)
      'text/plain': null // No specific magic number for text files
    };
    
    const expectedMagic = magicNumbers[expectedMimeType as keyof typeof magicNumbers];
    
    if (expectedMagic) {
      const fileHeader = Array.from(buffer.slice(0, expectedMagic.length));
      if (!expectedMagic.every((byte, index) => fileHeader[index] === byte)) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Password strength validation
   */
  static validatePasswordStrength(password: string): {
    isValid: boolean;
    strength: 'weak' | 'medium' | 'strong' | 'very-strong';
    errors: string[];
  } {
    const errors: string[] = [];
    let score = 0;
    
    // Length check
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    } else if (password.length >= 12) {
      score += 2;
    } else {
      score += 1;
    }
    
    // Character variety checks
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    } else {
      score += 1;
    }
    
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    } else {
      score += 1;
    }
    
    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    } else {
      score += 1;
    }
    
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Password must contain at least one special character');
    } else {
      score += 1;
    }
    
    // Common password patterns
    if (/^(?:123456|password|qwerty|abc123|admin|letmein)$/i.test(password)) {
      errors.push('Password is too common');
      score = 0;
    }
    
    // Sequential patterns
    if (/(?:012|123|234|345|456|567|678|789|890|abc|bcd|cde|def)/i.test(password)) {
      errors.push('Password contains sequential characters');
      score = Math.max(0, score - 1);
    }
    
    let strength: 'weak' | 'medium' | 'strong' | 'very-strong' = 'weak';
    if (score >= 6) strength = 'very-strong';
    else if (score >= 4) strength = 'strong';
    else if (score >= 2) strength = 'medium';
    
    return {
      isValid: errors.length === 0,
      strength,
      errors
    };
  }
}

// Enhanced Zod schemas with security validation
export const SecureSchemas = {
  // Secure string schema with sanitization
  secureString: (maxLength = 1000, options?: Parameters<typeof SecurityValidator.sanitizeString>[1]) =>
    z.string().transform((val) => SecurityValidator.sanitizeString(val, { maxLength, ...options })),
  
  // Secure email schema
  secureEmail: () =>
    z.string().transform((val) => SecurityValidator.sanitizeEmail(val)),
  
  // Secure filename schema
  secureFilename: (maxLength = 255) =>
    z.string().transform((val) => SecurityValidator.sanitizeFilename(val, maxLength)),
  
  // Secure URL schema
  secureUrl: (allowedSchemes?: string[]) =>
    z.string().transform((val) => SecurityValidator.sanitizeUrl(val, allowedSchemes)),
  
  // Secure number schema
  secureNumber: (options?: Parameters<typeof SecurityValidator.sanitizeNumber>[1]) =>
    z.union([z.string(), z.number()]).transform((val) => SecurityValidator.sanitizeNumber(val, options)),
  
  // Secure array schema
  secureStringArray: (options?: Parameters<typeof SecurityValidator.sanitizeStringArray>[1]) =>
    z.array(z.unknown()).transform((val) => SecurityValidator.sanitizeStringArray(val, options)),
  
  // ID validation
  userId: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/, 'Invalid user ID format'),
  sessionId: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/, 'Invalid session ID format'),
  
  // File validation
  fileSize: z.number().min(1).max(50 * 1024 * 1024), // Max 50MB
  mimeType: z.enum(['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']),
  
  // Pagination
  pagination: z.object({
    page: z.coerce.number().int().min(1).max(1000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20)
  })
} as const;

// Export validation result types
export interface ValidationResult<T = unknown> {
  isValid: boolean;
  data?: T;
  errors?: Array<{
    field: string;
    message: string;
    code: string;
  }>;
}

export interface SecurityValidationOptions {
  maxLength?: number;
  allowHtml?: boolean;
  allowScripts?: boolean;
  sanitize?: boolean;
  checkCSP?: boolean;
  rateLimitKey?: string;
  rateLimitMax?: number;
  rateLimitWindow?: number;
}