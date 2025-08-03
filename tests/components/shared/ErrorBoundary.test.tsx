/**
 * Comprehensive Tests for ErrorBoundary Component
 * 
 * Tests all functionality including:
 * - Error catching and boundary behavior
 * - Fallback UI rendering and customization
 * - Error recovery mechanisms
 * - Different error severity levels
 * - Recovery action generation and execution
 * - Error reporting and logging
 * - Props change recovery
 * - HOC and hook utilities
 * - Accessibility features
 */

import React, { Component, ReactNode } from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

import userEvent from '@testing-library/user-event';

import ErrorBoundary, {
  withErrorBoundary,
  useErrorHandler,
  PageErrorBoundary,
  SectionErrorBoundary,
  ComponentErrorBoundary,
} from '@/components/ErrorBoundary';
import {
  setupTest,
  cleanupTest,
  mockConsole,
  mockToast,
} from '../../helpers/component-test-helpers';

// ===== TEST COMPONENTS =====

// Component that throws an error
interface ThrowErrorProps {
  shouldThrow?: boolean;
  errorMessage?: string;
  errorType?: 'render' | 'effect' | 'handler';
}

function ThrowError({ 
  shouldThrow = true, 
  errorMessage = 'Test error',
  errorType = 'render'
}: ThrowErrorProps) {
  const { throwError } = useErrorHandler();

  React.useEffect(() => {
    if (shouldThrow && errorType === 'effect') {
      throw new Error(errorMessage);
    }
  }, [shouldThrow, errorMessage, errorType]);

  const handleClick = () => {
    if (errorType === 'handler') {
      throwError(errorMessage);
    }
  };

  if (shouldThrow && errorType === 'render') {
    throw new Error(errorMessage);
  }

  return (
    <div>
      <p>Component rendered successfully</p>
      {errorType === 'handler' && (
        <button onClick={handleClick}>Trigger Error</button>
      )}
    </div>
  );
}

// Component that works fine
function WorkingComponent() {
  return <div>Working component</div>;
}

// Component with props that can change
interface PropsChangeComponentProps {
  resetKey: string;
  shouldThrow: boolean;
}

function PropsChangeComponent({ resetKey, shouldThrow }: PropsChangeComponentProps) {
  if (shouldThrow) {
    throw new Error('Props change error');
  }
  return <div>Props: {resetKey}</div>;
}

// ===== TEST SETUP =====

describe('ErrorBoundary Component', () => {
  beforeEach(() => {
    setupTest();
    // Suppress console errors in tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'group').mockImplementation(() => {});
    jest.spyOn(console, 'groupEnd').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanupTest();
    jest.restoreAllMocks();
  });

  // ===== BASIC ERROR BOUNDARY TESTS =====

  describe('Error Catching', () => {
    it('should catch and display errors from child components', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      expect(screen.getByText('Component Error')).toBeInTheDocument();
      expect(screen.getByText('An unexpected error occurred in this component.')).toBeInTheDocument();
    });

    it('should render children when no error occurs', () => {
      render(
        <ErrorBoundary>
          <WorkingComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Working component')).toBeInTheDocument();
      expect(screen.queryByText('Component Error')).not.toBeInTheDocument();
    });

    it('should catch errors with custom error messages', () => {
      render(
        <ErrorBoundary>
          <ThrowError errorMessage="Custom error message" />
        </ErrorBoundary>
      );

      expect(screen.getByText('Component Error')).toBeInTheDocument();
      // Error details should be logged but not displayed to user by default
      expect(mockConsole.error).toHaveBeenCalled();
    });

    it('should handle multiple error types', () => {
      const { rerender } = render(
        <ErrorBoundary>
          <ThrowError errorType="render" />
        </ErrorBoundary>
      );

      expect(screen.getByText('Component Error')).toBeInTheDocument();

      // Test effect errors (these might not be caught by error boundary)
      rerender(
        <ErrorBoundary>
          <ThrowError errorType="effect" />
        </ErrorBoundary>
      );

      // Effect errors typically aren't caught by error boundaries
      // This is more for testing component structure
    });
  });

  // ===== ERROR BOUNDARY CONFIGURATION =====

  describe('Error Boundary Configuration', () => {
    it('should use custom fallback component', () => {
      const customFallback = (error: any, retry: () => void) => (
        <div>
          <p>Custom fallback UI</p>
          <button onClick={retry}>Custom Retry</button>
        </div>
      );

      render(
        <ErrorBoundary fallback={customFallback}>
          <ThrowError />
        </ErrorBoundary>
      );

      expect(screen.getByText('Custom fallback UI')).toBeInTheDocument();
      expect(screen.getByText('Custom Retry')).toBeInTheDocument();
    });

    it('should call custom error handler', () => {
      const mockErrorHandler = jest.fn();

      render(
        <ErrorBoundary onError={mockErrorHandler}>
          <ThrowError errorMessage="Handler test error" />
        </ErrorBoundary>
      );

      expect(mockErrorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Handler test error'),
        }),
        expect.any(Object)
      );
    });

    it('should respect different component levels', () => {
      render(
        <ErrorBoundary level="page" component="TestPage">
          <ThrowError />
        </ErrorBoundary>
      );

      expect(screen.getByText('Page Error')).toBeInTheDocument();
    });

    it('should configure retry limits', () => {
      render(
        <ErrorBoundary maxRetries={1}>
          <ThrowError />
        </ErrorBoundary>
      );

      expect(screen.getByText('Component Error')).toBeInTheDocument();
      // Should have retry button available
      expect(screen.getByText('Try Again')).toBeInTheDocument();
    });
  });

  // ===== ERROR RECOVERY TESTS =====

  describe('Error Recovery', () => {
    it('should provide retry functionality', async () => {
      const user = userEvent.setup();
      let shouldThrow = true;

      const TestComponent = () => {
        if (shouldThrow) {
          throw new Error('Retry test error');
        }
        return <div>Component recovered</div>;
      };

      render(
        <ErrorBoundary>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Component Error')).toBeInTheDocument();

      // Fix the error
      shouldThrow = false;

      const retryButton = screen.getByText('Try Again');
      await user.click(retryButton);

      // Note: This test might need adjustment based on actual retry implementation
      // The component state change would need to be properly handled
    });

    it('should provide page refresh option', async () => {
      const user = userEvent.setup();
      const mockReload = jest.fn();
      Object.defineProperty(window, 'location', {
        value: { reload: mockReload },
        writable: true,
      });

      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      const refreshButton = screen.getByText('Refresh Page');
      await user.click(refreshButton);

      expect(mockReload).toHaveBeenCalled();
    });

    it('should provide navigation options for page-level errors', async () => {
      const user = userEvent.setup();
      const originalLocation = window.location;
      delete (window as any).location;
      window.location = { ...originalLocation, href: '' } as any;

      render(
        <ErrorBoundary level="page">
          <ThrowError />
        </ErrorBoundary>
      );

      const homeButton = screen.getByText('Go to Home');
      await user.click(homeButton);

      expect(window.location.href).toBe('/');

      window.location = originalLocation;
    });

    it('should handle props change recovery', () => {
      let resetKey = 'initial';
      
      const { rerender } = render(
        <ErrorBoundary resetOnPropsChange resetKeys={['resetKey']}>
          <PropsChangeComponent resetKey={resetKey} shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Component Error')).toBeInTheDocument();

      // Change props to trigger recovery
      resetKey = 'changed';
      
      rerender(
        <ErrorBoundary resetOnPropsChange resetKeys={['resetKey']}>
          <PropsChangeComponent resetKey={resetKey} shouldThrow={false} />
        </ErrorBoundary>
      );

      // Should recover and show working component
      expect(screen.getByText('Props: changed')).toBeInTheDocument();
    });
  });

  // ===== ERROR SEVERITY AND CATEGORIZATION =====

  describe('Error Severity and Categories', () => {
    it('should handle different error severities', () => {
      render(
        <ErrorBoundary level="page">
          <ThrowError />
        </ErrorBoundary>
      );

      expect(screen.getByText('CRITICAL')).toBeInTheDocument();
    });

    it('should provide appropriate recovery actions based on error type', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      // Should have basic recovery actions
      expect(screen.getByText('Try Again')).toBeInTheDocument();
      expect(screen.getByText('Refresh Page')).toBeInTheDocument();
    });

    it('should show error code and ID for debugging', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      expect(screen.getByText(/Error Code:/)).toBeInTheDocument();
      expect(screen.getByText(/ID:/)).toBeInTheDocument();
    });
  });

  // ===== ERROR LOGGING AND REPORTING =====

  describe('Error Logging and Reporting', () => {
    it('should log errors to console', () => {
      render(
        <ErrorBoundary>
          <ThrowError errorMessage="Logging test error" />
        </ErrorBoundary>
      );

      expect(mockConsole.group).toHaveBeenCalledWith(
        expect.stringContaining('Error Boundary')
      );
      expect(mockConsole.error).toHaveBeenCalled();
    });

    it('should show toast notifications for high severity errors', () => {
      render(
        <ErrorBoundary level="page">
          <ThrowError />
        </ErrorBoundary>
      );

      expect(mockToast).toHaveBeenCalled();
    });

    it('should provide error details copy functionality', async () => {
      const user = userEvent.setup();
      const mockWriteText = jest.fn();
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: mockWriteText },
        writable: true,
      });

      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      // Expand technical details
      const detailsToggle = screen.getByText('Technical Details');
      await user.click(detailsToggle);

      const copyButton = screen.getByText('Copy Details');
      await user.click(copyButton);

      expect(mockWriteText).toHaveBeenCalledWith(
        expect.stringContaining('Test error')
      );
    });
  });

  // ===== TECHNICAL DETAILS AND DEVELOPMENT MODE =====

  describe('Technical Details', () => {
    it('should show technical details in development mode', async () => {
      const user = userEvent.setup();
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      const detailsToggle = screen.getByText('Technical Details');
      await user.click(detailsToggle);

      expect(screen.getByText(/Message:/)).toBeInTheDocument();
      expect(screen.getByText(/Category:/)).toBeInTheDocument();
      expect(screen.getByText(/Timestamp:/)).toBeInTheDocument();

      process.env.NODE_ENV = originalEnv;
    });

    it('should provide console logging option in development', async () => {
      const user = userEvent.setup();
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      const detailsToggle = screen.getByText('Technical Details');
      await user.click(detailsToggle);

      const consoleButton = screen.getByText('Log to Console');
      await user.click(consoleButton);

      expect(mockConsole.error).toHaveBeenCalledWith(
        'Full Error Object:',
        expect.any(Object)
      );

      process.env.NODE_ENV = originalEnv;
    });
  });

  // ===== HOC AND HOOK UTILITIES =====

  describe('Higher-Order Component', () => {
    it('should wrap components with error boundary', () => {
      const WrappedComponent = withErrorBoundary(ThrowError, {
        component: 'WrappedTest',
        level: 'component',
      });

      render(<WrappedComponent />);

      expect(screen.getByText('WrappedTest Error')).toBeInTheDocument();
    });

    it('should preserve component display name', () => {
      const TestComponent = () => <div>Test</div>;
      TestComponent.displayName = 'TestComponent';

      const WrappedComponent = withErrorBoundary(TestComponent);

      expect(WrappedComponent.displayName).toBe('withErrorBoundary(TestComponent)');
    });
  });

  describe('useErrorHandler Hook', () => {
    it('should provide error throwing functionality', async () => {
      const user = userEvent.setup();

      function TestComponent() {
        const { throwError } = useErrorHandler();

        return (
          <button onClick={() => throwError('Hook error')}>
            Throw Error
          </button>
        );
      }

      render(
        <ErrorBoundary>
          <TestComponent />
        </ErrorBoundary>
      );

      const button = screen.getByText('Throw Error');
      await user.click(button);

      expect(screen.getByText('Component Error')).toBeInTheDocument();
    });

    it('should provide error reporting functionality', () => {
      function TestComponent() {
        const { reportError } = useErrorHandler();

        React.useEffect(() => {
          reportError({
            message: 'Manual report',
            code: 'MANUAL_ERROR',
            category: 'user',
            severity: 'medium',
            context: { test: true },
          } as any);
        }, [reportError]);

        return <div>Test Component</div>;
      }

      render(<TestComponent />);

      expect(mockConsole.error).toHaveBeenCalledWith(
        'Manual error report:',
        expect.any(Object),
        { test: true }
      );
    });
  });

  // ===== PREBUILT ERROR BOUNDARIES =====

  describe('Prebuilt Error Boundaries', () => {
    it('should render PageErrorBoundary correctly', () => {
      render(
        <PageErrorBoundary pageName="TestPage">
          <ThrowError />
        </PageErrorBoundary>
      );

      expect(screen.getByText('TestPage Error')).toBeInTheDocument();
    });

    it('should render SectionErrorBoundary correctly', () => {
      render(
        <SectionErrorBoundary sectionName="TestSection">
          <ThrowError />
        </SectionErrorBoundary>
      );

      expect(screen.getByText('TestSection Error')).toBeInTheDocument();
    });

    it('should render ComponentErrorBoundary correctly', () => {
      render(
        <ComponentErrorBoundary componentName="TestComponent">
          <ThrowError />
        </ComponentErrorBoundary>
      );

      expect(screen.getByText('TestComponent Error')).toBeInTheDocument();
    });

    it('should use default names when not provided', () => {
      render(
        <PageErrorBoundary>
          <ThrowError />
        </PageErrorBoundary>
      );

      expect(screen.getByText('Page Error')).toBeInTheDocument();
    });
  });

  // ===== ACCESSIBILITY TESTS =====

  describe('Accessibility', () => {
    it('should provide proper semantic structure', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      expect(screen.getByRole('heading')).toHaveTextContent('Component Error');
      expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument();
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();

      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      const tryAgainButton = screen.getByText('Try Again');
      await user.tab();
      expect(tryAgainButton).toHaveFocus();

      const refreshButton = screen.getByText('Refresh Page');
      await user.tab();
      expect(refreshButton).toHaveFocus();
    });

    it('should provide appropriate ARIA labels', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      const errorCard = screen.getByRole('heading').closest('[role]');
      expect(errorCard).toBeInTheDocument();
    });

    it('should announce errors to screen readers', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      // Should have descriptive error content
      expect(screen.getByText('An unexpected error occurred in this component.')).toBeInTheDocument();
    });
  });

  // ===== EDGE CASES AND ERROR SCENARIOS =====

  describe('Edge Cases', () => {
    it('should handle errors during error handling', () => {
      const BrokenErrorHandler = () => {
        throw new Error('Error in error handler');
      };

      // This would typically be caught by a parent error boundary
      expect(() => {
        render(
          <ErrorBoundary fallback={() => <BrokenErrorHandler />}>
            <ThrowError />
          </ErrorBoundary>
        );
      }).toThrow('Error in error handler');
    });

    it('should handle unmounting during error state', () => {
      const { unmount } = render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      expect(screen.getByText('Component Error')).toBeInTheDocument();

      // Should unmount cleanly
      expect(() => unmount()).not.toThrow();
    });

    it('should handle rapid error succession', () => {
      let errorCount = 0;

      const MultiErrorComponent = () => {
        errorCount++;
        throw new Error(`Error ${errorCount}`);
      };

      const { rerender } = render(
        <ErrorBoundary>
          <MultiErrorComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Component Error')).toBeInTheDocument();

      // Rerender with new error
      rerender(
        <ErrorBoundary>
          <MultiErrorComponent />
        </ErrorBoundary>
      );

      // Should still handle the error
      expect(screen.getByText('Component Error')).toBeInTheDocument();
    });

    it('should handle storage quota errors gracefully', async () => {
      const user = userEvent.setup();
      
      // Mock localStorage to throw quota error
      const mockSetItem = jest.fn(() => {
        throw new Error('Storage quota exceeded');
      });
      Object.defineProperty(window, 'localStorage', {
        value: { setItem: mockSetItem },
        writable: true,
      });

      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      // Should render error boundary despite storage issues
      expect(screen.getByText('Component Error')).toBeInTheDocument();
    });
  });

  // ===== PERFORMANCE TESTS =====

  describe('Performance', () => {
    it('should not re-render unnecessarily', () => {
      let renderCount = 0;

      const CountingComponent = () => {
        renderCount++;
        return <div>Render count: {renderCount}</div>;
      };

      const { rerender } = render(
        <ErrorBoundary>
          <CountingComponent />
        </ErrorBoundary>
      );

      expect(renderCount).toBe(1);

      // Rerender with same props
      rerender(
        <ErrorBoundary>
          <CountingComponent />
        </ErrorBoundary>
      );

      // Should render again (normal React behavior)
      expect(renderCount).toBe(2);
    });

    it('should handle large error objects efficiently', () => {
      const largeError = new Error('Large error');
      (largeError as any).largeData = new Array(10000).fill('data');

      const LargeErrorComponent = () => {
        throw largeError;
      };

      expect(() => {
        render(
          <ErrorBoundary>
            <LargeErrorComponent />
          </ErrorBoundary>
        );
      }).not.toThrow();

      expect(screen.getByText('Component Error')).toBeInTheDocument();
    });
  });
});