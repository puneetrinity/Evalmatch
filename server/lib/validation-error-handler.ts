/**
 * Comprehensive Validation Error Handling System
 * 
 * Provides centralized error handling for validation failures with
 * security logging, rate limiting, and standardized error responses
 */

import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodIssue } from 'zod';
import { logger } from './logger';
// SecurityValidator not used directly here

/**
 * Security-focused validation error types
 */
// Many enum members are referenced indirectly by name in logs/rules; keep but suppress unused-member lint
/* eslint-disable no-unused-vars, @typescript-eslint/no-unused-vars */
export enum ValidationErrorType {
  INVALID_INPUT = 'INVALID_INPUT',
  MALICIOUS_CONTENT = 'MALICIOUS_CONTENT',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  FORBIDDEN_PATTERN = 'FORBIDDEN_PATTERN',
  FILE_SECURITY_VIOLATION = 'FILE_SECURITY_VIOLATION',
  SQL_INJECTION_ATTEMPT = 'SQL_INJECTION_ATTEMPT',
  XSS_ATTEMPT = 'XSS_ATTEMPT',
  CSRF_VIOLATION = 'CSRF_VIOLATION',
  SIZE_LIMIT_EXCEEDED = 'SIZE_LIMIT_EXCEEDED',
  AUTHENTICATION_REQUIRED = 'AUTHENTICATION_REQUIRED',
  AUTHORIZATION_FAILED = 'AUTHORIZATION_FAILED'
}
/* eslint-enable no-unused-vars, @typescript-eslint/no-unused-vars */

/**
 * Standardized validation error structure
 */
export interface ValidationError {
  type: ValidationErrorType;
  message: string;
  field?: string;
  code: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: string;
  requestId?: string;
  userId?: string;
  ip?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
}

/**
 * Security incident tracking
 */
interface SecurityIncident {
  type: ValidationErrorType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId?: string;
  ip: string;
  userAgent?: string;
  endpoint: string;
  method: string;
  payload?: string;
  timestamp: string;
  blocked: boolean;
}

/**
 * Validation error handler with security focus
 */
export class ValidationErrorHandler {
  private static incidents = new Map<string, SecurityIncident[]>();
  private static blockedIPs = new Set<string>();
  private static suspiciousUsers = new Map<string, number>();

  /**
   * Handle Zod validation errors with security analysis
   */
  static handleZodError(
    error: ZodError,
  req: Request,
    res: Response,
    context: string = 'validation'
  ): Response {
    const errors = this.processZodErrors(error.issues, req, context);
    const severity = this.calculateSeverity(errors);
    
    // Log security incidents
    if (severity === 'high' || severity === 'critical') {
      this.recordSecurityIncident({
        type: ValidationErrorType.MALICIOUS_CONTENT,
        severity,
        userId: req.user?.uid,
        ip: req.ip || 'unknown',
        userAgent: req.headers['user-agent'],
        endpoint: req.path,
        method: req.method,
        payload: JSON.stringify(req.body).substring(0, 1000),
        timestamp: new Date().toISOString(),
        blocked: true
      });
    }

    // Check for potential attacks
    const attackType = this.detectAttackType(errors);
    if (attackType) {
      this.handlePotentialAttack(req, attackType, severity);
    }

    const response = {
      success: false,
      error: 'Validation Failed',
      message: this.getSanitizedErrorMessage(errors, severity),
      code: 'VALIDATION_ERROR',
      details: this.getSafeErrorDetails(errors),
      timestamp: new Date().toISOString(),
      requestId: this.generateRequestId()
    };

  return res.status(this.getStatusCode(severity, attackType)).json(response);
  }

  /**
   * Process Zod issues into security-aware validation errors
   */
  private static processZodErrors(
    issues: ZodIssue[],
    req: Request,
    context: string
  ): ValidationError[] {
    return issues.map(issue => {
      const field = issue.path.join('.');
      const severity = this.assessFieldSeverity(field, issue.message, req);
      
      return {
        type: this.mapZodIssueToType(issue, severity),
        message: issue.message,
        field,
        code: issue.code,
        severity,
        timestamp: new Date().toISOString(),
        userId: req.user?.uid,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        details: {
          context,
          path: issue.path,
          received: 'input' in issue ? String(issue.input).substring(0, 100) : undefined
        }
      };
    });
  }

  /**
   * Map Zod issue to security-focused error type
   */
  private static mapZodIssueToType(issue: ZodIssue, severity: string): ValidationErrorType {
    // Check for potential security violations
    if (severity === 'critical' || severity === 'high') {
      if ('input' in issue && typeof issue.input === 'string') {
        if (this.containsXSSPatterns(issue.input)) {
          return ValidationErrorType.XSS_ATTEMPT;
        }
        if (this.containsSQLPatterns(issue.input)) {
          return ValidationErrorType.SQL_INJECTION_ATTEMPT;
        }
        if (this.containsForbiddenPatterns(issue.input)) {
          return ValidationErrorType.FORBIDDEN_PATTERN;
        }
      }
    }

    // Map based on Zod error codes
    switch (issue.code) {
      case 'too_big':
        return ValidationErrorType.SIZE_LIMIT_EXCEEDED;
      case 'invalid_string':
        return ValidationErrorType.MALICIOUS_CONTENT;
      default:
        return ValidationErrorType.INVALID_INPUT;
    }
  }

  /**
   * Assess severity based on field and content
   */
  private static assessFieldSeverity(
    field: string,
    _message: string,
    _req: Request
  ): 'low' | 'medium' | 'high' | 'critical' {
    // Critical fields that could indicate attacks
    const criticalFields = ['password', 'email', 'sql', 'script', 'query'];
    const highRiskFields = ['description', 'content', 'bio', 'title'];
    
    // Check for security patterns in error message
    if (_message.includes('dangerous') || _message.includes('malicious') || _message.includes('forbidden')) {
      return 'critical';
    }

    // Check field importance
    if (criticalFields.some(cf => field.toLowerCase().includes(cf))) {
      return 'high';
    }
    
    if (highRiskFields.some(hf => field.toLowerCase().includes(hf))) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Calculate overall severity from multiple errors
   */
  private static calculateSeverity(errors: ValidationError[]): 'low' | 'medium' | 'high' | 'critical' {
    if (errors.some(e => e.severity === 'critical')) return 'critical';
    if (errors.some(e => e.severity === 'high')) return 'high';
    if (errors.some(e => e.severity === 'medium')) return 'medium';
    return 'low';
  }

  /**
   * Detect type of potential attack
   */
  private static detectAttackType(errors: ValidationError[]): ValidationErrorType | null {
    const attackTypes = errors
      .filter(e => e.type !== ValidationErrorType.INVALID_INPUT)
      .map(e => e.type);

    if (attackTypes.length === 0) return null;

    // Return the most severe attack type
    const typePriority = {
      [ValidationErrorType.SQL_INJECTION_ATTEMPT]: 5,
      [ValidationErrorType.XSS_ATTEMPT]: 4,
      [ValidationErrorType.MALICIOUS_CONTENT]: 3,
      [ValidationErrorType.FORBIDDEN_PATTERN]: 2,
      [ValidationErrorType.FILE_SECURITY_VIOLATION]: 1
    };

    return attackTypes.reduce((highest, current) => {
      return (typePriority[current as keyof typeof typePriority] || 0) > 
             (typePriority[highest as keyof typeof typePriority] || 0) ? current : highest;
    });
  }

  /**
   * Handle potential security attack
   */
  private static handlePotentialAttack(
    req: Request,
    attackType: ValidationErrorType,
    severity: string
  ): void {
    const ip = req.ip || 'unknown';
    const userId = req.user?.uid;

    logger.error('SECURITY ALERT: Potential attack detected', {
      attackType,
      severity,
      ip,
      userId,
      endpoint: req.path,
      method: req.method,
      userAgent: req.headers['user-agent'],
      timestamp: new Date().toISOString()
    });

    // Implement progressive response
    if (severity === 'critical') {
      // Temporarily block IP for critical attacks
      this.blockedIPs.add(ip);
      setTimeout(() => this.blockedIPs.delete(ip), 15 * 60 * 1000); // 15 minutes
    }

    if (userId && (severity === 'high' || severity === 'critical')) {
      // Track suspicious users
      const count = this.suspiciousUsers.get(userId) || 0;
      this.suspiciousUsers.set(userId, count + 1);
      
      // Clear after 1 hour
      setTimeout(() => this.suspiciousUsers.delete(userId), 60 * 60 * 1000);
    }
  }

  /**
   * Record security incident for analysis
   */
  private static recordSecurityIncident(incident: SecurityIncident): void {
    const key = `${incident.ip}_${incident.userId || 'anonymous'}`;
    const incidents = this.incidents.get(key) || [];
    
    incidents.push(incident);
    
    // Keep only last 100 incidents per key
    if (incidents.length > 100) {
      incidents.shift();
    }
    
    this.incidents.set(key, incidents);
  }

  /**
   * Get sanitized error message for client
   */
  private static getSanitizedErrorMessage(
    errors: ValidationError[],
    severity: string
  ): string {
    if (severity === 'critical' || severity === 'high') {
      return 'Invalid input detected. Please review your submission and try again.';
    }

    const messages = errors
      .filter(e => e.severity !== 'critical' && e.severity !== 'high')
      .map(e => e.message)
      .slice(0, 3); // Limit to 3 messages

    return messages.length > 0 
      ? messages.join('; ')
      : 'One or more fields contain invalid data.';
  }

  /**
   * Get safe error details for client
   */
  private static getSafeErrorDetails(errors: ValidationError[]): Record<string, unknown> {
    const safeErrors = errors
      .filter(e => e.severity === 'low' || e.severity === 'medium')
      .map(e => ({
        field: e.field,
        code: e.code,
        message: e.message
      }))
      .slice(0, 10); // Limit to 10 errors

    return { errors: safeErrors };
  }

  /**
   * Get appropriate HTTP status code
   */
  private static getStatusCode(
    severity: string,
    attackType: ValidationErrorType | null
  ): number {
    if (attackType) {
      switch (attackType) {
        case ValidationErrorType.SQL_INJECTION_ATTEMPT:
        case ValidationErrorType.XSS_ATTEMPT:
          return 403; // Forbidden
        case ValidationErrorType.RATE_LIMIT_EXCEEDED:
          return 429; // Too Many Requests
        case ValidationErrorType.AUTHENTICATION_REQUIRED:
          return 401; // Unauthorized
        default:
          return 400; // Bad Request
      }
    }

    return severity === 'critical' ? 403 : 400;
  }

  /**
   * Check for XSS patterns
   */
  private static containsXSSPatterns(input: string): boolean {
    const xssPatterns = [
      /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<iframe[\s\S]*?>/gi,
      /<embed[\s\S]*?>/gi,
      /<object[\s\S]*?>/gi
    ];

    return xssPatterns.some(pattern => pattern.test(input));
  }

  /**
   * Check for SQL injection patterns
   */
  private static containsSQLPatterns(input: string): boolean {
    const sqlPatterns = [
      /(\bselect\b|\binsert\b|\bupdate\b|\bdelete\b|\bdrop\b|\bunion\b|\bexec\b)/gi,
      /['"];\s*(drop|delete|insert|update)/gi,
      /\b(or|and)\s+['"]?\d+['"]?\s*[=<>]/gi,
      /['"];/gi
    ];

    return sqlPatterns.some(pattern => pattern.test(input));
  }

  /**
   * Check for other forbidden patterns
   */
  private static containsForbiddenPatterns(input: string): boolean {
    const forbiddenPatterns = [
      /\.\.\//g,
      /\/bin\//g,
      /cmd\.exe/gi,
      /powershell/gi,
      /system\(/gi,
      /exec\(/gi
    ];

    return forbiddenPatterns.some(pattern => pattern.test(input));
  }

  /**
   * Generate unique request ID
   */
  private static generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }

  /**
   * Check if IP is blocked
   */
  static isIPBlocked(ip: string): boolean {
    return this.blockedIPs.has(ip);
  }

  /**
   * Check if user is suspicious
   */
  static isUserSuspicious(userId: string): boolean {
    return (this.suspiciousUsers.get(userId) || 0) > 5;
  }

  /**
   * Get security metrics
   */
  static getSecurityMetrics(): {
    blockedIPs: number;
    suspiciousUsers: number;
    totalIncidents: number;
    recentIncidents: number;
  } {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    let totalIncidents = 0;
    let recentIncidents = 0;

    for (const incidents of this.incidents.values()) {
      totalIncidents += incidents.length;
      recentIncidents += incidents.filter(i => 
        new Date(i.timestamp).getTime() > oneHourAgo
      ).length;
    }

    return {
      blockedIPs: this.blockedIPs.size,
      suspiciousUsers: this.suspiciousUsers.size,
      totalIncidents,
      recentIncidents
    };
  }

  /**
   * Express middleware for handling validation errors
   */
  static middleware() {
  return (error: Error, _req: Request, res: Response, next: NextFunction) => {
      // Check if IP is blocked
  if (this.isIPBlocked(_req.ip || '')) {
        return res.status(403).json({
          success: false,
          error: 'Access Denied',
          message: 'Your IP address has been temporarily blocked due to suspicious activity.',
          code: 'IP_BLOCKED',
          timestamp: new Date().toISOString()
        });
      }

      // Handle Zod validation errors
      if (error instanceof ZodError) {
        return this.handleZodError(error, _req, res);
      }

      // Handle other validation errors
      if (error.name === 'ValidationError') {
        logger.warn('General validation error', {
          error: error.message,
          ip: _req.ip,
          userId: _req.user?.uid,
          endpoint: _req.path,
          method: _req.method
        });

        return res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Invalid input provided.',
          code: 'GENERAL_VALIDATION_ERROR',
          timestamp: new Date().toISOString()
        });
      }

      // Pass through other errors
  next(error);
    };
  }
}

/**
 * Express middleware to check for blocked IPs and suspicious users
 */
export function securityMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || '';
  const userId = req.user?.uid;

  // Check blocked IP
  if (ValidationErrorHandler.isIPBlocked(ip)) {
    logger.warn('Blocked IP attempted access', { ip, endpoint: req.path });
    res.status(403).json({
      success: false,
      error: 'Access Denied',
      message: 'Access temporarily restricted.',
      code: 'IP_BLOCKED'
    });
    return;
  }

  // Check suspicious user
  if (userId && ValidationErrorHandler.isUserSuspicious(userId)) {
    logger.warn('Suspicious user attempted access', { userId, ip, endpoint: req.path });
    res.status(429).json({
      success: false,
      error: 'Rate Limited',
      message: 'Please wait before making more requests.',
      code: 'USER_SUSPICIOUS'
    });
    return;
  }

  next();
}