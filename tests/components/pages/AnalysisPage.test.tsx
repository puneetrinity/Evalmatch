/**
 * Comprehensive Tests for AnalysisPage Component
 * 
 * Tests all functionality including:
 * - Component rendering and initialization
 * - Auto-analysis triggering logic
 * - Analysis result display and formatting
 * - Skill visualization (radar charts)
 * - User interactions (expand/collapse, navigation)
 * - Error handling and retry mechanisms
 * - Fairness metrics display
 * - Loading states and empty states
 * - Accessibility features
 */

import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import React from 'react';
import { within } from '@testing-library/react';
import { screen, waitFor } from '@testing-library/dom';

import AnalysisPage from '@/pages/analysis';
import {
  renderWithProviders,
  mockApiSuccess,
  mockApiError,
  simulateNetworkError,
  testKeyboardNavigation,
  checkAriaAttributes,
  setupTest,
  cleanupTest,
  mockAnalysisResults,
  mockJobDescription,
  mockSessionId,
  mockBatchId,
  mockJobId,
  mockLocalStorage,
  mockToast,
  mockFetch,
  mockLocation,
} from '../../helpers/component-test-helpers';

// ===== TEST SETUP =====

describe('AnalysisPage Component', () => {
  beforeEach(() => {
    setupTest();
    
    // Set up default route params
    mockLocation[0] = `/analysis/${mockJobId}`;
    
    // Mock localStorage with session data
    mockLocalStorage.getItem.mockImplementation((key: unknown) => {
      const keyStr = key as string;
      if (keyStr === 'currentUploadSession') return mockSessionId;
      if (keyStr === 'currentBatchId') return mockBatchId;
      return null;
    });
  });

  afterEach(() => {
    cleanupTest();
  });

  // ===== RENDERING TESTS =====

  describe('Component Rendering', () => {
    it('should render analysis page with essential elements', async () => {
      // Mock job details
      mockApiSuccess({ jobDescription: mockJobDescription });
      // Mock empty analysis initially
      mockApiSuccess({ results: [], metadata: {} });

      renderWithProviders(<AnalysisPage />);

      expect(screen.getByRole('main')).toBeInTheDocument();
      expect(screen.getByText('Candidate Fit Analysis')).toBeInTheDocument();
      expect(screen.getByText(/We've analyzed your job description/)).toBeInTheDocument();
    });

    it('should render step progress component', async () => {
      mockApiSuccess({ jobDescription: mockJobDescription });
      mockApiSuccess({ results: [], metadata: {} });

      renderWithProviders(<AnalysisPage />);

      await waitFor(() => {
        expect(screen.getByText('Fit Analysis')).toBeInTheDocument();
      });
    });

    it('should display job description information', async () => {
      mockApiSuccess({ jobDescription: mockJobDescription });
      mockApiSuccess({ results: [], metadata: {} });

      renderWithProviders(<AnalysisPage />);

      await waitFor(() => {
        expect(screen.getByText(mockJobDescription.title)).toBeInTheDocument();
        expect(screen.getByText('Analysis of candidate resumes against this job description')).toBeInTheDocument();
      });
    });

    it('should show batch information when available', async () => {
      mockApiSuccess({ jobDescription: mockJobDescription });
      mockApiSuccess({ results: [], metadata: {} });

      renderWithProviders(<AnalysisPage />);

      await waitFor(() => {
        expect(screen.getByText(/Analyzing Batch:/)).toBeInTheDocument();
        expect(screen.getByText(new RegExp(mockBatchId.slice(-8)))).toBeInTheDocument();
      });
    });

    it('should handle invalid job ID', () => {
      mockLocation[0] = '/analysis/invalid';

      renderWithProviders(<AnalysisPage />);

      expect(screen.getByText('Invalid Job ID')).toBeInTheDocument();
      expect(screen.getByText('No job description ID was provided.')).toBeInTheDocument();
    });

    it('should handle missing job description', async () => {
      mockApiError('Job not found', 'NOT_FOUND', 404);

      renderWithProviders(<AnalysisPage />);

      await waitFor(() => {
        expect(screen.getByText('Job Description Not Found')).toBeInTheDocument();
      });
    });
  });

  // ===== AUTO-ANALYSIS TESTS =====

  describe('Auto-Analysis Logic', () => {
    it('should automatically trigger analysis when conditions are met', async () => {
      // Mock job details
      mockApiSuccess({ jobDescription: mockJobDescription });
      
      // Mock initial empty analysis
      mockApiSuccess({ results: [], metadata: {} });
      
      // Mock successful analysis trigger
      mockApiSuccess(mockAnalysisResults);

      renderWithProviders(<AnalysisPage />);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Starting automatic analysis',
          })
        );
      });

      // Should call analysis API
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/api/analysis/analyze/${mockJobId}`),
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should show auto-analysis progress', async () => {
      mockApiSuccess({ jobDescription: mockJobDescription });
      mockApiSuccess({ results: [], metadata: {} });
      
      // Mock delayed analysis
      mockApiSuccess(mockAnalysisResults, 100);

      renderWithProviders(<AnalysisPage />);

      expect(screen.getByText('Analyzing resumes against job description...')).toBeInTheDocument();
      expect(screen.getByText('This may take a moment')).toBeInTheDocument();
    });

    it('should not trigger auto-analysis when results exist', async () => {
      mockApiSuccess({ jobDescription: mockJobDescription });
      mockApiSuccess(mockAnalysisResults);

      renderWithProviders(<AnalysisPage />);

      // Should not show auto-analysis message
      await waitFor(() => {
        expect(screen.queryByText('Starting automatic analysis')).not.toBeInTheDocument();
      });
    });

    it('should handle auto-analysis failures with retry', async () => {
      mockApiSuccess({ jobDescription: mockJobDescription });
      mockApiSuccess({ results: [], metadata: {} });
      
      // Mock analysis failure
      mockApiError('Analysis failed', 'ANALYSIS_ERROR');

      renderWithProviders(<AnalysisPage />);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Analysis failed',
            variant: 'destructive',
          })
        );
      });
    });

    it('should stop retrying after maximum attempts', async () => {
      mockApiSuccess({ jobDescription: mockJobDescription });
      mockApiSuccess({ results: [], metadata: {} });
      
      // Mock repeated failures
      mockApiError('Analysis failed', 'ANALYSIS_ERROR');
      mockApiError('Analysis failed', 'ANALYSIS_ERROR');
      mockApiError('Analysis failed', 'ANALYSIS_ERROR');
      mockApiError('Analysis failed', 'ANALYSIS_ERROR');

      renderWithProviders(<AnalysisPage />);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Analysis failed',
            description: expect.stringContaining('Maximum retries reached'),
          })
        );
      }, { timeout: 5000 });
    });
  });

  // ===== ANALYSIS RESULTS DISPLAY =====

  describe('Analysis Results Display', () => {
    beforeEach(() => {
      mockApiSuccess({ jobDescription: mockJobDescription });
      mockApiSuccess(mockAnalysisResults);
    });

    it('should display analysis results correctly', async () => {
      renderWithProviders(<AnalysisPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByText('87%')).toBeInTheDocument();
        expect(screen.getByText('match')).toBeInTheDocument();
      });
    });

    it('should show confidence levels', async () => {
      renderWithProviders(<AnalysisPage />);

      await waitFor(() => {
        expect(screen.getByText('high confidence')).toBeInTheDocument();
      });
    });

    it('should display matched skills with percentages', async () => {
      const { user } = renderWithProviders(<AnalysisPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Expand details
      const viewDetailsButton = screen.getByText('View Details');
      await user.click(viewDetailsButton);

      await waitFor(() => {
        expect(screen.getByText('JavaScript')).toBeInTheDocument();
        expect(screen.getByText('95% match')).toBeInTheDocument();
        expect(screen.getByText('React')).toBeInTheDocument();
        expect(screen.getByText('90% match')).toBeInTheDocument();
      });
    });

    it('should display missing skills', async () => {
      const { user } = renderWithProviders(<AnalysisPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const viewDetailsButton = screen.getByText('View Details');
      await user.click(viewDetailsButton);

      await waitFor(() => {
        expect(screen.getByText('Missing Skills')).toBeInTheDocument();
        expect(screen.getByText('Docker')).toBeInTheDocument();
        expect(screen.getByText('Kubernetes')).toBeInTheDocument();
      });
    });

    it('should show candidate strengths and weaknesses', async () => {
      const { user } = renderWithProviders(<AnalysisPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const viewDetailsButton = screen.getByText('View Details');
      await user.click(viewDetailsButton);

      await waitFor(() => {
        expect(screen.getByText('Strong technical skills')).toBeInTheDocument();
        expect(screen.getByText('Limited DevOps experience')).toBeInTheDocument();
      });
    });

    it('should display fairness metrics', async () => {
      const { user } = renderWithProviders(<AnalysisPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const viewDetailsButton = screen.getByText('View Details');
      await user.click(viewDetailsButton);

      await waitFor(() => {
        expect(screen.getByText('Fairness Analysis')).toBeInTheDocument();
        expect(screen.getByText('Bias Confidence Score')).toBeInTheDocument();
        expect(screen.getByText('92%')).toBeInTheDocument();
      });
    });

    it('should render skill radar chart', async () => {
      const { user } = renderWithProviders(<AnalysisPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const viewDetailsButton = screen.getByText('View Details');
      await user.click(viewDetailsButton);

      await waitFor(() => {
        expect(screen.getByText('Skill Match Visualization')).toBeInTheDocument();
      });
    });
  });

  // ===== USER INTERACTIONS =====

  describe('User Interactions', () => {
    beforeEach(() => {
      mockApiSuccess({ jobDescription: mockJobDescription });
      mockApiSuccess(mockAnalysisResults);
    });

    it('should expand and collapse candidate details', async () => {
      const { user } = renderWithProviders(<AnalysisPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const viewDetailsButton = screen.getByText('View Details');
      
      // Expand details
      await user.click(viewDetailsButton);
      
      await waitFor(() => {
        expect(screen.getByText('Key Skills')).toBeInTheDocument();
        expect(screen.getByText('Hide Details')).toBeInTheDocument();
      });

      // Collapse details
      const hideDetailsButton = screen.getByText('Hide Details');
      await user.click(hideDetailsButton);

      await waitFor(() => {
        expect(screen.queryByText('Key Skills')).not.toBeInTheDocument();
        expect(screen.getByText('View Details')).toBeInTheDocument();
      });
    });

    it('should navigate to interview questions', async () => {
      const { user } = renderWithProviders(<AnalysisPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const viewDetailsButton = screen.getByText('View Details');
      await user.click(viewDetailsButton);

      await waitFor(async () => {
        const interviewButton = screen.getByText('Generate Interview Questions');
        await user.click(interviewButton);
      });

      expect(mockLocation[1]).toHaveBeenCalledWith(`/interview/1/${mockJobId}`);
    });

    it('should handle manual analysis trigger', async () => {
      mockApiSuccess({ jobDescription: mockJobDescription });
      mockApiSuccess({ results: [], metadata: {} });

      const { user } = renderWithProviders(<AnalysisPage />);

      await waitFor(() => {
        expect(screen.getByText('Try Again')).toBeInTheDocument();
      });

      // Mock successful manual analysis
      mockApiSuccess(mockAnalysisResults);

      const tryAgainButton = screen.getByText('Try Again');
      await user.click(tryAgainButton);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining(`/api/analysis/analyze/${mockJobId}`),
          expect.objectContaining({
            method: 'POST',
          })
        );
      });
    });

    it('should handle re-analysis trigger', async () => {
      const { user } = renderWithProviders(<AnalysisPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Mock re-analysis (Note: This would typically be triggered from a menu or button)
      // For now, we'll test the logic through manual analysis
      mockApiSuccess(mockAnalysisResults);

      // Since there's no explicit re-analyze button in the current UI,
      // we'll test error scenario re-analysis
      mockApiError('Analysis failed', 'ANALYSIS_ERROR');

      const { rerender } = renderWithProviders(<AnalysisPage />);
      
      // This would trigger the retry logic
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Analysis failed',
          })
        );
      });
    });
  });

  // ===== ERROR HANDLING TESTS =====

  describe('Error Handling', () => {
    it('should handle job description loading errors', async () => {
      mockApiError('Job not found', 'NOT_FOUND', 404);

      renderWithProviders(<AnalysisPage />);

      await waitFor(() => {
        expect(screen.getByText('Job Description Not Found')).toBeInTheDocument();
        expect(screen.getByText('Go to Job Descriptions')).toBeInTheDocument();
      });
    });

    it('should handle analysis loading errors', async () => {
      mockApiSuccess({ jobDescription: mockJobDescription });
      mockApiError('Failed to load analysis', 'LOAD_ERROR');

      renderWithProviders(<AnalysisPage />);

      await waitFor(() => {
        expect(screen.getByText('Error Loading Analysis')).toBeInTheDocument();
        expect(screen.getByText('Try Again')).toBeInTheDocument();
      });
    });

    it('should handle network errors gracefully', async () => {
      mockApiSuccess({ jobDescription: mockJobDescription });
      simulateNetworkError();

      renderWithProviders(<AnalysisPage />);

      await waitFor(() => {
        expect(screen.getByText('Error Loading Analysis')).toBeInTheDocument();
      });
    });

    it('should provide appropriate error recovery options', async () => {
      const { user } = renderWithProviders(<AnalysisPage />);

      mockApiSuccess({ jobDescription: mockJobDescription });
      mockApiError('Analysis error', 'ANALYSIS_ERROR');

      await waitFor(() => {
        expect(screen.getByText('Error Loading Analysis')).toBeInTheDocument();
      });

      const tryAgainButton = screen.getByText('Try Again');
      expect(tryAgainButton).toBeInTheDocument();

      // Mock successful retry
      mockApiSuccess(mockAnalysisResults);
      await user.click(tryAgainButton);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/analysis/analyze/'),
          expect.any(Object)
        );
      });
    });
  });

  // ===== LOADING STATES =====

  describe('Loading States', () => {
    it('should show loading spinner for job description', () => {
      // Don't mock API response immediately
      renderWithProviders(<AnalysisPage />);

      expect(screen.getByRole('main')).toBeInTheDocument();
      // Loading spinner should be present
      const spinner = screen.getByLabelText(/loading/i) || 
                    document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });

    it('should show loading spinner for analysis results', async () => {
      mockApiSuccess({ jobDescription: mockJobDescription });
      // Don't mock analysis response immediately
      
      renderWithProviders(<AnalysisPage />);

      await waitFor(() => {
        expect(screen.getByText('Candidate Fit Analysis')).toBeInTheDocument();
      });

      const spinner = screen.getByLabelText(/loading/i) || 
                    document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });

    it('should show analysis in progress state', async () => {
      mockApiSuccess({ jobDescription: mockJobDescription });
      mockApiSuccess({ results: [], metadata: {} });
      
      renderWithProviders(<AnalysisPage />);

      await waitFor(() => {
        expect(screen.getByText('Analyzing resumes against job description...')).toBeInTheDocument();
        expect(screen.getByText('This may take a moment')).toBeInTheDocument();
      });
    });
  });

  // ===== EMPTY STATES =====

  describe('Empty States', () => {
    it('should show no results message when analysis is empty', async () => {
      mockApiSuccess({ jobDescription: mockJobDescription });
      mockApiSuccess({ results: [], metadata: {} });

      renderWithProviders(<AnalysisPage />);

      await waitFor(() => {
        expect(screen.getByText('No Analysis Results Available')).toBeInTheDocument();
      });
    });

    it('should provide helpful guidance for empty states', async () => {
      mockApiSuccess({ jobDescription: mockJobDescription });
      mockApiSuccess({ results: [], metadata: {} });

      renderWithProviders(<AnalysisPage />);

      await waitFor(() => {
        expect(screen.getByText('This could be due to one of the following reasons:')).toBeInTheDocument();
        expect(screen.getByText('No resumes were uploaded')).toBeInTheDocument();
        expect(screen.getByText('The job description analysis is still in progress')).toBeInTheDocument();
      });
    });

    it('should provide action buttons in empty states', async () => {
      mockApiSuccess({ jobDescription: mockJobDescription });
      mockApiSuccess({ results: [], metadata: {} });

      const { user } = renderWithProviders(<AnalysisPage />);

      await waitFor(() => {
        const tryAgainButton = screen.getByText('Try Again');
        expect(tryAgainButton).toBeInTheDocument();
      });
    });
  });

  // ===== ACCESSIBILITY TESTS =====

  describe('Accessibility', () => {
    beforeEach(() => {
      mockApiSuccess({ jobDescription: mockJobDescription });
      mockApiSuccess(mockAnalysisResults);
    });

    it('should support keyboard navigation', async () => {
      const { user, container } = renderWithProviders(<AnalysisPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      await testKeyboardNavigation(container, user);
    });

    it('should have proper ARIA attributes', async () => {
      const { container } = renderWithProviders(<AnalysisPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      checkAriaAttributes(container);
    });

    it('should provide proper heading structure', async () => {
      renderWithProviders(<AnalysisPage />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Candidate Fit Analysis');
      });
    });

    it('should have accessible progress indicators', async () => {
      mockApiSuccess({ jobDescription: mockJobDescription });
      mockApiSuccess({ results: [], metadata: {} });

      renderWithProviders(<AnalysisPage />);

      await waitFor(() => {
        const progressText = screen.getByText('Analyzing resumes against job description...');
        expect(progressText).toBeInTheDocument();
      });
    });

    it('should provide screen reader friendly content', async () => {
      renderWithProviders(<AnalysisPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Check for descriptive content
      expect(screen.getByText('87%')).toBeInTheDocument();
      expect(screen.getByText('match')).toBeInTheDocument();
      expect(screen.getByText('high confidence')).toBeInTheDocument();
    });
  });

  // ===== VISUAL REGRESSION TESTS =====

  describe('Visual Components', () => {
    beforeEach(() => {
      mockApiSuccess({ jobDescription: mockJobDescription });
      mockApiSuccess(mockAnalysisResults);
    });

    it('should display candidate avatars correctly', async () => {
      renderWithProviders(<AnalysisPage />);

      await waitFor(() => {
        const candidateCard = screen.getByText('John Doe').closest('[class*="card"]');
        expect(candidateCard).toBeInTheDocument();
        
        // Should have avatar with initials
        const avatar = candidateCard?.querySelector('[class*="rounded-full"]');
        expect(avatar).toBeInTheDocument();
      });
    });

    it('should display match percentages prominently', async () => {
      renderWithProviders(<AnalysisPage />);

      await waitFor(() => {
        const matchPercentage = screen.getByText('87%');
        expect(matchPercentage).toBeInTheDocument();
        
        // Should be in a prominent display
        expect(matchPercentage.closest('[class*="text-3xl"]')).toBeInTheDocument();
      });
    });

    it('should show confidence level badges', async () => {
      renderWithProviders(<AnalysisPage />);

      await waitFor(() => {
        const confidenceBadge = screen.getByText('high confidence');
        expect(confidenceBadge).toBeInTheDocument();
        
        // Should be styled as a badge
        expect(confidenceBadge.closest('[class*="bg-green"]')).toBeInTheDocument();
      });
    });

    it('should display skill match progress bars', async () => {
      const { user } = renderWithProviders(<AnalysisPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const viewDetailsButton = screen.getByText('View Details');
      await user.click(viewDetailsButton);

      await waitFor(() => {
        // Check for skill progress bars
        const skillBars = document.querySelectorAll('[class*="skill-match"]');
        expect(skillBars.length).toBeGreaterThan(0);
      });
    });
  });

  // ===== INTEGRATION TESTS =====

  describe('Integration Scenarios', () => {
    it('should complete full analysis workflow', async () => {
      // 1. Start with job description loading
      mockApiSuccess({ jobDescription: mockJobDescription });
      
      // 2. Initially no results, trigger auto-analysis
      mockApiSuccess({ results: [], metadata: {} });
      
      // 3. Analysis completes successfully
      mockApiSuccess(mockAnalysisResults);

      const { user } = renderWithProviders(<AnalysisPage />);

      // Should load job description
      await waitFor(() => {
        expect(screen.getByText(mockJobDescription.title)).toBeInTheDocument();
      });

      // Should trigger auto-analysis
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Starting automatic analysis',
          })
        );
      });

      // Should complete analysis and show results
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByText('87%')).toBeInTheDocument();
      });

      // Should be able to interact with results
      const viewDetailsButton = screen.getByText('View Details');
      await user.click(viewDetailsButton);

      await waitFor(() => {
        expect(screen.getByText('Key Skills')).toBeInTheDocument();
      });
    });

    it('should handle error recovery workflow', async () => {
      const { user } = renderWithProviders(<AnalysisPage />);

      // 1. Start with error
      mockApiSuccess({ jobDescription: mockJobDescription });
      mockApiError('Analysis failed', 'ANALYSIS_ERROR');

      await waitFor(() => {
        expect(screen.getByText('Error Loading Analysis')).toBeInTheDocument();
      });

      // 2. User clicks retry
      const tryAgainButton = screen.getByText('Try Again');
      
      // 3. Mock successful retry
      mockApiSuccess(mockAnalysisResults);
      await user.click(tryAgainButton);

      // 4. Should show results
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });
    });

    it('should handle session data synchronization', async () => {
      // Test with different session/batch combinations
      mockLocalStorage.getItem.mockImplementation((key: unknown) => {
        const keyStr = key as string;
        if (keyStr === 'currentUploadSession') return 'different_session';
        if (keyStr === 'currentBatchId') return 'different_batch';
        return null;
      });

      mockApiSuccess({ jobDescription: mockJobDescription });
      mockApiSuccess(mockAnalysisResults);

      renderWithProviders(<AnalysisPage />);

      await waitFor(() => {
        expect(screen.getByText(/Analyzing Batch:/)).toBeInTheDocument();
        expect(screen.getByText(/different_batch/)).toBeInTheDocument();
      });
    });
  });
});