/**
 * Component Test Helpers
 * Common utilities for React component testing with Jest and React Testing Library
 */

import React from 'react';
import { render, RenderOptions, RenderResult } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';

// Mock data constants
export const mockSessionId = 'session_test_12345_abc';
export const mockBatchId = 'batch_test_67890_def';
export const mockJobId = 'job_123';

export const mockJobDescription = {
  id: mockJobId,
  title: 'Senior Software Engineer',
  description: 'We are looking for a senior software engineer with 5+ years of experience in React, Node.js, and TypeScript.',
  requirements: ['React', 'Node.js', 'TypeScript', 'GraphQL'],
  createdAt: new Date().toISOString(),
};

export const mockAnalysisResults = {
  results: [
    {
      candidateId: '1',
      candidateName: 'John Doe',
      overallMatch: 87,
      confidenceLevel: 'high',
      keySkills: [
        { skill: 'JavaScript', match: 95 },
        { skill: 'React', match: 90 },
        { skill: 'TypeScript', match: 85 },
      ],
      missingSkills: ['Docker', 'Kubernetes'],
      strengths: ['Strong technical skills', 'Good problem-solving abilities'],
      weaknesses: ['Limited DevOps experience'],
      fairnessMetrics: {
        biasConfidenceScore: 92,
        potentialBiasFlags: [],
      },
    },
  ],
  metadata: {
    totalCandidates: 1,
    averageMatch: 87,
    analysisTimestamp: new Date().toISOString(),
  },
};

// Mock functions
export const mockToast = jest.fn();
export const mockFetch = jest.fn();
export const mockLocation = ['/current/path', jest.fn()];

// Mock localStorage
export const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};

// Provider wrapper for testing components that need routing
interface ProvidersWrapperProps {
  children: React.ReactNode;
}

const ProvidersWrapper: React.FC<ProvidersWrapperProps> = ({ children }) => {
  return (
    <BrowserRouter>
      {children}
    </BrowserRouter>
  );
};

// Enhanced render function with providers
export interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  initialEntries?: string[];
}

export function renderWithProviders(
  ui: React.ReactElement,
  options?: CustomRenderOptions
): RenderResult & { user: ReturnType<typeof userEvent.setup> } {
  const user = userEvent.setup();
  
  const result = render(ui, {
    wrapper: ProvidersWrapper,
    ...options,
  });

  return {
    user,
    ...result,
  };
}

// Mock API response utilities
export function mockApiSuccess(data: any, delay = 0) {
  mockFetch.mockImplementationOnce(() =>
    new Promise((resolve) =>
      setTimeout(() =>
        resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data }),
        })
      , delay)
    )
  );
}

export function mockApiError(message: string, code?: string, status = 500) {
  mockFetch.mockImplementationOnce(() =>
    Promise.resolve({
      ok: false,
      status,
      json: () => Promise.resolve({
        status: 'error',
        message,
        code,
      }),
    })
  );
}

export function simulateNetworkError() {
  mockFetch.mockImplementationOnce(() =>
    Promise.reject(new Error('Network error'))
  );
}

// Test setup and cleanup
export function setupTest() {
  // Mock fetch globally
  global.fetch = mockFetch;
  
  // Mock localStorage
  Object.defineProperty(window, 'localStorage', {
    value: mockLocalStorage,
    writable: true,
  });

  // Mock location.pathname and navigation
  delete (window as any).location;
  (window as any).location = { pathname: mockLocation[0] };
  
  // Mock useNavigate
  jest.mock('react-router-dom', () => ({
    ...jest.requireActual('react-router-dom'),
    useNavigate: () => mockLocation[1],
    useLocation: () => ({ pathname: mockLocation[0] }),
    useParams: () => ({ jobId: mockJobId }),
  }));

  // Mock toast notifications
  jest.mock('@/hooks/use-toast', () => ({
    useToast: () => ({ toast: mockToast }),
  }));
}

export function cleanupTest() {
  jest.clearAllMocks();
  mockLocalStorage.getItem.mockClear();
  mockLocalStorage.setItem.mockClear();
  mockLocalStorage.removeItem.mockClear();
  mockLocalStorage.clear.mockClear();
  mockToast.mockClear();
  mockFetch.mockClear();
}

// Accessibility testing utilities
export function testKeyboardNavigation(container: Element, user: ReturnType<typeof userEvent.setup>) {
  const focusableElements = container.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  
  expect(focusableElements.length).toBeGreaterThan(0);
  
  // Test tab navigation
  return user.tab();
}

export function checkAriaAttributes(container: Element) {
  // Check for proper heading structure
  const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
  headings.forEach((heading) => {
    expect(heading).toBeInTheDocument();
  });

  // Check for proper button labels
  const buttons = container.querySelectorAll('button');
  buttons.forEach((button) => {
    const hasLabel = button.textContent || 
                    button.getAttribute('aria-label') || 
                    button.getAttribute('aria-labelledby');
    expect(hasLabel).toBeTruthy();
  });

  // Check for proper form labels
  const inputs = container.querySelectorAll('input');
  inputs.forEach((input) => {
    if (input.type !== 'hidden') {
      const hasLabel = input.getAttribute('aria-label') || 
                      input.getAttribute('aria-labelledby') ||
                      container.querySelector(`label[for="${input.id}"]`);
      expect(hasLabel).toBeTruthy();
    }
  });
}

// Performance testing utilities
export async function measureRenderTime(renderFn: () => RenderResult): Promise<number> {
  const startTime = performance.now();
  renderFn();
  const endTime = performance.now();
  return endTime - startTime;
}

// Mock component props
export const mockComponentProps = {
  className: 'test-component',
  'data-testid': 'test-component',
};

// Common test data generators
export function generateMockCandidate(overrides: Partial<any> = {}) {
  return {
    id: Math.random().toString(36).substr(2, 9),
    name: 'Test Candidate',
    email: 'test@example.com',
    overallMatch: 75,
    confidenceLevel: 'medium',
    skills: ['JavaScript', 'React'],
    ...overrides,
  };
}

export function generateMockJob(overrides: Partial<any> = {}) {
  return {
    id: Math.random().toString(36).substr(2, 9),
    title: 'Test Job',
    description: 'Test job description',
    requirements: ['JavaScript', 'React'],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// Error boundary testing
export function expectNoConsoleErrors() {
  const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  return () => {
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  };
}

// Async testing utilities
export function waitForNextTick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function waitForMockCall(mockFn: jest.Mock, timeout = 5000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (mockFn.mock.calls.length > 0) {
      return mockFn.mock.calls[0];
    }
    await waitForNextTick();
  }
  
  throw new Error(`Mock function was not called within ${timeout}ms`);
}