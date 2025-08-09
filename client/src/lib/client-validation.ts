/**
 * Client-Side Security Validation
 * 
 * Provides input validation and sanitization for client-side forms
 * Works in conjunction with server-side validation for defense-in-depth security
 */

import { z } from 'zod';

/**
 * Client-side input sanitization utilities
 */
export class ClientValidator {
  
  /**
   * Basic HTML sanitization for client-side display
   */
  static sanitizeForDisplay(input: string): string {
    if (typeof input !== 'string') return '';
    
    return input
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  /**
   * Sanitize input before sending to server
   */
  static sanitizeInput(input: string, options: {
    maxLength?: number;
    allowNewlines?: boolean;
    trimWhitespace?: boolean;
  } = {}): string {
    if (typeof input !== 'string') return '';
    
    const { maxLength = 1000, allowNewlines = true, trimWhitespace = true } = options;
    
    let sanitized = input;
    
    // Remove dangerous patterns
    sanitized = sanitized.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
    sanitized = sanitized.replace(/javascript:/gi, '');
    sanitized = sanitized.replace(/on\w+\s*=/gi, '');
    sanitized = sanitized.replace(/data:(?!image\/(png|jpe?g|gif|webp);base64,)/gi, '');
    
    // Handle newlines
    if (!allowNewlines) {
      sanitized = sanitized.replace(/[\r\n]/g, ' ');
    }
    
    // Normalize whitespace and trim
    if (trimWhitespace) {
      sanitized = sanitized.replace(/\s+/g, ' ').trim();
    }
    
    // Limit length
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength).trim();
    }
    
    return sanitized;
  }

  /**
   * Validate file before upload
   */
  static validateFile(file: File): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Check file size (50MB max)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      errors.push(`File size ${Math.round(file.size / 1024 / 1024)}MB exceeds maximum of ${Math.round(maxSize / 1024 / 1024)}MB`);
    }
    
    // Check file type
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];
    
    if (!allowedTypes.includes(file.type)) {
      errors.push('File type not supported. Please upload PDF, DOC, DOCX, or TXT files only.');
    }
    
    // Check file extension
    const allowedExtensions = ['.pdf', '.doc', '.docx', '.txt'];
    const extension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    
    if (!allowedExtensions.includes(extension)) {
      errors.push('File extension not allowed. Please use .pdf, .doc, .docx, or .txt files.');
    }
    
    // Check for suspicious patterns in filename
    const suspiciousPatterns = [
      /\.exe$/i,
      /\.bat$/i,
      /\.cmd$/i,
      /\.scr$/i,
      /\.jar$/i,
      /\.js$/i,
      /\.vbs$/i,
      /\.php$/i,
      /\.asp$/i,
      /\.jsp$/i
    ];
    
    if (suspiciousPatterns.some(pattern => pattern.test(file.name))) {
      errors.push('Suspicious file extension detected.');
    }
    
    // Check filename length
    if (file.name.length > 255) {
      errors.push('Filename too long (maximum 255 characters).');
    }
    
    // Check for empty file
    if (file.size === 0) {
      errors.push('File is empty.');
    }
    
    // Warnings for large files
    if (file.size > 25 * 1024 * 1024) {
      warnings.push('Large file detected. Upload may take longer than usual.');
    }
    
    // Warning for unusual file names
    if (!/^[a-zA-Z0-9._\-\s()]+$/.test(file.name)) {
      warnings.push('Filename contains special characters that may cause issues.');
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate email format
   */
  static validateEmail(email: string): boolean {
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return emailRegex.test(email) && email.length <= 254;
  }

  /**
   * Validate password strength
   */
  static validatePassword(password: string): {
    isValid: boolean;
    strength: 'weak' | 'medium' | 'strong' | 'very-strong';
    errors: string[];
    suggestions: string[];
  } {
    const errors: string[] = [];
    const suggestions: string[] = [];
    let score = 0;
    
    // Length check
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
      suggestions.push('Use at least 8 characters');
    } else if (password.length >= 12) {
      score += 2;
    } else {
      score += 1;
      suggestions.push('Consider using 12+ characters for better security');
    }
    
    // Character variety checks
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
      suggestions.push('Add lowercase letters (a-z)');
    } else {
      score += 1;
    }
    
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
      suggestions.push('Add uppercase letters (A-Z)');
    } else {
      score += 1;
    }
    
    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
      suggestions.push('Add numbers (0-9)');
    } else {
      score += 1;
    }
    
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Password must contain at least one special character');
      suggestions.push('Add special characters (!@#$%^&*)');
    } else {
      score += 1;
    }
    
    // Common password check
    const commonPasswords = [
      'password', '123456', 'qwerty', 'abc123', 'admin', 'letmein',
      'welcome', 'monkey', '1234567890', 'password123'
    ];
    
    if (commonPasswords.includes(password.toLowerCase())) {
      errors.push('Password is too common');
      suggestions.push('Avoid common passwords');
      score = 0;
    }
    
    // Sequential patterns
    if (/(?:012|123|234|345|456|567|678|789|890|abc|bcd|cde|def)/i.test(password)) {
      errors.push('Avoid sequential patterns');
      suggestions.push('Mix up character order');
      score = Math.max(0, score - 1);
    }
    
    let strength: 'weak' | 'medium' | 'strong' | 'very-strong' = 'weak';
    if (score >= 6) strength = 'very-strong';
    else if (score >= 4) strength = 'strong';
    else if (score >= 2) strength = 'medium';
    
    return {
      isValid: errors.length === 0,
      strength,
      errors,
      suggestions: suggestions.length > 0 ? suggestions : ['Password meets security requirements']
    };
  }

  /**
   * Rate limiting tracker for client-side
   */
  private static rateLimits = new Map<string, { count: number; resetTime: number }>();
  
  static checkClientRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
    const now = Date.now();
    const record = this.rateLimits.get(key);
    
    if (!record || now > record.resetTime) {
      this.rateLimits.set(key, { count: 1, resetTime: now + windowMs });
      return true;
    }
    
    if (record.count >= maxRequests) {
      return false;
    }
    
    record.count++;
    return true;
  }
}

/**
 * Client-side validation schemas
 */
export const clientSchemas = {
  // Basic string validation
  title: z.string()
    .min(1, 'Title is required')
    .max(200, 'Title must be less than 200 characters')
    .transform(val => ClientValidator.sanitizeInput(val, { maxLength: 200, allowNewlines: false })),
  
  description: z.string()
    .min(1, 'Description is required')
    .max(20000, 'Description must be less than 20,000 characters')
    .transform(val => ClientValidator.sanitizeInput(val, { maxLength: 20000, allowNewlines: true })),
  
  // Email validation
  email: z.string()
    .email('Please enter a valid email address')
    .max(254, 'Email address is too long')
    .transform(val => val.toLowerCase().trim()),
  
  // Password validation
  password: z.string()
    .refine(val => ClientValidator.validatePassword(val).isValid, {
      message: 'Password does not meet security requirements'
    }),
  
  // Search query
  searchQuery: z.string()
    .max(200, 'Search query too long')
    .transform(val => ClientValidator.sanitizeInput(val, { maxLength: 200, allowNewlines: false }))
    .optional(),
  
  // Job description fields
  jobTitle: z.string()
    .min(1, 'Job title is required')
    .max(200, 'Job title must be less than 200 characters')
    .transform(val => ClientValidator.sanitizeInput(val, { maxLength: 200, allowNewlines: false })),
  
  jobDescription: z.string()
    .min(50, 'Job description must be at least 50 characters')
    .max(50000, 'Job description must be less than 50,000 characters')
    .transform(val => ClientValidator.sanitizeInput(val, { maxLength: 50000, allowNewlines: true })),
  
  // Skills array
  skills: z.array(z.string().min(1).max(100))
    .min(1, 'At least one skill is required')
    .max(100, 'Too many skills')
    .transform(skills => skills.map(skill => ClientValidator.sanitizeInput(skill, { maxLength: 100, allowNewlines: false }))),
  
  // File validation
  file: z.custom<File>((file) => {
    if (!(file instanceof File)) return false;
    const validation = ClientValidator.validateFile(file);
    return validation.isValid;
  }, 'Invalid file'),
  
  // Profile fields
  displayName: z.string()
    .min(1, 'Display name is required')
    .max(100, 'Display name must be less than 100 characters')
    .transform(val => ClientValidator.sanitizeInput(val, { maxLength: 100, allowNewlines: false })),
  
  bio: z.string()
    .max(1000, 'Bio must be less than 1,000 characters')
    .transform(val => ClientValidator.sanitizeInput(val, { maxLength: 1000, allowNewlines: true }))
    .optional(),
};

/**
 * Form validation utilities
 */
export class FormValidator {
  /**
   * Validate form data against schema
   */
  static validate<T>(schema: z.ZodSchema<T>, data: unknown): {
    success: boolean;
    data?: T;
    errors?: Record<string, string>;
  } {
    try {
      const result = schema.parse(data);
      return { success: true, data: result };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors: Record<string, string> = {};
        for (const issue of error.issues) {
          const field = issue.path.join('.');
          errors[field] = issue.message;
        }
        return { success: false, errors };
      }
      return { success: false, errors: { _form: 'Validation failed' } };
    }
  }

  /**
   * Real-time field validation
   */
  static validateField<T>(schema: z.ZodSchema<T>, value: unknown): {
    isValid: boolean;
    error?: string;
  } {
    try {
      schema.parse(value);
      return { isValid: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { isValid: false, error: error.issues[0]?.message };
      }
      return { isValid: false, error: 'Validation failed' };
    }
  }
}

/**
 * Security utilities for client-side operations
 */
export class ClientSecurity {
  /**
   * Generate secure session identifiers
   */
  static generateSessionId(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Check if content appears to be safe for display
   */
  static isSafeContent(content: string): boolean {
    const dangerousPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /<iframe/i,
      /<embed/i,
      /<object/i,
      /data:\s*text\/html/i
    ];
    
    return !dangerousPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Sanitize content for safe display in React
   */
  static sanitizeForReact(content: string): string {
    return ClientValidator.sanitizeForDisplay(content);
  }
}