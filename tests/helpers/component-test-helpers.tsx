/**
 * Component Testing Helpers
 * 
 * Provides utilities and setup for React component testing including:
 * - Test providers and wrappers
 * - Mock services and APIs
 * - Custom render functions
 * - Test utilities and helpers
 * - File upload simulation
 * - User interaction helpers
 */

import React, { ReactElement, PropsWithChildren } from 'react';
import { render, RenderOptions, RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { Router } from 'wouter';
import { jest } from '@jest/globals';
// Mock function types
type MockFunction = ReturnType<typeof jest.fn>;

// Types
import type { SessionId, ResumeId, JobId, ApiResult } from '@shared/api-contracts';

// ===== MOCK SETUP =====

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
});

// Mock sessionStorage
const mockSessionStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn(),
};

Object.defineProperty(window, 'sessionStorage', {
  value: mockSessionStorage,
  writable: true,
});

// Mock fetch for API requests
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

// Mock console methods
const mockConsole = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  group: jest.fn(),
  groupEnd: jest.fn(),
};

// Mock toast notifications
const mockToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: mockToast,
  }),
  toast: mockToast,
}));

// Mock auth service
const mockAuthService = {
  getAuthToken: jest.fn(() => Promise.resolve('mock-auth-token')) as any,
  getCurrentUser: jest.fn(() => Promise.resolve(null)) as any,
  signOut: jest.fn(() => Promise.resolve(undefined)) as any,
};

jest.mock('@/lib/firebase', () => ({
  authService: mockAuthService,
}));

// Mock file utils
jest.mock('@/lib/file-utils', () => ({
  formatFileSize: (size: number) => `${Math.round(size / 1024)}KB`,
  getFileIcon: (type: string) => type.includes('pdf') ? 'fa-file-pdf' : 'fa-file',
  isFileAllowed: (file: File) => ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.type),
  isFileSizeValid: (file: File) => file.size <= 5 * 1024 * 1024, // 5MB
  getInitials: (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase(),
  stringToColor: (str: string) => 'bg-blue-500 text-white',
}));

// Mock useSteps hook
jest.mock('@/hooks/use-steps', () => ({
  useSteps: (steps: string[], initialStep = 0) => ({
    steps: steps.map((title, index) => ({
      id: `step-${index + 1}`,
      title,
      isCompleted: index < initialStep,
      isCurrent: index === initialStep,
    })),
    currentStep: {
      id: `step-${initialStep + 1}`,
      title: steps[initialStep],
      isCompleted: false,
      isCurrent: true,
    },
    currentStepIndex: initialStep,
    isFirstStep: initialStep === 0,
    isLastStep: initialStep === steps.length - 1,
    goToNextStep: jest.fn(),
    goToPreviousStep: jest.fn(),
    goToStep: jest.fn(),
  }),
}));

// Mock auth context
const mockAuthContext = {
  user: null as any,
  isAuthenticated: false,
  loading: false,
  signIn: jest.fn(),
  signOut: jest.fn(),
  signUp: jest.fn(),
};

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => mockAuthContext,
}));

// Mock location hook
const mockLocation = ['/upload', jest.fn()];
jest.mock('wouter', () => ({
  useLocation: () => mockLocation,
  useRoute: (pattern: string) => {
    const path = mockLocation[0] as string;
    const match = path.match(new RegExp(pattern.replace(/:\w+/g, '([^/]+)')));
    if (match) {
      const params: Record<string, string> = {};
      const paramNames = pattern.match(/:(\w+)/g);
      if (paramNames) {
        paramNames.forEach((param, index) => {
          const key = param.slice(1);
          params[key] = match[index + 1];
        });
      }
      return [true, params];
    }
    return [false, {}];
  },
  Link: ({ href, children, className, ...props }: any) => (
    <a href={href} className={className} data-testid="wouter-link" {...props}>
      {children}
    </a>
  ),
  Route: ({ path, component: Component, children, ...props }: any) => {
    if (Component) {
      return <Component {...props} />;
    }
    return typeof children === 'function' ? children(props) : children;
  },
  Router: ({ children }: any) => <div data-testid="wouter-router">{children}</div>,
  Switch: ({ children }: any) => <div data-testid="wouter-switch">{children}</div>,
  Redirect: ({ to, href, ...props }: any) => (
    <div data-testid="wouter-redirect" data-to={to || href} {...props} />
  ),
}));

// ===== TEST DATA =====

export const mockSessionId: SessionId = 'session_test_123' as SessionId;
export const mockBatchId = 'batch_test_456';
export const mockResumeId: ResumeId = 1 as ResumeId;
export const mockJobId: JobId = 1 as JobId;

export const mockTestFiles = {
  validPDF: new File(['test pdf content'], 'test-resume.pdf', {
    type: 'application/pdf',
    lastModified: Date.now(),
  }),
  validDOCX: new File(['test docx content'], 'test-resume.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    lastModified: Date.now(),
  }),
  invalidType: new File(['test image content'], 'test-image.jpg', {
    type: 'image/jpeg',
    lastModified: Date.now(),
  }),
  oversized: new File([new ArrayBuffer(6 * 1024 * 1024)], 'large-file.pdf', {
    type: 'application/pdf',
    lastModified: Date.now(),
  }),
};

export const mockResumeList = {
  resumes: [
    {
      id: 1 as ResumeId,
      filename: 'john_doe_resume.pdf',
      fileSize: 245760,
      fileType: 'application/pdf',
      status: 'processed' as const,
      uploadedAt: new Date().toISOString(),
    },
    {
      id: 2 as ResumeId,
      filename: 'jane_smith_resume.pdf',
      fileSize: 198432,
      fileType: 'application/pdf',
      status: 'processed' as const,
      uploadedAt: new Date().toISOString(),
    },
  ],
  total: 2,
  batchId: mockBatchId,
  sessionId: mockSessionId,
};

export const mockAnalysisResults = {
  analysisId: '1',
  jobId: mockJobId,
  results: [
    {
      resumeId: 1 as ResumeId,
      filename: 'john_doe_resume.pdf',
      candidateName: 'John Doe',
      matchPercentage: 87,
      matchedSkills: [
        { skill: 'JavaScript', matchPercentage: 95 },
        { skill: 'React', matchPercentage: 90 },
        { skill: 'Node.js', matchPercentage: 85 },
      ],
      missingSkills: ['Docker', 'Kubernetes'],
      candidateStrengths: ['Strong technical skills', 'Relevant experience'],
      candidateWeaknesses: ['Limited DevOps experience'],
      recommendations: ['Excellent fit for the role'],
      confidenceLevel: 'high' as const,
      analysisId: '1',
      scoringDimensions: {
        skills: 90,
        experience: 85,
        education: 80,
        semantic: 88,
        cultural: 82,
      },
      fairnessMetrics: {
        biasConfidenceScore: 92,
        fairnessAssessment: 'Fair assessment based on technical qualifications',
        potentialBiasAreas: [],
      },
    },
  ],
  processingTime: 1500,
  metadata: {
    aiProvider: 'anthropic',
    modelVersion: 'claude-3',
    totalCandidates: 2,
    processedCandidates: 2,
    failedCandidates: 0,
  },
};

export const mockJobDescription = {
  id: mockJobId,
  title: 'Senior Full Stack Developer',
  description: 'We are seeking a Senior Full Stack Developer...',
  company: 'TechCorp Inc',
  location: 'San Francisco, CA',
  analyzedData: {
    requiredSkills: ['JavaScript', 'React', 'Node.js'],
    preferredSkills: ['Docker', 'Kubernetes'],
    experienceLevel: 'senior',
    responsibilities: ['Develop applications', 'Lead team'],
    summary: 'Senior full-stack developer position',
  },
  createdAt: new Date().toISOString(),
};

// ===== TEST UTILITIES =====

/**
 * Creates a test QueryClient with disabled retries and cache
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        staleTime: 0,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

/**
 * Test wrapper component providing all necessary providers
 */
interface TestWrapperProps {
  queryClient?: QueryClient;
  initialRoute?: string;
}

export function TestWrapper({ 
  children, 
  queryClient = createTestQueryClient(),
  initialRoute = '/upload'
}: PropsWithChildren<TestWrapperProps>) {
  // Set mock location if different from default
  if (initialRoute !== mockLocation[0]) {
    mockLocation[0] = initialRoute;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        {children}
      </Router>
    </QueryClientProvider>
  );
}

/**
 * Custom render function with providers
 */
interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  queryClient?: QueryClient;
  initialRoute?: string;
}

export function renderWithProviders(
  ui: ReactElement,
  options: CustomRenderOptions = {}
): RenderResult & {
  queryClient: QueryClient;
  user: ReturnType<typeof userEvent.setup>;
} {
  const { queryClient = createTestQueryClient(), initialRoute, ...renderOptions } = options;

  const Wrapper = ({ children }: PropsWithChildren) => (
    <TestWrapper queryClient={queryClient} initialRoute={initialRoute}>
      {children}
    </TestWrapper>
  );

  const user = userEvent.setup();

  return {
    queryClient,
    user,
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
  };
}

// ===== API MOCKING UTILITIES =====

export interface MockApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  code?: string;
  details?: any;
}

/**
 * Sets up mock API response for fetch
 */
export function mockApiResponse<T>(
  response: MockApiResponse<T>,
  status = 200,
  delay = 0
): void {
  const mockResponse = {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(response),
    text: () => Promise.resolve(JSON.stringify(response)),
    headers: new Headers({ 'Content-Type': 'application/json' }),
  };

  if (delay > 0) {
    mockFetch.mockImplementationOnce(
      () => new Promise(resolve => setTimeout(() => resolve(mockResponse), delay))
    );
  } else {
    (mockFetch as any).mockResolvedValueOnce(mockResponse);
  }
}

/**
 * Mocks a successful API response
 */
export function mockApiSuccess<T>(data: T, delay?: number): void {
  mockApiResponse({ success: true, data }, 200, delay);
}

/**
 * Mocks a failed API response
 */
export function mockApiError(message: string, code?: string, status = 400, delay?: number): void {
  mockApiResponse({ success: false, message, code }, status, delay);
}

/**
 * Mocks localStorage with initial data
 */
export function mockLocalStorageData(data: Record<string, string>): void {
  (mockLocalStorage.getItem as any).mockImplementation((key: string) => data[key] || null);
}

/**
 * Clears all localStorage mock data
 */
export function clearMockLocalStorage(): void {
  mockLocalStorage.getItem.mockReturnValue(null);
  mockLocalStorage.setItem.mockClear();
  mockLocalStorage.removeItem.mockClear();
  mockLocalStorage.clear.mockClear();
}

// ===== FILE UPLOAD UTILITIES =====

/**
 * Simulates drag and drop file upload
 */
export async function simulateDragAndDrop(
  dropzone: HTMLElement,
  files: File[],
  user: ReturnType<typeof userEvent.setup>
): Promise<void> {
  const dataTransfer = new DataTransfer();
  files.forEach(file => dataTransfer.items.add(file));

  await user.pointer([
    { target: dropzone },
    { keys: '[MouseLeft>]', target: dropzone },
  ]);

  // Simulate dragenter
  dropzone.dispatchEvent(
    new DragEvent('dragenter', {
      bubbles: true,
      dataTransfer,
    })
  );

  // Simulate dragover
  dropzone.dispatchEvent(
    new DragEvent('dragover', {
      bubbles: true,
      dataTransfer,
    })
  );

  // Simulate drop
  dropzone.dispatchEvent(
    new DragEvent('drop', {
      bubbles: true,
      dataTransfer,
    })
  );

  await user.pointer({ keys: '[/MouseLeft]' });
}

/**
 * Simulates file input selection
 */
export async function simulateFileSelection(
  fileInput: HTMLInputElement,
  files: File[],
  user: ReturnType<typeof userEvent.setup>
): Promise<void> {
  const dataTransfer = new DataTransfer();
  files.forEach(file => dataTransfer.items.add(file));

  Object.defineProperty(fileInput, 'files', {
    value: dataTransfer.files,
    writable: false,
  });

  await user.upload(fileInput, files);
}

// ===== ACCESSIBILITY TESTING UTILITIES =====

/**
 * Tests keyboard navigation for interactive elements
 */
export async function testKeyboardNavigation(
  container: HTMLElement,
  user: ReturnType<typeof userEvent.setup>
): Promise<void> {
  const focusableElements = container.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );

  // Test Tab navigation
  for (let i = 0; i < focusableElements.length; i++) {
    await user.tab();
    if (document.activeElement !== focusableElements[i]) {
      throw new Error(`Tab navigation failed at element ${i}`);
    }
  }

  // Test Shift+Tab navigation
  for (let i = focusableElements.length - 1; i >= 0; i--) {
    await user.tab({ shift: true });
    if (document.activeElement !== focusableElements[i]) {
      throw new Error(`Shift+Tab navigation failed at element ${i}`);
    }
  }
}

/**
 * Checks for required ARIA attributes
 */
export function checkAriaAttributes(element: HTMLElement): void {
  // Check for aria-label or aria-labelledby on interactive elements
  const interactiveElements = element.querySelectorAll(
    'button, [role="button"], input, select, textarea'
  );

  interactiveElements.forEach(el => {
    const hasLabel = el.hasAttribute('aria-label') || 
                    el.hasAttribute('aria-labelledby') ||
                    el.querySelector('label');
    
    if (!hasLabel) {
      console.warn('Interactive element missing accessible label:', el);
    }
  });
}

// ===== ERROR SIMULATION UTILITIES =====

/**
 * Simulates network error
 */
export function simulateNetworkError(delay = 0): void {
  const error = new Error('Network error');
  if (delay > 0) {
    mockFetch.mockImplementationOnce(
      () => new Promise((_, reject) => setTimeout(() => reject(error), delay))
    );
  } else {
    (mockFetch as any).mockRejectedValueOnce(error);
  }
}

/**
 * Simulates timeout error
 */
export function simulateTimeoutError(delay = 5000): void {
  mockFetch.mockImplementationOnce(
    () => new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Request timeout')), delay)
    )
  );
}

/**
 * Simulates authentication error
 */
export function simulateAuthError(): void {
  mockApiError('Authentication required', 'AUTH_REQUIRED', 401);
}

// ===== CLEANUP UTILITIES =====

/**
 * Resets all mocks to their default state
 */
export function resetAllMocks(): void {
  jest.clearAllMocks();
  mockFetch.mockClear();
  clearMockLocalStorage();
  mockSessionStorage.getItem.mockReturnValue(null);
  
  // Reset console mocks
  mockConsole.log.mockClear();
  mockConsole.error.mockClear();
  mockConsole.warn.mockClear();
  
  // Reset toast mock
  mockToast.mockClear();
  
  // Reset auth mock
  (mockAuthService.getAuthToken as any).mockResolvedValue('mock-auth-token');
  (mockAuthService.getCurrentUser as any).mockResolvedValue(null);
  
  // Reset location mock
  mockLocation[0] = '/upload';
  mockLocation[1] = jest.fn();
}

/**
 * Setup function to be called before each test
 */
export function setupTest(): void {
  resetAllMocks();
  
  // Setup default localStorage behavior
  mockLocalStorageData({
    currentUploadSession: mockSessionId,
    currentBatchId: mockBatchId,
  });
}

/**
 * Cleanup function to be called after each test
 */
export function cleanupTest(): void {
  resetAllMocks();
}

// ===== EXPORT MOCKS FOR EXTERNAL USE =====

export {
  mockLocalStorage,
  mockSessionStorage,
  mockFetch,
  mockConsole,
  mockToast,
  mockAuthService,
  mockLocation,
  mockAuthContext,
};

// Default export for convenience
export default {
  renderWithProviders,
  TestWrapper,
  createTestQueryClient,
  mockApiSuccess,
  mockApiError,
  simulateDragAndDrop,
  simulateFileSelection,
  simulateNetworkError,
  testKeyboardNavigation,
  checkAriaAttributes,
  setupTest,
  cleanupTest,
  resetAllMocks,
  mockTestFiles,
  mockResumeList,
  mockAnalysisResults,
  mockJobDescription,
};