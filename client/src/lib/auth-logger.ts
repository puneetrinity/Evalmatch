/**
 * Environment-aware Authentication Logging Utility
 * 
 * Provides safe logging for authentication operations that:
 * - Only logs in development environments
 * - Never logs sensitive data like tokens, passwords, or full user objects
 * - Provides structured logging for debugging
 */

const isDevelopment = (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') ||
  (typeof window !== 'undefined' && (window as any).__DEV__) ||
  false;

interface LogContext {
  operation?: string;
  uid?: string;
  email?: string;
  provider?: string;
  success?: boolean;
  errorCode?: string;
}

class AuthLogger {
  private prefix = '[AUTH]';

  /**
   * Log authentication events in development only
   */
  debug(message: string, context?: LogContext): void {
    if (!isDevelopment) return;
    
    const sanitizedContext = this.sanitizeContext(context);
    console.log(`${this.prefix} ${message}`, sanitizedContext || '');
  }

  /**
   * Log authentication errors (always logged but sanitized)
   */
  error(message: string, error?: any, context?: LogContext): void {
    const sanitizedContext = this.sanitizeContext(context);
    const sanitizedError = this.sanitizeError(error);
    
    if (isDevelopment) {
      console.error(`${this.prefix} ERROR: ${message}`, {
        ...sanitizedContext,
        error: sanitizedError
      });
    } else {
      // In production, only log the message and error code/type
      console.error(`${this.prefix} ${message}`, {
        errorCode: sanitizedError?.code,
        errorType: sanitizedError?.type
      });
    }
  }

  /**
   * Log warnings (always logged but sanitized)
   */
  warn(message: string, context?: LogContext): void {
    const sanitizedContext = this.sanitizeContext(context);
    console.warn(`${this.prefix} ${message}`, sanitizedContext || '');
  }

  /**
   * Log successful operations (development only)
   */
  success(message: string, context?: LogContext): void {
    if (!isDevelopment) return;
    
    const sanitizedContext = this.sanitizeContext(context);
    console.log(`${this.prefix} ✅ ${message}`, sanitizedContext || '');
  }

  /**
   * Remove sensitive data from context
   */
  private sanitizeContext(context?: LogContext): Partial<LogContext> | undefined {
    if (!context) return undefined;

    return {
      operation: context.operation,
      uid: context.uid ? this.maskUid(context.uid) : undefined,
      email: context.email ? this.maskEmail(context.email) : undefined,
      provider: context.provider,
      success: context.success,
      errorCode: context.errorCode
    };
  }

  /**
   * Remove sensitive data from errors
   */
  private sanitizeError(error: any): { code?: string; type?: string; message?: string } | undefined {
    if (!error) return undefined;

    return {
      code: error.code,
      type: error.name || typeof error,
      message: isDevelopment ? error.message : undefined
    };
  }

  /**
   * Mask UID for logging (show first 4 and last 4 characters)
   */
  private maskUid(uid: string): string {
    if (uid.length <= 8) return '****';
    return `${uid.substring(0, 4)}...${uid.substring(uid.length - 4)}`;
  }

  /**
   * Mask email for logging
   */
  private maskEmail(email: string): string {
    const [localPart, domain] = email.split('@');
    if (!domain) return '****';
    
    const maskedLocal = localPart.length > 2 
      ? `${localPart[0]}***${localPart[localPart.length - 1]}`
      : '****';
    
    return `${maskedLocal}@${domain}`;
  }
}

export const authLogger = new AuthLogger();