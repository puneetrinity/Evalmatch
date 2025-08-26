/**
 * Unified Error Display Component
 * Provides consistent error messaging across all pages
 */

import React from 'react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useLocation } from 'wouter';
import { theme } from '@/styles/design-system';

export interface UnifiedErrorProps {
  error: Error | string | unknown;
  title?: string;
  showRetry?: boolean;
  onRetry?: () => void;
  showHomeButton?: boolean;
  suggestions?: string[];
  variant?: 'destructive' | 'warning' | 'info';
}

// Common error messages mapped to user-friendly text
const ERROR_MESSAGES: Record<string, { title: string; message: string; suggestions: string[] }> = {
  // Authentication Errors
  'auth/invalid-email': {
    title: 'Invalid Email',
    message: 'Please enter a valid email address.',
    suggestions: ['Check for typos in your email', 'Ensure the email format is correct (e.g., user@example.com)'],
  },
  'auth/user-not-found': {
    title: 'Account Not Found',
    message: 'No account exists with this email address.',
    suggestions: ['Check if you entered the correct email', 'Create a new account if you don\'t have one'],
  },
  'auth/wrong-password': {
    title: 'Incorrect Password',
    message: 'The password you entered is incorrect.',
    suggestions: ['Check your password for typos', 'Use the "Forgot Password" option to reset it'],
  },
  'auth/email-already-in-use': {
    title: 'Email Already Registered',
    message: 'An account already exists with this email.',
    suggestions: ['Sign in instead of creating a new account', 'Use a different email address'],
  },
  'auth/weak-password': {
    title: 'Weak Password',
    message: 'Your password should be at least 6 characters long.',
    suggestions: ['Use a combination of letters, numbers, and symbols', 'Make your password at least 8 characters long'],
  },
  'auth/network-request-failed': {
    title: 'Network Connection Error',
    message: 'Unable to connect to our servers.',
    suggestions: ['Check your internet connection', 'Try again in a few moments', 'Disable any VPN or proxy'],
  },
  
  // File Upload Errors
  'file/invalid-type': {
    title: 'Invalid File Type',
    message: 'Please upload only PDF or DOCX files.',
    suggestions: ['Convert your file to PDF format', 'Ensure the file extension is .pdf or .docx'],
  },
  'file/too-large': {
    title: 'File Too Large',
    message: 'File size must be under 10MB.',
    suggestions: ['Compress your PDF to reduce file size', 'Remove unnecessary images or pages', 'Split large documents'],
  },
  'file/upload-failed': {
    title: 'Upload Failed',
    message: 'We couldn\'t upload your file.',
    suggestions: ['Check your internet connection', 'Try uploading again', 'Ensure the file isn\'t corrupted'],
  },
  'file/parse-failed': {
    title: 'Document Processing Error',
    message: 'We couldn\'t extract text from your document.',
    suggestions: ['Ensure the PDF isn\'t password protected', 'Try a different file format', 'Make sure the document contains text (not just images)'],
  },
  
  // API/Server Errors
  'server/unavailable': {
    title: 'Service Temporarily Unavailable',
    message: 'Our servers are experiencing high load.',
    suggestions: ['Wait a few minutes and try again', 'Refresh the page', 'Check our status page for updates'],
  },
  'server/timeout': {
    title: 'Request Timeout',
    message: 'The operation took too long to complete.',
    suggestions: ['Try again with a smaller file', 'Check your internet speed', 'Wait a moment and retry'],
  },
  'api/rate-limit': {
    title: 'Too Many Requests',
    message: 'You\'ve made too many requests. Please slow down.',
    suggestions: ['Wait a few minutes before trying again', 'Reduce the frequency of your actions'],
  },
  
  // Analysis Errors
  'analysis/no-job': {
    title: 'Job Description Not Found',
    message: 'The job description you\'re looking for doesn\'t exist.',
    suggestions: ['Create a new job description', 'Check if the link is correct'],
  },
  'analysis/no-resumes': {
    title: 'No Resumes Found',
    message: 'Please upload resumes before running analysis.',
    suggestions: ['Go to the upload page to add resumes', 'Ensure your uploads were successful'],
  },
  'analysis/failed': {
    title: 'Analysis Failed',
    message: 'We couldn\'t analyze the documents.',
    suggestions: ['Check that both resume and job description are valid', 'Try uploading the files again', 'Contact support if the issue persists'],
  },
  
  // Generic Errors
  'unknown': {
    title: 'Something Went Wrong',
    message: 'An unexpected error occurred.',
    suggestions: ['Refresh the page', 'Try again later', 'Contact support if the problem persists'],
  },
};

// Extract error code from various error formats
function getErrorCode(error: Error | string | unknown): string {
  if (typeof error === 'string') {
    return error;
  }
  
  if (error instanceof Error) {
    // Check for Firebase error codes
    if ('code' in error && typeof (error as any).code === 'string') {
      return (error as any).code;
    }
    
    // Check for custom error codes in message
    const codeMatch = error.message.match(/\[(\w+\/[\w-]+)\]/);
    if (codeMatch) {
      return codeMatch[1];
    }
    
    // Check for HTTP status codes
    if (error.message.includes('404')) return 'server/not-found';
    if (error.message.includes('500')) return 'server/unavailable';
    if (error.message.includes('timeout')) return 'server/timeout';
    if (error.message.includes('rate limit')) return 'api/rate-limit';
    
    return error.message;
  }
  
  return 'unknown';
}

export function UnifiedErrorDisplay({
  error,
  title,
  showRetry = true,
  onRetry,
  showHomeButton = false,
  suggestions: customSuggestions,
  variant = 'destructive',
}: UnifiedErrorProps) {
  const [, setLocation] = useLocation();
  const errorCode = getErrorCode(error);
  const errorInfo = ERROR_MESSAGES[errorCode] || ERROR_MESSAGES.unknown;
  
  const displayTitle = title || errorInfo.title;
  const displayMessage = typeof error === 'string' && !ERROR_MESSAGES[error] 
    ? error 
    : error instanceof Error && !ERROR_MESSAGES[errorCode]
    ? error.message
    : errorInfo.message;
  
  const displaySuggestions = customSuggestions || errorInfo.suggestions;
  
  // Map our variant types to Alert component's supported variants
  const alertVariant = variant === 'destructive' ? 'destructive' : 'default';
  
  return (
    <Alert variant={alertVariant} className="my-4">
      <AlertTitle className="text-lg font-semibold flex items-center gap-2">
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {displayTitle}
      </AlertTitle>
      <AlertDescription className="mt-2">
        <p className="text-sm">{displayMessage}</p>
        
        {displaySuggestions.length > 0 && (
          <div className="mt-3">
            <p className="text-sm font-medium mb-1">What you can try:</p>
            <ul className="list-disc list-inside space-y-1">
              {displaySuggestions.map((suggestion, index) => (
                <li key={index} className="text-sm text-muted-foreground">
                  {suggestion}
                </li>
              ))}
            </ul>
          </div>
        )}
        
        <div className="mt-4 flex gap-2">
          {showRetry && onRetry && (
            <Button onClick={onRetry} size="sm" variant="outline">
              Try Again
            </Button>
          )}
          {showHomeButton && (
            <Button onClick={() => setLocation('/')} size="sm" variant="outline">
              Go to Home
            </Button>
          )}
        </div>
        
        {process.env.NODE_ENV === 'development' && (
          <details className="mt-4">
            <summary className="text-xs text-muted-foreground cursor-pointer">
              Technical Details (Development Only)
            </summary>
            <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-auto">
              {JSON.stringify(error, null, 2)}
            </pre>
          </details>
        )}
      </AlertDescription>
    </Alert>
  );
}

// Hook for consistent error handling
export function useErrorHandler() {
  const [error, setError] = React.useState<Error | null>(null);
  
  const handleError = React.useCallback((error: Error | unknown) => {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error caught by handler:', error);
    }
    
    if (error instanceof Error) {
      setError(error);
    } else if (typeof error === 'string') {
      setError(new Error(error));
    } else {
      setError(new Error('An unexpected error occurred'));
    }
  }, []);
  
  const clearError = React.useCallback(() => {
    setError(null);
  }, []);
  
  return { error, handleError, clearError };
}

// Wrapper component for consistent error boundaries
export function ErrorBoundaryWrapper({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      {children}
    </ErrorBoundary>
  );
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error boundary caught:', error, errorInfo);
    }
  }
  
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="max-w-md w-full">
            <UnifiedErrorDisplay
              error={this.state.error}
              title="Application Error"
              showRetry={true}
              onRetry={() => window.location.reload()}
              showHomeButton={true}
            />
          </div>
        </div>
      );
    }
    
    return this.props.children;
  }
}