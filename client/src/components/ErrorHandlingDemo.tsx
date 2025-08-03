/**
 * Error Handling System Demo Component
 * 
 * Demonstrates the comprehensive error handling system with examples of:
 * - Different error types and scenarios
 * - Circuit breaker behavior
 * - Retry mechanisms
 * - Error recovery workflows
 * - User notifications and recovery actions
 */

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  AlertTriangle, 
  Bug, 
  Shield, 
  Wifi, 
  Database,
  RefreshCw,
  Activity,
  BarChart3,
  CheckCircle,
  XCircle,
  Clock,
  Zap
} from 'lucide-react';

import ErrorBoundary, { 
  PageErrorBoundary, 
  SectionErrorBoundary, 
  ComponentErrorBoundary, 
  useErrorHandler 
} from '@/components/ErrorBoundary';

import {
  createNetworkError,
  createValidationError,
  createBusinessLogicError,
  createSystemError,
  createSecurityError,
  showErrorToast,
  ErrorSeverity,
  ErrorCategory,
} from '@/lib/error-handling';

import { 
  BatchCircuitBreaker,
  BatchRetryManager,
  createBatchError,
  handleBatchError,
} from '@/lib/batch-error-handling';

import { 
  useGlobalErrors, 
  useConnectionStatus, 
  handleGlobalError 
} from '@/lib/global-error-handler';

import { useErrorMonitoring } from '@/lib/error-monitoring';

// ===== DEMO COMPONENTS =====

const ErrorTypeDemo: React.FC = () => {
  const { reportError } = useErrorHandler();

  const triggerNetworkError = () => {
    const error = createNetworkError('Connection timeout occurred', {
      code: 'DEMO_NETWORK_ERROR',
      isTimeout: true,
      endpoint: '/api/demo',
      responseTime: 5000,
    });
    reportError(error);
  };

  const triggerValidationError = () => {
    const error = createValidationError('Invalid email format provided', {
      code: 'DEMO_VALIDATION_ERROR',
      field: 'email',
      expectedFormat: 'user@domain.com',
      actualValue: 'invalid-email',
      validationErrors: [
        { field: 'email', message: 'Must be a valid email address', code: 'INVALID_EMAIL' }
      ],
    });
    reportError(error);
  };

  const triggerBusinessLogicError = () => {
    const error = createBusinessLogicError('Cannot delete batch with active resumes', {
      code: 'DEMO_BUSINESS_ERROR',
      businessRule: 'batch_deletion_policy',
      resourceId: 'batch_123',
      resourceType: 'batch',
      preconditions: {
        hasActiveResumes: true,
        userIsOwner: true,
        batchIsLocked: false,
      },
    });
    reportError(error);
  };

  const triggerSystemError = () => {
    const error = createSystemError('Database connection pool exhausted', {
      code: 'DEMO_SYSTEM_ERROR',
      componentName: 'DatabasePool',
      resourceType: 'database',
      isTransient: true,
      systemLoad: 0.95,
      severity: ErrorSeverity.HIGH,
    });
    reportError(error);
  };

  const triggerSecurityError = () => {
    const error = createSecurityError('Suspicious activity detected', {
      code: 'DEMO_SECURITY_ERROR',
      riskLevel: 'high',
      securityFlag: 'BRUTE_FORCE_ATTEMPT',
      ipAddress: '192.168.1.100',
      blocked: true,
      severity: ErrorSeverity.CRITICAL,
    });
    reportError(error);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Button 
          onClick={triggerNetworkError} 
          variant="outline" 
          className="flex items-center gap-2"
        >
          <Wifi className="h-4 w-4" />
          Network Error
        </Button>
        
        <Button 
          onClick={triggerValidationError} 
          variant="outline" 
          className="flex items-center gap-2"
        >
          <AlertTriangle className="h-4 w-4" />
          Validation Error
        </Button>
        
        <Button 
          onClick={triggerBusinessLogicError} 
          variant="outline" 
          className="flex items-center gap-2"
        >
          <Bug className="h-4 w-4" />
          Business Error
        </Button>
        
        <Button 
          onClick={triggerSystemError} 
          variant="outline" 
          className="flex items-center gap-2"
        >
          <Database className="h-4 w-4" />
          System Error
        </Button>
        
        <Button 
          onClick={triggerSecurityError} 
          variant="outline" 
          className="flex items-center gap-2"
        >
          <Shield className="h-4 w-4" />
          Security Error
        </Button>
      </div>
    </div>
  );
};

const CircuitBreakerDemo: React.FC = () => {
  const [circuitBreaker] = useState(() => new BatchCircuitBreaker({
    enabled: true,
    failureThreshold: 3,
    resetTimeout: 10000, // 10 seconds for demo
    monitoringPeriod: 60000,
  }));
  
  const [state, setState] = useState(circuitBreaker.getState());
  const [operationCount, setOperationCount] = useState(0);

  const simulateOperation = async (shouldFail: boolean = false) => {
    try {
      setOperationCount(prev => prev + 1);
      
      const result = await circuitBreaker.execute(async () => {
        if (shouldFail) {
          throw createNetworkError('Simulated operation failure', {
            code: 'DEMO_OPERATION_FAILURE',
            isServerUnavailable: true,
          });
        }
        return `Operation ${operationCount + 1} succeeded`;
      }, `demo-operation-${operationCount + 1}`);
      
      console.log('✅', result);
      showErrorToast(createSystemError('Operation succeeded', {
        severity: ErrorSeverity.LOW,
        userFriendlyMessage: `Operation ${operationCount + 1} completed successfully`,
      }));
      
    } catch (error) {
      console.error('❌ Operation failed:', error);
      handleGlobalError(error);
    } finally {
      setState(circuitBreaker.getState());
    }
  };

  const resetCircuitBreaker = () => {
    circuitBreaker.reset();
    setState(circuitBreaker.getState());
    setOperationCount(0);
  };

  const getStateColor = (isOpen: boolean) => {
    return isOpen ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800';
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Circuit Breaker Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <Badge className={getStateColor(state.isOpen)}>
                {state.isOpen ? 'OPEN' : 'CLOSED'}
              </Badge>
              <p className="text-sm text-gray-600 mt-1">State</p>
            </div>
            <div className="text-center">
              <Badge variant="outline">{state.failureCount}</Badge>
              <p className="text-sm text-gray-600 mt-1">Failures</p>
            </div>
            <div className="text-center">
              <Badge variant="outline">{state.totalRequests}</Badge>
              <p className="text-sm text-gray-600 mt-1">Total</p>
            </div>
            <div className="text-center">
              <Badge variant="outline">{state.successfulRequests}</Badge>
              <p className="text-sm text-gray-600 mt-1">Success</p>
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button 
              onClick={() => simulateOperation(false)} 
              disabled={state.isOpen}
              size="sm"
              className="flex items-center gap-2"
            >
              <CheckCircle className="h-4 w-4" />
              Success Operation
            </Button>
            
            <Button 
              onClick={() => simulateOperation(true)} 
              disabled={state.isOpen}
              variant="destructive"
              size="sm"
              className="flex items-center gap-2"
            >
              <XCircle className="h-4 w-4" />
              Fail Operation
            </Button>
            
            <Button 
              onClick={resetCircuitBreaker} 
              variant="outline" 
              size="sm"
              className="flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Reset
            </Button>
          </div>
          
          {state.isOpen && state.nextAttemptTime && (
            <Alert className="mt-4">
              <Clock className="h-4 w-4" />
              <AlertTitle>Circuit Breaker Open</AlertTitle>
              <AlertDescription>
                Will attempt to close at {state.nextAttemptTime.toLocaleTimeString()}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const RetryMechanismDemo: React.FC = () => {
  const [retryManager] = useState(() => new BatchRetryManager({
    maxRetries: 3,
    retryDelay: 1000,
    retryConfig: {
      exponentialBackoff: true,
      maxBackoffDelay: 8000,
      jitterEnabled: true,
      retryableErrorCodes: ['NETWORK_ERROR', 'TIMEOUT_ERROR', 'SERVER_ERROR'],
    },
  }));
  
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<string>('');

  const simulateRetryOperation = async (successOnAttempt: number = 2) => {
    setIsRunning(true);
    setResult('Starting operation...');
    
    try {
      let attemptCount = 0;
      
      const result = await retryManager.executeWithRetry(
        async () => {
          attemptCount++;
          setResult(`Attempt ${attemptCount}...`);
          
          if (attemptCount < successOnAttempt) {
            throw createNetworkError(`Attempt ${attemptCount} failed`, {
              code: 'DEMO_RETRY_ERROR',
              isTimeout: attemptCount === 1,
              isConnectionLost: attemptCount === 2,
            });
          }
          
          return `Operation succeeded on attempt ${attemptCount}`;
        },
        'demo-retry-operation',
        { operationType: 'demo', attemptLimit: successOnAttempt }
      );
      
      setResult(`✅ ${result}`);
      
    } catch (error) {
      setResult(`❌ ${error instanceof Error ? error.message : 'Operation failed'}`);
      handleGlobalError(error);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Retry Mechanism
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button 
                onClick={() => simulateRetryOperation(2)} 
                disabled={isRunning}
                className="flex items-center gap-2"
              >
                <Zap className="h-4 w-4" />
                Success on 2nd Attempt
              </Button>
              
              <Button 
                onClick={() => simulateRetryOperation(3)} 
                disabled={isRunning}
                className="flex items-center gap-2"
              >
                <Zap className="h-4 w-4" />
                Success on 3rd Attempt
              </Button>
              
              <Button 
                onClick={() => simulateRetryOperation(5)} 
                disabled={isRunning}
                variant="destructive"
                className="flex items-center gap-2"
              >
                <XCircle className="h-4 w-4" />
                Always Fail
              </Button>
            </div>
            
            {result && (
              <Alert>
                <AlertDescription className="font-mono text-sm">
                  {result}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const ErrorMonitoringDemo: React.FC = () => {
  const { metrics, alerts, getHealthStatus } = useErrorMonitoring();
  const { errors, errorRate, isOnline } = useGlobalErrors();
  const { connectionQuality } = useConnectionStatus();
  
  const healthStatus = getHealthStatus();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Error Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{errorRate}/min</div>
            <p className="text-xs text-gray-600">Errors per minute</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total Errors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.errorCount}</div>
            <p className="text-xs text-gray-600">Since session start</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Health Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge 
              className={
                healthStatus.status === 'healthy' ? 'bg-green-100 text-green-800' :
                healthStatus.status === 'degraded' ? 'bg-yellow-100 text-yellow-800' :
                'bg-red-100 text-red-800'
              }
            >
              {healthStatus.status.toUpperCase()}
            </Badge>
            <p className="text-xs text-gray-600 mt-1">
              {healthStatus.issues.length > 0 ? healthStatus.issues[0] : 'All systems operational'}
            </p>
          </CardContent>
        </Card>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Connection Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Badge className={isOnline ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                {isOnline ? 'ONLINE' : 'OFFLINE'}
              </Badge>
              <Badge variant="outline">
                {connectionQuality.toUpperCase()}
              </Badge>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Active Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{alerts.length}</div>
            <p className="text-xs text-gray-600">Unacknowledged alerts</p>
          </CardContent>
        </Card>
      </div>
      
      {errors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Recent Errors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {errors.slice(0, 5).map((error, index) => (
                <div key={index} className="text-xs p-2 bg-gray-50 rounded border">
                  <div className="flex items-center gap-2">
                    <Badge className="text-xs" variant="outline">
                      {error.category}
                    </Badge>
                    <Badge className="text-xs" variant="outline">
                      {error.severity}
                    </Badge>
                    <span className="text-gray-500">
                      {error.context.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="mt-1 text-gray-700">{error.message}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// Component that intentionally throws errors for testing
const BuggyComponent: React.FC<{ shouldThrow: boolean }> = ({ shouldThrow }) => {
  if (shouldThrow) {
    throw new Error('Intentional error for testing error boundary');
  }
  
  return (
    <div className="p-4 bg-green-50 border border-green-200 rounded">
      <p className="text-green-800">✅ Component rendered successfully!</p>
    </div>
  );
};

const ErrorBoundaryDemo: React.FC = () => {
  const [shouldThrow, setShouldThrow] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button 
          onClick={() => setShouldThrow(!shouldThrow)}
          variant={shouldThrow ? "destructive" : "default"}
        >
          {shouldThrow ? 'Fix Component' : 'Break Component'}
        </Button>
      </div>
      
      <ComponentErrorBoundary componentName="Demo Component">
        <BuggyComponent shouldThrow={shouldThrow} />
      </ComponentErrorBoundary>
    </div>
  );
};

// ===== MAIN DEMO COMPONENT =====

const ErrorHandlingDemo: React.FC = () => {
  return (
    <PageErrorBoundary pageName="Error Handling Demo">
      <div className="container mx-auto p-6 space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-2">Error Handling System Demo</h1>
          <p className="text-gray-600">
            Comprehensive demonstration of error handling, monitoring, and recovery mechanisms
          </p>
        </div>
        
        <Tabs defaultValue="error-types" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="error-types">Error Types</TabsTrigger>
            <TabsTrigger value="circuit-breaker">Circuit Breaker</TabsTrigger>
            <TabsTrigger value="retry-mechanism">Retry Logic</TabsTrigger>
            <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
            <TabsTrigger value="error-boundary">Error Boundary</TabsTrigger>
          </TabsList>
          
          <TabsContent value="error-types" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bug className="h-5 w-5" />
                  Error Type Demonstrations
                </CardTitle>
                <CardDescription>
                  Click the buttons below to trigger different types of errors and see how they're handled
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ErrorTypeDemo />
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="circuit-breaker" className="space-y-4">
            <CircuitBreakerDemo />
          </TabsContent>
          
          <TabsContent value="retry-mechanism" className="space-y-4">
            <RetryMechanismDemo />
          </TabsContent>
          
          <TabsContent value="monitoring" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Error Monitoring Dashboard
                </CardTitle>
                <CardDescription>
                  Real-time monitoring of error metrics, health status, and system performance
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ErrorMonitoringDemo />
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="error-boundary" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Error Boundary Testing
                </CardTitle>
                <CardDescription>
                  Test React error boundaries with component that throws errors
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ErrorBoundaryDemo />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </PageErrorBoundary>
  );
};

export default ErrorHandlingDemo;