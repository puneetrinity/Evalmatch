/**
 * Comprehensive Error Boundary Component
 * 
 * Provides robust error handling for React components with:
 * - Error catching and state management
 * - User-friendly fallback UI
 * - Error recovery mechanisms
 * - Detailed error reporting
 * - Integration with error handling system
 */

import React, { Component, ReactNode, ErrorInfo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { 
  RefreshCw, 
  Home, 
  AlertTriangle, 
  Bug, 
  Shield, 
  Wifi, 
  Database,
  Copy,
  ExternalLink
} from 'lucide-react';
import { 
  AppError, 
  ErrorBoundaryState, 
  RecoveryAction, 
  ErrorCategory, 
  ErrorSeverity,
  createSystemError,
  generateErrorId,
  createErrorContext,
  showErrorToast
} from '@/lib/error-handling';

// ===== INTERFACES =====

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: AppError, retry: () => void) => ReactNode;
  onError?: (error: AppError, errorInfo: ErrorInfo) => void;
  enableRecovery?: boolean;
  enableReporting?: boolean;
  isolateErrors?: boolean;
  maxRetries?: number;
  resetOnPropsChange?: boolean;
  resetKeys?: string[];
  component?: string;
  level?: 'page' | 'section' | 'component';
}

interface ErrorBoundaryPropsWithKey extends ErrorBoundaryProps {
  key?: string;
}

// ===== ERROR BOUNDARY COMPONENT =====

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private retryTimeoutId: NodeJS.Timeout | null = null;
  private errorId: string | null = null;
  
  constructor(props: ErrorBoundaryProps) {
    super(props);
    
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
      recoveryActions: [],
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Convert React error to our AppError type
    const appError = createSystemError(error.message, {
      code: 'REACT_ERROR',
      componentName: 'React Component',
      severity: ErrorSeverity.HIGH,
      context: createErrorContext({
        errorType: 'React Error Boundary',
        originalError: error.toString(),
      }),
    });

    return {
      hasError: true,
      error: appError,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { onError, component = 'Unknown Component', level = 'component' } = this.props;
    
    this.errorId = generateErrorId();
    
    // Create detailed app error
    const appError = createSystemError(error.message, {
      code: 'REACT_COMPONENT_ERROR',
      componentName: component,
      severity: this.getSeverityByLevel(level),
      context: createErrorContext({
        componentStack: errorInfo.componentStack,
        errorBoundary: component,
        errorId: this.errorId,
        level,
        stackTrace: error.stack,
      }),
    });

    // Update state with error details
    this.setState({
      error: appError,
      errorInfo: {
        componentStack: errorInfo.componentStack || undefined,
        errorBoundary: component,
      },
      recoveryActions: this.generateRecoveryActions(appError),
    });

    // Call custom error handler
    if (onError) {
      onError(appError, errorInfo);
    }

    // Log error for monitoring
    this.logError(appError, errorInfo);
    
    // Show toast notification for high-severity errors
    if (appError.severity === ErrorSeverity.HIGH || appError.severity === ErrorSeverity.CRITICAL) {
      showErrorToast(appError);
    }
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    const { resetOnPropsChange, resetKeys } = this.props;
    const { hasError } = this.state;

    // Reset error state if specified props change
    if (hasError && resetOnPropsChange && resetKeys) {
      const hasResetKeyChanged = resetKeys.some(key => 
        prevProps[key as keyof ErrorBoundaryProps] !== this.props[key as keyof ErrorBoundaryProps]
      );

      if (hasResetKeyChanged) {
        this.resetErrorBoundary();
      }
    }
  }

  componentWillUnmount() {
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
    }
  }

  private getSeverityByLevel(level: string): ErrorSeverity {
    switch (level) {
      case 'page':
        return ErrorSeverity.CRITICAL;
      case 'section':
        return ErrorSeverity.HIGH;
      case 'component':
        return ErrorSeverity.MEDIUM;
      default:
        return ErrorSeverity.MEDIUM;
    }
  }

  private generateRecoveryActions(error: AppError): RecoveryAction[] {
    const actions: RecoveryAction[] = [];

    // Always add retry action for retryable errors
    if (error.retryable && this.state.retryCount < (this.props.maxRetries || 3)) {
      actions.push({
        id: 'retry',
        label: 'Try Again',
        description: 'Retry the failed operation',
        action: this.handleRetry,
        isDestructive: false,
        requiresConfirmation: false,
        icon: 'RefreshCw',
      });
    }

    // Add page refresh action
    actions.push({
      id: 'refresh',
      label: 'Refresh Page',
      description: 'Reload the entire page',
      action: this.handlePageRefresh,
      isDestructive: false,
      requiresConfirmation: false,
      icon: 'RefreshCw',
    });

    // Add navigation actions based on error level
    if (this.props.level === 'page') {
      actions.push({
        id: 'go-home',
        label: 'Go to Home',
        description: 'Navigate to the home page',
        action: this.handleGoHome,
        isDestructive: false,
        requiresConfirmation: false,
        icon: 'Home',
      });
    }

    // Add reset session for auth/security errors
    if (error.category === ErrorCategory.SECURITY) {
      actions.push({
        id: 'reset-session',
        label: 'Reset Session',
        description: 'Clear session data and start fresh',
        action: this.handleResetSession,
        isDestructive: true,
        requiresConfirmation: true,
        icon: 'Shield',
      });
    }

    // Add clear cache for network/system errors
    if (error.category === ErrorCategory.NETWORK || error.category === ErrorCategory.SYSTEM) {
      actions.push({
        id: 'clear-cache',
        label: 'Clear Cache',
        description: 'Clear browser cache and reload',
        action: this.handleClearCache,
        isDestructive: true,
        requiresConfirmation: true,
        icon: 'Database',
      });
    }

    return actions;
  }

  private logError(error: AppError, errorInfo: ErrorInfo) {
    // Only log in development mode
    if (process.env.NODE_ENV === 'development') {
      console.group(`🚨 Error Boundary: ${error.code}`);
      console.error('Error:', error);
      console.error('Error Info:', errorInfo);
      console.error('Component Stack:', errorInfo.componentStack);
      console.error('Error ID:', this.errorId);
      console.groupEnd();
    }

    // In production, send to monitoring service instead
    if (process.env.NODE_ENV === 'production') {
      // Send to monitoring service (implement your monitoring solution)
      // sendErrorToMonitoring(error, errorInfo);
    }
  }

  private resetErrorBoundary = () => {
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
      this.retryTimeoutId = null;
    }

    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
      recoveryActions: [],
    });
  };

  private handleRetry = async () => {
    const { maxRetries = 3 } = this.props;
    const { retryCount } = this.state;

    if (retryCount >= maxRetries) {
      showErrorToast(createSystemError('Maximum retry attempts reached', {
        code: 'MAX_RETRIES_EXCEEDED',
        severity: ErrorSeverity.MEDIUM,
      }));
      return;
    }

    // Add progressive delay for retries
    const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 10000);
    
    this.setState({ retryCount: retryCount + 1 });

    this.retryTimeoutId = setTimeout(() => {
      this.resetErrorBoundary();
    }, retryDelay);
  };

  private handlePageRefresh = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  private handleResetSession = () => {
    // Clear session storage and local storage
    sessionStorage.clear();
    localStorage.clear();
    
    // Redirect to login or home
    window.location.href = '/';
  };

  private handleClearCache = async () => {
    // Clear browser caches if available
    if ('caches' in window) {
      try {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      } catch (error) {
        console.warn('Failed to clear caches:', error);
      }
    }

    // Clear storage
    localStorage.clear();
    sessionStorage.clear();
    
    // Reload page
    window.location.reload();
  };

  private copyErrorDetails = () => {
    const { error, errorInfo } = this.state;
    if (!error) return;

    const errorDetails = {
      id: this.errorId,
      code: error.code,
      message: error.message,
      category: error.category,
      severity: error.severity,
      timestamp: error.context.timestamp,
      component: this.props.component,
      userAgent: error.context.userAgent,
      url: error.context.url,
      componentStack: errorInfo?.componentStack,
    };

    const textData = JSON.stringify(errorDetails, null, 2);
    
    if (navigator.clipboard) {
      navigator.clipboard.writeText(textData);
      showErrorToast(createSystemError('Error details copied to clipboard', {
        severity: ErrorSeverity.LOW,
        userFriendlyMessage: 'Error details copied to clipboard',
      }));
    }
  };

  private getErrorIcon(category: ErrorCategory) {
    switch (category) {
      case ErrorCategory.NETWORK:
        return <Wifi className="h-6 w-6" />;
      case ErrorCategory.SECURITY:
        return <Shield className="h-6 w-6" />;
      case ErrorCategory.SYSTEM:
        return <Database className="h-6 w-6" />;
      case ErrorCategory.VALIDATION:
        return <AlertTriangle className="h-6 w-6" />;
      default:
        return <Bug className="h-6 w-6" />;
    }
  }

  private getSeverityColor(severity: ErrorSeverity): string {
    switch (severity) {
      case ErrorSeverity.LOW:
        return 'bg-blue-100 text-blue-800';
      case ErrorSeverity.MEDIUM:
        return 'bg-yellow-100 text-yellow-800';
      case ErrorSeverity.HIGH:
        return 'bg-orange-100 text-orange-800';
      case ErrorSeverity.CRITICAL:
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  private renderRecoveryActions() {
    const { recoveryActions } = this.state;
    
    if (recoveryActions.length === 0) return null;

    return (
      <div className="flex flex-wrap gap-2 mt-4">
        {recoveryActions.map((action) => (
          <Button
            key={action.id}
            variant={action.isDestructive ? "destructive" : "default"}
            size="sm"
            onClick={action.action}
            className="flex items-center gap-2"
          >
            {action.icon === 'RefreshCw' && <RefreshCw className="h-4 w-4" />}
            {action.icon === 'Home' && <Home className="h-4 w-4" />}
            {action.icon === 'Shield' && <Shield className="h-4 w-4" />}
            {action.icon === 'Database' && <Database className="h-4 w-4" />}
            {action.label}
          </Button>
        ))}
      </div>
    );
  }

  private renderFallbackUI() {
    const { error, errorInfo, retryCount } = this.state;
    const { maxRetries = 3, level = 'component', component = 'Component' } = this.props;
    
    if (!error) return null;

    const isPageLevel = level === 'page';
    const showDetailedError = process.env.NODE_ENV === 'development' || errorInfo;

    return (
      <Card className={`w-full ${isPageLevel ? 'max-w-2xl mx-auto mt-8' : ''}`}>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="text-red-500">
              {this.getErrorIcon(error.category)}
            </div>
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2">
                {isPageLevel ? 'Page Error' : `${component} Error`}
                <Badge className={this.getSeverityColor(error.severity)}>
                  {error.severity}
                </Badge>
              </CardTitle>
              <CardDescription>
                {error.userFriendlyMessage}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Error Code and ID */}
          <div className="flex flex-wrap gap-2 text-sm text-gray-600">
            <span>Error Code: <code className="bg-gray-100 px-1 rounded">{error.code}</code></span>
            {this.errorId && (
              <span>ID: <code className="bg-gray-100 px-1 rounded">{this.errorId.slice(-8)}</code></span>
            )}
          </div>

          {/* Retry Information */}
          {error.retryable && retryCount > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Retry Attempt {retryCount} of {maxRetries}</AlertTitle>
              <AlertDescription>
                {retryCount >= maxRetries 
                  ? 'Maximum retry attempts reached. Please try a different action.'
                  : 'Attempting to recover from the error...'
                }
              </AlertDescription>
            </Alert>
          )}

          {/* Suggested Actions */}
          {error.suggestedActions.length > 0 && (
            <div>
              <h4 className="font-medium text-sm mb-2">Suggested Actions:</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                {error.suggestedActions.map((action, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className="text-blue-500 mt-1">•</span>
                    {action}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recovery Actions */}
          {this.renderRecoveryActions()}

          {/* Error Details (Development) */}
          {showDetailedError && (
            <details className="text-sm">
              <summary className="cursor-pointer font-medium">Technical Details</summary>
              <div className="mt-2 p-3 bg-gray-50 rounded border">
                <div className="space-y-2">
                  <div><strong>Message:</strong> {error.message}</div>
                  <div><strong>Category:</strong> {error.category}</div>
                  <div><strong>Timestamp:</strong> {error.context.timestamp.toISOString()}</div>
                  {error.context.url && (
                    <div><strong>URL:</strong> {error.context.url}</div>
                  )}
                  {errorInfo?.componentStack && (
                    <div>
                      <strong>Component Stack:</strong>
                      <pre className="mt-1 text-xs bg-white p-2 rounded border overflow-auto">
                        {errorInfo.componentStack}
                      </pre>
                    </div>
                  )}
                </div>
                
                <div className="mt-3 flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={this.copyErrorDetails}
                    className="flex items-center gap-1"
                  >
                    <Copy className="h-3 w-3" />
                    Copy Details
                  </Button>
                  {process.env.NODE_ENV === 'development' && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => {
                        // Only log in development
                        console.error('Full Error Object:', error);
                      }}
                      className="flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Log to Console
                    </Button>
                  )}
                </div>
              </div>
            </details>
          )}
        </CardContent>
      </Card>
    );
  }

  render() {
    const { hasError } = this.state;
    const { children, fallback } = this.props;

    if (hasError) {
      // Use custom fallback if provided, otherwise use default
      if (fallback && this.state.error) {
        return fallback(this.state.error, this.handleRetry);
      }
      
      return this.renderFallbackUI();
    }

    return children;
  }
}

// ===== HIGHER-ORDER COMPONENT =====

export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
}

// ===== HOOK FOR ERROR BOUNDARY ACTIONS =====

export function useErrorHandler() {
  const throwError = (error: AppError | Error | string) => {
    if (typeof error === 'string') {
      throw new Error(error);
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(error.message);
  };

  const reportError = (error: AppError, context?: Record<string, unknown>) => {
    // Only log in development mode
    if (process.env.NODE_ENV === 'development') {
      console.error('Manual error report:', error, context);
    }
    showErrorToast(error);
  };

  return {
    throwError,
    reportError,
  };
}

// ===== PREBUILT ERROR BOUNDARIES =====

export const PageErrorBoundary: React.FC<{ children: ReactNode; pageName?: string }> = ({ 
  children, 
  pageName = 'Page' 
}) => (
  <ErrorBoundary
    level="page"
    component={pageName}
    enableRecovery={true}
    enableReporting={true}
    maxRetries={2}
  >
    {children}
  </ErrorBoundary>
);

export const SectionErrorBoundary: React.FC<{ children: ReactNode; sectionName?: string }> = ({ 
  children, 
  sectionName = 'Section' 
}) => (
  <ErrorBoundary
    level="section"
    component={sectionName}
    enableRecovery={true}
    maxRetries={3}
  >
    {children}
  </ErrorBoundary>
);

export const ComponentErrorBoundary: React.FC<{ children: ReactNode; componentName?: string }> = ({ 
  children, 
  componentName = 'Component' 
}) => (
  <ErrorBoundary
    level="component"
    component={componentName}
    enableRecovery={true}
    maxRetries={1}
    isolateErrors={true}
  >
    {children}
  </ErrorBoundary>
);

export default ErrorBoundary;