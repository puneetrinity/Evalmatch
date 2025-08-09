/**
 * Database Security and Input Sanitization
 * 
 * Provides comprehensive protection against SQL injection and ensures
 * all database inputs are properly validated and sanitized
 */

import { logger } from "./logger";
import { SecurityValidator } from "@shared/security-validation";

/**
 * Database input sanitization utilities
 */
export class DatabaseSecurity {
  
  /**
   * Sanitize input for database operations
   */
  static sanitizeForDatabase(input: unknown, type: 'string' | 'number' | 'boolean' | 'json' = 'string'): unknown {
    if (input === null || input === undefined) {
      return null;
    }

    switch (type) {
      case 'string':
        if (typeof input !== 'string') {
          throw new Error('Expected string input for database operation');
        }
        return this.sanitizeStringForDb(input);

      case 'number':
        const num = Number(input);
        if (isNaN(num)) {
          throw new Error('Invalid number for database operation');
        }
        return num;

      case 'boolean':
        return Boolean(input);

      case 'json':
        if (typeof input === 'string') {
          try {
            JSON.parse(input);
            return input;
          } catch {
            throw new Error('Invalid JSON string for database operation');
          }
        }
        return JSON.stringify(input);

      default:
        throw new Error(`Unsupported database input type: ${type}`);
    }
  }

  /**
   * Sanitize string input for database storage
   */
  private static sanitizeStringForDb(input: string): string {
    // Remove dangerous SQL patterns
    let sanitized = input
      // Remove SQL comments
      .replace(/--.*$/gm, '')
      .replace(/\/\*.*?\*\//g, '')
      
      // Remove dangerous SQL keywords when not properly quoted
      .replace(/;\s*(DROP|DELETE|UPDATE|INSERT|CREATE|ALTER|EXEC|EXECUTE|UNION|DECLARE)\s+/gi, '; [SANITIZED] ')
      
      // Remove SQL injection patterns
      .replace(/('|(\\')|(;)|(--)|(\|)|(\*)|(%27)|(%2A)|(%7C))/g, '')
      
      // Remove command injection patterns
      .replace(/(\||&|;|\$|`|>|<|\n|\r)/g, '')
      
      // Remove null bytes
      .replace(/\0/g, '');

    return sanitized.trim();
  }

  /**
   * Validate and sanitize user ID for database queries
   */
  static sanitizeUserId(userId: unknown): string {
    if (typeof userId !== 'string') {
      throw new Error('User ID must be a string');
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(userId)) {
      throw new Error('Invalid user ID format');
    }

    if (userId.length > 128) {
      throw new Error('User ID too long');
    }

    return userId;
  }

  /**
   * Validate and sanitize numeric ID for database queries
   */
  static sanitizeNumericId(id: unknown): number {
    const numId = Number(id);
    
    if (isNaN(numId) || !Number.isInteger(numId) || numId <= 0) {
      throw new Error('Invalid numeric ID');
    }

    if (numId > Number.MAX_SAFE_INTEGER) {
      throw new Error('Numeric ID too large');
    }

    return numId;
  }

  /**
   * Validate and sanitize email for database storage
   */
  static sanitizeEmail(email: unknown): string {
    if (typeof email !== 'string') {
      throw new Error('Email must be a string');
    }

    const sanitizedEmail = email.toLowerCase().trim();
    
    if (!SecurityValidator.sanitizeEmail) {
      throw new Error('Email validation not available');
    }

    return SecurityValidator.sanitizeEmail(sanitizedEmail);
  }

  /**
   * Sanitize search queries to prevent SQL injection
   */
  static sanitizeSearchQuery(query: unknown): string | null {
    if (query === null || query === undefined || query === '') {
      return null;
    }

    if (typeof query !== 'string') {
      throw new Error('Search query must be a string');
    }

    // Remove dangerous patterns
    let sanitized = query
      .replace(/[%_]/g, '\\$&') // Escape SQL wildcards
      .replace(/['";]/g, '') // Remove quotes and semicolons
      .replace(/--.*$/gm, '') // Remove SQL comments
      .replace(/\/\*.*?\*\//g, '') // Remove block comments
      .replace(/\b(union|select|insert|update|delete|drop|create|alter|exec|execute|declare)\b/gi, '') // Remove SQL keywords
      .trim();

    if (sanitized.length === 0) {
      return null;
    }

    if (sanitized.length > 200) {
      sanitized = sanitized.substring(0, 200);
    }

    return sanitized;
  }

  /**
   * Sanitize JSON data for database storage
   */
  static sanitizeJsonData(data: unknown, maxSize: number = 1048576): string {
    try {
      const jsonString = typeof data === 'string' ? data : JSON.stringify(data);
      
      if (jsonString.length > maxSize) {
        throw new Error(`JSON data exceeds maximum size of ${maxSize} bytes`);
      }

      // Validate JSON structure
      JSON.parse(jsonString);
      
      // Check for dangerous patterns in JSON
      if (this.containsDangerousPatterns(jsonString)) {
        throw new Error('JSON data contains potentially dangerous content');
      }

      return jsonString;
    } catch (error) {
      if (error instanceof Error && error.message.includes('dangerous')) {
        throw error;
      }
      throw new Error('Invalid JSON data for database storage');
    }
  }

  /**
   * Check if content contains dangerous patterns
   */
  private static containsDangerousPatterns(content: string): boolean {
    const dangerousPatterns = [
      /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /data:(?!image\/(png|jpe?g|gif|webp);base64,)/gi,
      /eval\s*\(/gi,
      /function\s*\(/gi,
      /new\s+Function/gi,
      /setTimeout\s*\(/gi,
      /setInterval\s*\(/gi
    ];

    return dangerousPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Validate pagination parameters
   */
  static sanitizePagination(page: unknown, limit: unknown): { page: number; limit: number } {
    const sanitizedPage = Math.max(1, Math.min(10000, this.sanitizeNumericId(page || 1)));
    const sanitizedLimit = Math.max(1, Math.min(100, this.sanitizeNumericId(limit || 20)));

    return { page: sanitizedPage, limit: sanitizedLimit };
  }

  /**
   * Sanitize order by clauses to prevent SQL injection
   */
  static sanitizeOrderBy(
    orderBy: unknown, 
    allowedColumns: string[],
    defaultColumn: string = 'created_at'
  ): string {
    if (!orderBy || typeof orderBy !== 'string') {
      return defaultColumn;
    }

    const sanitized = orderBy.toLowerCase().trim();
    
    // Only allow alphanumeric characters and underscores
    if (!/^[a-z_]+$/.test(sanitized)) {
      logger.warn('Invalid order by column attempted', { orderBy });
      return defaultColumn;
    }

    if (!allowedColumns.includes(sanitized)) {
      logger.warn('Unauthorized order by column attempted', { 
        orderBy: sanitized,
        allowedColumns 
      });
      return defaultColumn;
    }

    return sanitized;
  }

  /**
   * Sanitize order direction to prevent SQL injection
   */
  static sanitizeOrderDirection(direction: unknown): 'ASC' | 'DESC' {
    if (typeof direction !== 'string') {
      return 'DESC';
    }

    const sanitized = direction.toUpperCase().trim();
    
    if (sanitized === 'ASC' || sanitized === 'DESC') {
      return sanitized;
    }

    return 'DESC';
  }

  /**
   * Sanitize array of strings for database operations
   */
  static sanitizeStringArray(
    arr: unknown,
    maxItems: number = 100,
    maxItemLength: number = 500
  ): string[] {
    if (!Array.isArray(arr)) {
      throw new Error('Expected array input');
    }

    if (arr.length > maxItems) {
      throw new Error(`Array exceeds maximum length of ${maxItems} items`);
    }

    return arr.map((item, index) => {
      if (typeof item !== 'string') {
        throw new Error(`Array item at index ${index} must be a string`);
      }

      const sanitized = this.sanitizeStringForDb(item);
      
      if (sanitized.length > maxItemLength) {
        throw new Error(`Array item at index ${index} exceeds maximum length of ${maxItemLength} characters`);
      }

      return sanitized;
    }).filter(item => item.length > 0);
  }

  /**
   * Validate database connection string for security
   */
  static validateConnectionString(connectionString: string): boolean {
    try {
      // Basic validation - should not contain dangerous patterns
      const dangerous = [
        ';',
        '--',
        '/*',
        '*/',
        'xp_',
        'sp_',
        'exec',
        'execute',
        'script',
        'javascript'
      ];

      const lowerStr = connectionString.toLowerCase();
      
      for (const pattern of dangerous) {
        if (lowerStr.includes(pattern)) {
          logger.error('Dangerous pattern found in connection string', { pattern });
          return false;
        }
      }

      return true;
    } catch (error) {
      logger.error('Error validating connection string', error);
      return false;
    }
  }

  /**
   * Log suspicious database operation attempts
   */
  static logSuspiciousActivity(
    operation: string,
    input: unknown,
    userId?: string,
    additionalInfo?: Record<string, unknown>
  ): void {
    logger.warn('Suspicious database operation detected', {
      operation,
      input: typeof input === 'string' ? input.substring(0, 200) : input,
      userId,
      timestamp: new Date().toISOString(),
      ...additionalInfo
    });
  }
}

/**
 * Query builder with built-in sanitization
 */
export class SecureQueryBuilder {
  private conditions: string[] = [];
  private parameters: unknown[] = [];
  private paramCount = 0;

  /**
   * Add a WHERE condition with automatic parameter binding
   */
  addCondition(column: string, operator: string, value: unknown): this {
    // Validate column name
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?$/.test(column)) {
      throw new Error(`Invalid column name: ${column}`);
    }

    // Validate operator
    const allowedOperators = ['=', '!=', '<', '>', '<=', '>=', 'LIKE', 'ILIKE', 'IN', 'NOT IN'];
    if (!allowedOperators.includes(operator.toUpperCase())) {
      throw new Error(`Invalid operator: ${operator}`);
    }

    this.paramCount++;
    this.conditions.push(`${column} ${operator} $${this.paramCount}`);
    this.parameters.push(DatabaseSecurity.sanitizeForDatabase(value));

    return this;
  }

  /**
   * Add a LIKE condition for text search
   */
  addSearchCondition(column: string, searchTerm: string): this {
    const sanitizedTerm = DatabaseSecurity.sanitizeSearchQuery(searchTerm);
    
    if (sanitizedTerm) {
      this.addCondition(column, 'ILIKE', `%${sanitizedTerm}%`);
    }

    return this;
  }

  /**
   * Get the WHERE clause
   */
  getWhereClause(): string {
    return this.conditions.length > 0 ? `WHERE ${this.conditions.join(' AND ')}` : '';
  }

  /**
   * Get parameters for parameterized query
   */
  getParameters(): unknown[] {
    return this.parameters;
  }

  /**
   * Reset builder
   */
  reset(): this {
    this.conditions = [];
    this.parameters = [];
    this.paramCount = 0;
    return this;
  }
}

/**
 * Transaction wrapper with automatic rollback on error
 */
export class SecureTransaction {
  private rollbackFunctions: Array<() => Promise<void>> = [];

  /**
   * Add a rollback function
   */
  addRollback(fn: () => Promise<void>): void {
    this.rollbackFunctions.push(fn);
  }

  /**
   * Execute rollback functions in reverse order
   */
  async rollback(): Promise<void> {
    const errors: Error[] = [];
    
    for (let i = this.rollbackFunctions.length - 1; i >= 0; i--) {
      try {
        await this.rollbackFunctions[i]();
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error('Rollback error'));
      }
    }

    if (errors.length > 0) {
      logger.error('Rollback errors occurred', { errors: errors.map(e => e.message) });
      throw new Error(`Rollback completed with ${errors.length} errors`);
    }
  }

  /**
   * Clear rollback functions
   */
  clear(): void {
    this.rollbackFunctions = [];
  }
}

/**
 * Database audit logging
 */
export class DatabaseAuditLogger {
  /**
   * Log database operation
   */
  static logOperation(
    operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE',
    table: string,
    userId?: string,
    affectedRows?: number,
    additionalInfo?: Record<string, unknown>
  ): void {
    logger.info('Database operation', {
      operation,
      table,
      userId,
      affectedRows,
      timestamp: new Date().toISOString(),
      ...additionalInfo
    });
  }

  /**
   * Log sensitive data access
   */
  static logSensitiveAccess(
    resource: string,
    userId: string,
    action: string,
    success: boolean,
    additionalInfo?: Record<string, unknown>
  ): void {
    logger.info('Sensitive data access', {
      resource,
      userId,
      action,
      success,
      timestamp: new Date().toISOString(),
      ...additionalInfo
    });
  }

  /**
   * Log failed database operations
   */
  static logFailure(
    operation: string,
    error: Error,
    userId?: string,
    additionalInfo?: Record<string, unknown>
  ): void {
    logger.error('Database operation failed', {
      operation,
      error: error.message,
      stack: error.stack,
      userId,
      timestamp: new Date().toISOString(),
      ...additionalInfo
    });
  }
}

// Export utility functions for common database operations
export const dbUtils = {
  sanitizeUserId: DatabaseSecurity.sanitizeUserId,
  sanitizeNumericId: DatabaseSecurity.sanitizeNumericId,
  sanitizeEmail: DatabaseSecurity.sanitizeEmail,
  sanitizeSearchQuery: DatabaseSecurity.sanitizeSearchQuery,
  sanitizePagination: DatabaseSecurity.sanitizePagination,
  sanitizeOrderBy: DatabaseSecurity.sanitizeOrderBy,
  sanitizeOrderDirection: DatabaseSecurity.sanitizeOrderDirection,
  sanitizeStringArray: DatabaseSecurity.sanitizeStringArray,
  sanitizeJsonData: DatabaseSecurity.sanitizeJsonData,
} as const;