/**
 * Error Monitoring and Logging Infrastructure
 * 
 * Provides comprehensive error tracking, metrics collection, and monitoring
 * capabilities for the batch management system.
 */

import {
  AppError,
  ErrorSeverity,
  ErrorCategory,
  ErrorMetrics,
  ErrorLogEntry,
} from './error-handling';
import { BatchError } from './batch-error-handling';

// ===== MONITORING INTERFACES =====

interface ErrorPattern {
  id: string;
  pattern: RegExp | string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  description: string;
  suggestedFix?: string;
  alertThreshold: number;
  lastDetected?: Date;
  occurrenceCount: number;
}

interface ErrorAlert {
  id: string;
  type: 'rate_limit' | 'error_spike' | 'critical_error' | 'pattern_match';
  message: string;
  severity: ErrorSeverity;
  timestamp: Date;
  metadata: Record<string, unknown>;
  acknowledged: boolean;
}

interface MonitoringConfig {
  enabled: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  maxLogEntries: number;
  alertThresholds: {
    errorRate: number; // errors per minute
    criticalErrors: number; // critical errors per hour
    patternMatches: number; // pattern matches per hour
  };
  retention: {
    logs: number; // days
    metrics: number; // days
    alerts: number; // days
  };
  reporting: {
    enabled: boolean;
    endpoint?: string;
    apiKey?: string;
    batchSize: number;
    flushInterval: number; // milliseconds
  };
}

// ===== ERROR MONITORING CLASS =====

class ErrorMonitor {
  private logs: ErrorLogEntry[] = [];
  private metrics: ErrorMetrics = {
    errorCount: 0,
    errorRate: 0,
    averageResponseTime: 0,
    slowRequestCount: 0,
    circuitBreakerTrips: 0,
    retryAttempts: 0,
    recoverySuccessRate: 0,
  };
  private alerts: ErrorAlert[] = [];
  private patterns: ErrorPattern[] = [];
  private listeners: Array<(event: { type: string; data: any }) => void> = [];
  
  private errorWindow: number[] = [];
  private metricsWindow: Array<{ timestamp: number; responseTime: number; success: boolean }> = [];
  private pendingReports: ErrorLogEntry[] = [];
  private reportingTimer?: NodeJS.Timeout;

  constructor(private config: MonitoringConfig) {
    this.initializePatterns();
    this.startReporting();
  }

  private initializePatterns() {
    // Common error patterns to watch for
    this.patterns = [
      {
        id: 'batch_not_found_spike',
        pattern: /BATCH_NOT_FOUND|batch.*not.*found/i,
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.MEDIUM,
        description: 'High number of batch not found errors',
        suggestedFix: 'Check batch creation process and session management',
        alertThreshold: 10,
        occurrenceCount: 0,
      },
      {
        id: 'network_timeout_pattern',
        pattern: /timeout|TIMEOUT_ERROR|connection.*timeout/i,
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.HIGH,
        description: 'Network timeout errors detected',
        suggestedFix: 'Check server performance and network connectivity',
        alertThreshold: 5,
        occurrenceCount: 0,
      },
      {
        id: 'auth_failure_pattern',
        pattern: /unauthorized|AUTHENTICATION_ERROR|auth.*failed/i,
        category: ErrorCategory.SECURITY,
        severity: ErrorSeverity.HIGH,
        description: 'Authentication failures detected',
        suggestedFix: 'Check authentication service and token management',
        alertThreshold: 3,
        occurrenceCount: 0,
      },
      {
        id: 'database_error_pattern',
        pattern: /database|DATABASE_ERROR|query.*failed/i,
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.CRITICAL,
        description: 'Database errors detected',
        suggestedFix: 'Check database connectivity and performance',
        alertThreshold: 2,
        occurrenceCount: 0,
      },
      {
        id: 'memory_leak_pattern',
        pattern: /memory|out.*of.*memory|heap.*overflow/i,
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.CRITICAL,
        description: 'Memory-related errors detected',
        suggestedFix: 'Investigate memory leaks and optimize resource usage',
        alertThreshold: 1,
        occurrenceCount: 0,
      },
    ];
  }

  private startReporting() {
    if (!this.config.reporting.enabled) return;

    this.reportingTimer = setInterval(() => {
      this.flushPendingReports();
    }, this.config.reporting.flushInterval);
  }

  logError(error: AppError, context?: Record<string, unknown>): string {
    if (!this.config.enabled) return '';

    const logEntry: ErrorLogEntry = {
      id: this.generateLogId(),
      timestamp: new Date(),
      level: this.getLogLevel(error.severity),
      error: {
        ...error,
        context: {
          ...error.context,
          ...context,
        },
      },
      resolved: false,
      userImpact: this.calculateUserImpact(error),
      tags: this.generateTags(error),
    };

    // Add to logs
    this.addToLogs(logEntry);

    // Update metrics
    this.updateMetrics(error);

    // Check patterns
    this.checkPatterns(error);

    // Check alert thresholds
    this.checkAlertThresholds();

    // Add to pending reports
    if (this.config.reporting.enabled) {
      this.pendingReports.push(logEntry);
      
      if (this.pendingReports.length >= this.config.reporting.batchSize) {
        this.flushPendingReports();
      }
    }

    // Notify listeners
    this.notifyListeners('error_logged', { logEntry, error });

    return logEntry.id;
  }

  private generateLogId(): string {
    return `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getLogLevel(severity: ErrorSeverity): 'error' | 'warn' | 'info' | 'debug' {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
      case ErrorSeverity.HIGH:
        return 'error';
      case ErrorSeverity.MEDIUM:
        return 'warn';
      case ErrorSeverity.LOW:
        return 'info';
      default:
        return 'debug';
    }
  }

  private calculateUserImpact(error: AppError): 'none' | 'low' | 'medium' | 'high' {
    if (error.severity === ErrorSeverity.CRITICAL) return 'high';
    if (error.severity === ErrorSeverity.HIGH) return 'medium';
    if (error.category === ErrorCategory.VALIDATION) return 'low';
    if (error.category === ErrorCategory.NETWORK) return 'medium';
    if (error.category === ErrorCategory.SECURITY) return 'high';
    return 'low';
  }

  private generateTags(error: AppError): string[] {
    const tags = [
      error.category,
      error.severity,
      error.code,
    ];

    // Add batch-specific tags
    if ('batchContext' in error) {
      const batchError = error as BatchError;
      if (batchError.batchContext?.operation) {
        tags.push(`operation:${batchError.batchContext.operation}`);
      }
    }

    // Add retryable tag
    if (error.retryable) {
      tags.push('retryable');
    }

    // Add user agent tag if available
    if (error.context.userAgent) {
      const isMobile = /mobile|android|iphone|ipad/i.test(error.context.userAgent);
      tags.push(isMobile ? 'mobile' : 'desktop');
    }

    return tags.filter(Boolean);
  }

  private addToLogs(logEntry: ErrorLogEntry) {
    this.logs.unshift(logEntry);

    // Keep only recent logs
    if (this.logs.length > this.config.maxLogEntries) {
      this.logs = this.logs.slice(0, this.config.maxLogEntries);
    }
  }

  private updateMetrics(error: AppError) {
    this.metrics.errorCount++;
    
    // Update error rate (errors per minute)
    const now = Date.now();
    this.errorWindow.push(now);
    
    // Remove errors older than 1 minute
    const windowStart = now - 60000;
    this.errorWindow = this.errorWindow.filter(timestamp => timestamp > windowStart);
    this.metrics.errorRate = this.errorWindow.length;

    // Update circuit breaker trips
    if (error.code === 'CIRCUIT_BREAKER_OPEN') {
      this.metrics.circuitBreakerTrips++;
    }

    // Update retry attempts
    if (error.attempts && error.attempts > 1) {
      this.metrics.retryAttempts += error.attempts - 1;
    }

    // Update recovery success rate
    if (error.attempts && error.maxRetries) {
      const wasSuccessful = error.attempts <= error.maxRetries;
      if (wasSuccessful) {
        this.metrics.recoverySuccessRate = 
          (this.metrics.recoverySuccessRate + 1) / 2; // Running average
      }
    }
  }

  private checkPatterns(error: AppError) {
    for (const pattern of this.patterns) {
      const matches = typeof pattern.pattern === 'string' 
        ? error.message.includes(pattern.pattern) || error.code.includes(pattern.pattern)
        : pattern.pattern.test(error.message) || pattern.pattern.test(error.code);

      if (matches) {
        pattern.occurrenceCount++;
        pattern.lastDetected = new Date();

        if (pattern.occurrenceCount >= pattern.alertThreshold) {
          this.createAlert({
            type: 'pattern_match',
            message: `Pattern "${pattern.id}" detected ${pattern.occurrenceCount} times`,
            severity: pattern.severity,
            metadata: {
              patternId: pattern.id,
              description: pattern.description,
              suggestedFix: pattern.suggestedFix,
              occurrenceCount: pattern.occurrenceCount,
            },
          });

          // Reset counter after alert
          pattern.occurrenceCount = 0;
        }
      }
    }
  }

  private checkAlertThresholds() {
    const { alertThresholds } = this.config;

    // Check error rate
    if (this.metrics.errorRate >= alertThresholds.errorRate) {
      this.createAlert({
        type: 'rate_limit',
        message: `High error rate detected: ${this.metrics.errorRate} errors/minute`,
        severity: ErrorSeverity.HIGH,
        metadata: {
          errorRate: this.metrics.errorRate,
          threshold: alertThresholds.errorRate,
        },
      });
    }

    // Check critical errors
    const recentCriticalErrors = this.logs.filter(log => 
      log.level === 'error' &&
      Date.now() - log.timestamp.getTime() < 3600000 // Last hour
    ).length;

    if (recentCriticalErrors >= alertThresholds.criticalErrors) {
      this.createAlert({
        type: 'critical_error',
        message: `High number of critical errors: ${recentCriticalErrors} in the last hour`,
        severity: ErrorSeverity.CRITICAL,
        metadata: {
          criticalErrorCount: recentCriticalErrors,
          threshold: alertThresholds.criticalErrors,
        },
      });
    }
  }

  private createAlert(alertData: Omit<ErrorAlert, 'id' | 'timestamp' | 'acknowledged'>) {
    const alert: ErrorAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      acknowledged: false,
      ...alertData,
    };

    this.alerts.unshift(alert);

    // Keep only recent alerts
    const maxAlerts = 100;
    if (this.alerts.length > maxAlerts) {
      this.alerts = this.alerts.slice(0, maxAlerts);
    }

    // Notify listeners
    this.notifyListeners('alert_created', { alert });

    console.warn(`🚨 Error Alert: ${alert.message}`, alert.metadata);
  }

  private async flushPendingReports() {
    if (this.pendingReports.length === 0 || !this.config.reporting.endpoint) {
      return;
    }

    const reportsToSend = [...this.pendingReports];
    this.pendingReports = [];

    try {
      const response = await fetch(this.config.reporting.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.reporting.apiKey && {
            'Authorization': `Bearer ${this.config.reporting.apiKey}`,
          }),
        },
        body: JSON.stringify({
          errors: reportsToSend,
          metadata: {
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            url: window.location.href,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to send error reports: ${response.statusText}`);
      }

      console.log(`📊 Sent ${reportsToSend.length} error reports to monitoring service`);
    } catch (error) {
      console.warn('Failed to send error reports:', error);
      
      // Re-add reports to pending if not too many
      if (this.pendingReports.length < 1000) {
        this.pendingReports.unshift(...reportsToSend);
      }
    }
  }

  private notifyListeners(type: string, data: any) {
    this.listeners.forEach(listener => {
      try {
        listener({ type, data });
      } catch (error) {
        console.error('Error in monitoring listener:', error);
      }
    });
  }

  // ===== PUBLIC API =====

  subscribe(listener: (event: { type: string; data: any }) => void): () => void {
    this.listeners.push(listener);
    
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  getMetrics(): ErrorMetrics {
    return { ...this.metrics };
  }

  getLogs(filters?: {
    level?: 'error' | 'warn' | 'info' | 'debug';
    category?: ErrorCategory;
    severity?: ErrorSeverity;
    since?: Date;
    limit?: number;
  }): ErrorLogEntry[] {
    let filteredLogs = [...this.logs];

    if (filters) {
      if (filters.level) {
        filteredLogs = filteredLogs.filter(log => log.level === filters.level);
      }
      
      if (filters.category) {
        filteredLogs = filteredLogs.filter(log => log.error.category === filters.category);
      }
      
      if (filters.severity) {
        filteredLogs = filteredLogs.filter(log => log.error.severity === filters.severity);
      }
      
      if (filters.since) {
        filteredLogs = filteredLogs.filter(log => log.timestamp >= filters.since!);
      }
      
      if (filters.limit) {
        filteredLogs = filteredLogs.slice(0, filters.limit);
      }
    }

    return filteredLogs;
  }

  getAlerts(onlyUnacknowledged: boolean = false): ErrorAlert[] {
    return onlyUnacknowledged 
      ? this.alerts.filter(alert => !alert.acknowledged)
      : [...this.alerts];
  }

  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      this.notifyListeners('alert_acknowledged', { alertId });
      return true;
    }
    return false;
  }

  resolveError(logId: string, resolutionMethod: string): boolean {
    const log = this.logs.find(l => l.id === logId);
    if (log && !log.resolved) {
      log.resolved = true;
      log.resolvedAt = new Date();
      log.resolutionMethod = resolutionMethod;
      this.notifyListeners('error_resolved', { logId, resolutionMethod });
      return true;
    }
    return false;
  }

  getHealthStatus(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    metrics: ErrorMetrics;
    alerts: number;
    issues: string[];
  } {
    const { errorRate } = this.metrics;
    const unacknowledgedAlerts = this.getAlerts(true).length;
    const issues: string[] = [];

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (errorRate > this.config.alertThresholds.errorRate) {
      status = 'degraded';
      issues.push(`High error rate: ${errorRate} errors/minute`);
    }

    if (unacknowledgedAlerts > 5) {
      status = 'unhealthy';
      issues.push(`Too many unacknowledged alerts: ${unacknowledgedAlerts}`);
    }

    if (this.metrics.circuitBreakerTrips > 3) {
      status = 'degraded';
      issues.push('Multiple circuit breaker trips detected');
    }

    return {
      status,
      metrics: this.metrics,
      alerts: unacknowledgedAlerts,
      issues,
    };
  }

  exportData(): {
    logs: ErrorLogEntry[];
    metrics: ErrorMetrics;
    alerts: ErrorAlert[];
    patterns: ErrorPattern[];
    config: MonitoringConfig;
  } {
    return {
      logs: this.logs,
      metrics: this.metrics,
      alerts: this.alerts,
      patterns: this.patterns,
      config: this.config,
    };
  }

  cleanup() {
    if (this.reportingTimer) {
      clearInterval(this.reportingTimer);
    }
    
    // Send any remaining reports
    this.flushPendingReports();
  }
}

// ===== DEFAULT CONFIGURATION =====

const DEFAULT_MONITORING_CONFIG: MonitoringConfig = {
  enabled: true,
  logLevel: 'error',
  maxLogEntries: 1000,
  alertThresholds: {
    errorRate: 10, // 10 errors per minute
    criticalErrors: 5, // 5 critical errors per hour
    patternMatches: 3, // 3 pattern matches per hour
  },
  retention: {
    logs: 7, // 7 days
    metrics: 30, // 30 days
    alerts: 14, // 14 days
  },
  reporting: {
    enabled: false, // Disabled by default
    batchSize: 10,
    flushInterval: 30000, // 30 seconds
  },
};

// ===== GLOBAL INSTANCE =====

export const errorMonitor = new ErrorMonitor(DEFAULT_MONITORING_CONFIG);

// ===== REACT HOOKS =====

import { useState, useEffect } from 'react';

export function useErrorMonitoring() {
  const [metrics, setMetrics] = useState<ErrorMetrics>(errorMonitor.getMetrics());
  const [alerts, setAlerts] = useState<ErrorAlert[]>(errorMonitor.getAlerts(true));

  useEffect(() => {
    const unsubscribe = errorMonitor.subscribe(({ type, data }) => {
      if (type === 'error_logged') {
        setMetrics(errorMonitor.getMetrics());
      } else if (type === 'alert_created') {
        setAlerts(errorMonitor.getAlerts(true));
      }
    });

    return unsubscribe;
  }, []);

  return {
    metrics,
    alerts,
    logError: (error: AppError, context?: Record<string, unknown>) => 
      errorMonitor.logError(error, context),
    acknowledgeAlert: (alertId: string) => errorMonitor.acknowledgeAlert(alertId),
    resolveError: (logId: string, method: string) => 
      errorMonitor.resolveError(logId, method),
    getHealthStatus: () => errorMonitor.getHealthStatus(),
    getLogs: (filters?: any) => errorMonitor.getLogs(filters),
  };
}

// ===== EXPORTS =====

export type {
  ErrorPattern,
  ErrorAlert,
  MonitoringConfig,
};

export { ErrorMonitor, DEFAULT_MONITORING_CONFIG };