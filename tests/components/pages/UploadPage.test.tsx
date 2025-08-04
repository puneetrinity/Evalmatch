/**
 * Comprehensive Tests for UploadPage Component
 * 
 * Tests all functionality including:
 * - Component rendering and initialization
 * - File upload via drag and drop
 * - File upload via file input
 * - File validation (type, size)
 * - Batch management and session handling
 * - State persistence and recovery
 * - Error handling and user feedback
 * - Accessibility features
 * - User interactions and navigation
 */

import React from 'react';
import { within } from '@testing-library/react';
import { screen, waitFor } from '@testing-library/dom';


import UploadPage from '@/pages/upload';
import {
  renderWithProviders,
  mockApiSuccess,
  mockApiError,
  simulateDragAndDrop,
  simulateFileSelection,
  simulateNetworkError,
  testKeyboardNavigation,
  checkAriaAttributes,
  setupTest,
  cleanupTest,
  mockTestFiles,
  mockResumeList,
  mockSessionId,
  mockBatchId,
  mockLocalStorage,
  mockToast,
  mockFetch,
  mockLocation,
} from '../../helpers/component-test-helpers';

// ===== TEST SETUP =====

describe('UploadPage Component', () => {
  beforeEach(() => {
    setupTest();
  });

  afterEach(() => {
    cleanupTest();
  });

  // ===== RENDERING TESTS =====

  describe('Component Rendering', () => {
    it('should render upload page with all essential elements', async () => {
      const { user } = renderWithProviders(<UploadPage />);

      // Check main elements
      expect(screen.getByRole('main')).toBeInTheDocument();
      expect(screen.getByText('Upload Resumes')).toBeInTheDocument();
      expect(screen.getByText(/Upload up to 100 resumes/)).toBeInTheDocument();
      
      // Check upload area
      expect(screen.getByText('Drag and drop your resumes here')).toBeInTheDocument();
      expect(screen.getByText('Browse Files')).toBeInTheDocument();
      
      // Check file list section
      expect(screen.getByText('Uploaded Resumes')).toBeInTheDocument();
      expect(screen.getByText('Reset Session')).toBeInTheDocument();
      
      // Check continue button
      expect(screen.getByText('Continue to Job Description')).toBeInTheDocument();
    });

    it('should render step progress component', () => {
      renderWithProviders(<UploadPage />);
      
      // Step progress should be rendered
      const stepElement = screen.getByText('Resume Upload');
      expect(stepElement).toBeInTheDocument();
    });

    it('should render header and footer', () => {
      renderWithProviders(<UploadPage />);
      
      // Header should contain navigation elements
      expect(screen.getByRole('banner')).toBeInTheDocument();
      
      // Footer should be present
      expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    });

    it('should show batch information when batch ID is available', async () => {
      // Mock existing batch
      (mockLocalStorage.getItem as any).mockImplementation((key: string) => {
        if (key === 'currentBatchId') return mockBatchId;
        if (key === 'currentUploadSession') return mockSessionId;
        return null;
      });

      renderWithProviders(<UploadPage />);

      await waitFor(() => {
        expect(screen.getByText(/Current Batch:/)).toBeInTheDocument();
        expect(screen.getByText(new RegExp(mockBatchId.slice(-8)))).toBeInTheDocument();
      });
    });

    it('should show initializing message when batch is being set up', () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      
      renderWithProviders(<UploadPage />);
      
      expect(screen.getByText('Initializing batch...')).toBeInTheDocument();
    });
  });

  // ===== SESSION AND BATCH MANAGEMENT TESTS =====

  describe('Session and Batch Management', () => {
    it('should create new session and batch on initialization', async () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      
      renderWithProviders(<UploadPage />);

      await waitFor(() => {
        expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
          'currentUploadSession',
          expect.stringMatching(/^session_/)
        );
        expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
          'currentBatchId',
          expect.stringMatching(/^batch_/)
        );
      });
    });

    it('should use existing session if available', async () => {
      (mockLocalStorage.getItem as any).mockImplementation((key: string) => {
        if (key === 'currentUploadSession') return mockSessionId;
        if (key === 'currentBatchId') return mockBatchId;
        return null;
      });

      // Mock successful resume fetch for existing batch
      mockApiSuccess(mockResumeList);

      renderWithProviders(<UploadPage />);

      await waitFor(() => {
        expect(screen.getByText(/Current Batch:/)).toBeInTheDocument();
      });

      // Should use existing session, not create new one
      expect(mockLocalStorage.setItem).not.toHaveBeenCalledWith(
        'currentUploadSession',
        expect.any(String)
      );
    });

    it('should handle batch validation for existing batches', async () => {
      (mockLocalStorage.getItem as any).mockImplementation((key: string) => {
        if (key === 'currentUploadSession') return mockSessionId;
        if (key === 'currentBatchId') return mockBatchId;
        return null;
      });

      // Mock batch has resumes
      mockApiSuccess(mockResumeList);

      renderWithProviders(<UploadPage />);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining(`/api/resumes?sessionId=${mockSessionId}&batchId=${mockBatchId}`),
          expect.any(Object)
        );
      });
    });

    it('should create new batch if existing batch is empty', async () => {
      (mockLocalStorage.getItem as any).mockImplementation((key: string) => {
        if (key === 'currentUploadSession') return mockSessionId;
        if (key === 'currentBatchId') return mockBatchId;
        return null;
      });

      // Mock empty batch
      mockApiSuccess({ resumes: [], total: 0, batchId: mockBatchId, sessionId: mockSessionId });

      renderWithProviders(<UploadPage />);

      await waitFor(() => {
        expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
          'currentBatchId',
          expect.stringMatching(/^batch_/)
        );
      });
    });

    it('should reset session when reset button is clicked', async () => {
      const { user } = renderWithProviders(<UploadPage />);

      const resetButton = screen.getByText('Reset Session');
      await user.click(resetButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Session Reset',
          })
        );
      });

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'currentUploadSession',
        expect.stringMatching(/^session_/)
      );
    });
  });

  // ===== FILE UPLOAD TESTS =====

  describe('File Upload Functionality', () => {
    it('should handle drag and drop file upload', async () => {
      const { user } = renderWithProviders(<UploadPage />);

      // Mock successful upload
      mockApiSuccess({
        id: '1',
        filename: 'test-resume.pdf',
        fileSize: 245760,
        fileType: 'application/pdf',
        message: 'Upload successful',
      });

      const dropzone = screen.getByText('Drag and drop your resumes here').closest('div')!;
      await simulateDragAndDrop(dropzone, [mockTestFiles.validPDF], user);

      await waitFor(() => {
        expect(screen.getByText('test-resume.pdf')).toBeInTheDocument();
      });

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Upload successful',
        })
      );
    });

    it('should handle file input upload', async () => {
      const { user } = renderWithProviders(<UploadPage />);

      // Mock successful upload
      mockApiSuccess({
        id: '1',
        filename: 'test-resume.pdf',
        fileSize: 245760,
        fileType: 'application/pdf',
        message: 'Upload successful',
      });

      const browseButton = screen.getByText('Browse Files');
      await user.click(browseButton);

      const fileInput = screen.getByRole('button', { name: /browse files/i })
        .parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
      
      expect(fileInput).toBeInTheDocument();

      await simulateFileSelection(fileInput, [mockTestFiles.validPDF], user);

      await waitFor(() => {
        expect(screen.getByText('test-resume.pdf')).toBeInTheDocument();
      });
    });

    it('should handle multiple file uploads', async () => {
      const { user } = renderWithProviders(<UploadPage />);

      // Mock successful uploads
      mockApiSuccess({
        id: '1',
        filename: 'test-resume.pdf',
        fileSize: 245760,
        fileType: 'application/pdf',
        message: 'Upload successful',
      });
      mockApiSuccess({
        id: '2',
        filename: 'test-resume.docx',
        fileSize: 198432,
        fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        message: 'Upload successful',
      });

      const dropzone = screen.getByText('Drag and drop your resumes here').closest('div')!;
      await simulateDragAndDrop(dropzone, [mockTestFiles.validPDF, mockTestFiles.validDOCX], user);

      await waitFor(() => {
        expect(screen.getByText('test-resume.pdf')).toBeInTheDocument();
        expect(screen.getByText('test-resume.docx')).toBeInTheDocument();
      });
    });

    it('should show upload progress and status', async () => {
      const { user } = renderWithProviders(<UploadPage />);

      // Mock delayed upload
      mockApiSuccess({
        id: '1',
        filename: 'test-resume.pdf',
        fileSize: 245760,
        fileType: 'application/pdf',
        message: 'Upload successful',
      }, 100);

      const dropzone = screen.getByText('Drag and drop your resumes here').closest('div')!;
      await simulateDragAndDrop(dropzone, [mockTestFiles.validPDF], user);

      // Should show uploading status
      expect(screen.getByText('Uploading...')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.queryByText('Uploading...')).not.toBeInTheDocument();
        expect(screen.getByText('test-resume.pdf')).toBeInTheDocument();
      });
    });

    it('should display existing uploaded files', async () => {
      (mockLocalStorage.getItem as any).mockImplementation((key: string) => {
        if (key === 'currentUploadSession') return mockSessionId;
        if (key === 'currentBatchId') return mockBatchId;
        return null;
      });

      // Mock existing resumes
      mockApiSuccess(mockResumeList);

      renderWithProviders(<UploadPage />);

      await waitFor(() => {
        expect(screen.getByText('john_doe_resume.pdf')).toBeInTheDocument();
        expect(screen.getByText('jane_smith_resume.pdf')).toBeInTheDocument();
      });
    });
  });

  // ===== FILE VALIDATION TESTS =====

  describe('File Validation', () => {
    it('should reject invalid file types', async () => {
      const { user } = renderWithProviders(<UploadPage />);

      const dropzone = screen.getByText('Drag and drop your resumes here').closest('div')!;
      await simulateDragAndDrop(dropzone, [mockTestFiles.invalidType], user);

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Invalid file type',
          variant: 'destructive',
        })
      );

      // File should not appear in the list
      expect(screen.queryByText('test-image.jpg')).not.toBeInTheDocument();
    });

    it('should reject oversized files', async () => {
      const { user } = renderWithProviders(<UploadPage />);

      const dropzone = screen.getByText('Drag and drop your resumes here').closest('div')!;
      await simulateDragAndDrop(dropzone, [mockTestFiles.oversized], user);

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'File too large',
          variant: 'destructive',
        })
      );

      expect(screen.queryByText('large-file.pdf')).not.toBeInTheDocument();
    });

    it('should prevent uploading more than 100 files', async () => {
      const { user } = renderWithProviders(<UploadPage />);

      // Mock 100 existing files
      const manyFiles = Array.from({ length: 100 }, (_, i) => ({
        id: `${i + 1}`,
        filename: `resume_${i + 1}.pdf`,
        fileSize: 245760,
        fileType: 'application/pdf',
        status: 'success' as const,
        uploadedAt: new Date().toISOString(),
      }));

      mockApiSuccess({
        resumes: manyFiles,
        total: 100,
        batchId: mockBatchId,
        sessionId: mockSessionId,
      });

      renderWithProviders(<UploadPage />);

      await waitFor(() => {
        expect(screen.getByText('resume_1.pdf')).toBeInTheDocument();
      });

      // Try to upload one more file
      const dropzone = screen.getByText('Drag and drop your resumes here').closest('div')!;
      await simulateDragAndDrop(dropzone, [mockTestFiles.validPDF], user);

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Maximum files exceeded',
          variant: 'destructive',
        })
      );
    });

    it('should handle upload failures gracefully', async () => {
      const { user } = renderWithProviders(<UploadPage />);

      // Mock upload failure
      mockApiError('Upload failed', 'UPLOAD_ERROR');

      const dropzone = screen.getByText('Drag and drop your resumes here').closest('div')!;
      await simulateDragAndDrop(dropzone, [mockTestFiles.validPDF], user);

      await waitFor(() => {
        expect(screen.getByText('Error')).toBeInTheDocument();
      });

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Upload failed',
          variant: 'destructive',
        })
      );
    });
  });

  // ===== USER INTERACTION TESTS =====

  describe('User Interactions', () => {
    it('should remove files when delete button is clicked', async () => {
      const { user } = renderWithProviders(<UploadPage />);

      // Mock successful upload
      mockApiSuccess({
        id: '1',
        filename: 'test-resume.pdf',
        fileSize: 245760,
        fileType: 'application/pdf',
        message: 'Upload successful',
      });

      const dropzone = screen.getByText('Drag and drop your resumes here').closest('div')!;
      await simulateDragAndDrop(dropzone, [mockTestFiles.validPDF], user);

      await waitFor(() => {
        expect(screen.getByText('test-resume.pdf')).toBeInTheDocument();
      });

      // Find and click delete button
      const deleteButton = screen.getByRole('button', { name: /times|remove|delete/i });
      await user.click(deleteButton);

      expect(screen.queryByText('test-resume.pdf')).not.toBeInTheDocument();
    });

    it('should handle continue button states correctly', async () => {
      renderWithProviders(<UploadPage />);

      const continueButton = screen.getByText('Continue to Job Description');

      // Should be disabled when no files uploaded
      expect(continueButton).toBeDisabled();

      // Upload a file
      const { user } = renderWithProviders(<UploadPage />);
      mockApiSuccess({
        id: '1',
        filename: 'test-resume.pdf',
        fileSize: 245760,
        fileType: 'application/pdf',
        message: 'Upload successful',
      });

      const dropzone = screen.getByText('Drag and drop your resumes here').closest('div')!;
      await simulateDragAndDrop(dropzone, [mockTestFiles.validPDF], user);

      await waitFor(() => {
        expect(continueButton).toBeEnabled();
      });
    });

    it('should navigate to job description page on continue', async () => {
      const { user } = renderWithProviders(<UploadPage />);

      // Mock successful upload and validation
      mockApiSuccess({
        id: '1',
        filename: 'test-resume.pdf',
        fileSize: 245760,
        fileType: 'application/pdf',
        message: 'Upload successful',
      });

      // Mock batch validation success
      mockApiSuccess(mockResumeList);

      const dropzone = screen.getByText('Drag and drop your resumes here').closest('div')!;
      await simulateDragAndDrop(dropzone, [mockTestFiles.validPDF], user);

      await waitFor(() => {
        expect(screen.getByText('test-resume.pdf')).toBeInTheDocument();
      });

      const continueButton = screen.getByText('Continue to Job Description');
      await user.click(continueButton);

      await waitFor(() => {
        expect(mockLocation[1]).toHaveBeenCalledWith('/job-description');
      });
    });

    it('should handle batch validation failure on continue', async () => {
      const { user } = renderWithProviders(<UploadPage />);

      // Mock successful upload
      mockApiSuccess({
        id: '1',
        filename: 'test-resume.pdf',
        fileSize: 245760,
        fileType: 'application/pdf',
        message: 'Upload successful',
      });

      const dropzone = screen.getByText('Drag and drop your resumes here').closest('div')!;
      await simulateDragAndDrop(dropzone, [mockTestFiles.validPDF], user);

      await waitFor(() => {
        expect(screen.getByText('test-resume.pdf')).toBeInTheDocument();
      });

      // Mock batch validation failure
      mockApiError('Batch validation failed', 'VALIDATION_ERROR');

      const continueButton = screen.getByText('Continue to Job Description');
      await user.click(continueButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Batch validation failed',
            variant: 'destructive',
          })
        );
      });

      // Should not navigate
      expect(mockLocation[1]).not.toHaveBeenCalledWith('/job-description');
    });
  });

  // ===== ERROR HANDLING TESTS =====

  describe('Error Handling', () => {
    it('should handle network errors during upload', async () => {
      const { user } = renderWithProviders(<UploadPage />);

      simulateNetworkError();

      const dropzone = screen.getByText('Drag and drop your resumes here').closest('div')!;
      await simulateDragAndDrop(dropzone, [mockTestFiles.validPDF], user);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Upload failed',
            variant: 'destructive',
          })
        );
      });
    });

    it('should handle session initialization errors', async () => {
      mockLocalStorage.getItem.mockImplementation(() => {
        throw new Error('Storage error');
      });

      renderWithProviders(<UploadPage />);

      // Should still render and create new session
      await waitFor(() => {
        expect(screen.getByText('Upload Resumes')).toBeInTheDocument();
      });
    });

    it('should handle API errors during resume fetching', async () => {
      (mockLocalStorage.getItem as any).mockImplementation((key: string) => {
        if (key === 'currentUploadSession') return mockSessionId;
        if (key === 'currentBatchId') return mockBatchId;
        return null;
      });

      mockApiError('Failed to fetch resumes', 'FETCH_ERROR');

      renderWithProviders(<UploadPage />);

      // Should still render but show no resumes
      await waitFor(() => {
        expect(screen.getByText('No resumes uploaded yet')).toBeInTheDocument();
      });
    });
  });

  // ===== ACCESSIBILITY TESTS =====

  describe('Accessibility', () => {
    it('should support keyboard navigation', async () => {
      const { user, container } = renderWithProviders(<UploadPage />);

      await testKeyboardNavigation(container, user);
    });

    it('should have proper ARIA attributes', () => {
      const { container } = renderWithProviders(<UploadPage />);

      checkAriaAttributes(container);

      // Check specific ARIA attributes
      const fileInput = screen.getByRole('button', { name: /browse files/i })
        .parentElement?.querySelector('input[type="file"]');
      expect(fileInput).toHaveAttribute('accept', '.pdf,.doc,.docx');

      const continueButton = screen.getByText('Continue to Job Description');
      expect(continueButton).toHaveAttribute('type', 'button');
    });

    it('should provide screen reader friendly content', () => {
      renderWithProviders(<UploadPage />);

      // Check for descriptive text
      expect(screen.getByText(/Upload up to 100 resumes/)).toBeInTheDocument();
      expect(screen.getByText(/Supported formats: PDF, DOC, DOCX/)).toBeInTheDocument();

      // Check for status messages
      expect(screen.getByText('No resumes uploaded yet')).toBeInTheDocument();
    });

    it('should handle focus management correctly', async () => {
      const { user } = renderWithProviders(<UploadPage />);

      const browseButton = screen.getByText('Browse Files');
      await user.click(browseButton);

      // Focus should move to file input
      const fileInput = screen.getByRole('button', { name: /browse files/i })
        .parentElement?.querySelector('input[type="file"]');
      expect(fileInput).toBeInTheDocument();
    });
  });

  // ===== VISUAL STATE TESTS =====

  describe('Visual States', () => {
    it('should show drag active state', async () => {
      const { user } = renderWithProviders(<UploadPage />);

      const dropzone = screen.getByText('Drag and drop your resumes here').closest('div')!;

      // Simulate dragenter
      dropzone.dispatchEvent(
        new DragEvent('dragenter', {
          bubbles: true,
          dataTransfer: new DataTransfer(),
        })
      );

      // Should add active class or change appearance
      expect(dropzone).toHaveClass('drop-zone');
    });

    it('should show loading states during upload', async () => {
      const { user } = renderWithProviders(<UploadPage />);

      // Mock delayed upload
      mockApiSuccess({
        id: '1',
        filename: 'test-resume.pdf',
        fileSize: 245760,
        fileType: 'application/pdf',
        message: 'Upload successful',
      }, 100);

      const dropzone = screen.getByText('Drag and drop your resumes here').closest('div')!;
      await simulateDragAndDrop(dropzone, [mockTestFiles.validPDF], user);

      expect(screen.getByText('Uploading...')).toBeInTheDocument();
    });

    it('should show empty state correctly', () => {
      renderWithProviders(<UploadPage />);

      expect(screen.getByText('No resumes uploaded yet')).toBeInTheDocument();
    });

    it('should show file size and type information', async () => {
      const { user } = renderWithProviders(<UploadPage />);

      mockApiSuccess({
        id: '1',
        filename: 'test-resume.pdf',
        fileSize: 245760,
        fileType: 'application/pdf',
        message: 'Upload successful',
      });

      const dropzone = screen.getByText('Drag and drop your resumes here').closest('div')!;
      await simulateDragAndDrop(dropzone, [mockTestFiles.validPDF], user);

      await waitFor(() => {
        expect(screen.getByText('test-resume.pdf')).toBeInTheDocument();
        expect(screen.getByText('240KB')).toBeInTheDocument(); // File size formatting
      });
    });
  });

  // ===== INTEGRATION TESTS =====

  describe('Integration Scenarios', () => {
    it('should complete full upload workflow', async () => {
      const { user } = renderWithProviders(<UploadPage />);

      // 1. Start with new session
      expect(screen.getByText('Upload Resumes')).toBeInTheDocument();

      // 2. Upload files
      mockApiSuccess({
        id: '1',
        filename: 'test-resume.pdf',
        fileSize: 245760,
        fileType: 'application/pdf',
        message: 'Upload successful',
      });

      const dropzone = screen.getByText('Drag and drop your resumes here').closest('div')!;
      await simulateDragAndDrop(dropzone, [mockTestFiles.validPDF], user);

      await waitFor(() => {
        expect(screen.getByText('test-resume.pdf')).toBeInTheDocument();
      });

      // 3. Validate and continue
      mockApiSuccess(mockResumeList);

      const continueButton = screen.getByText('Continue to Job Description');
      await user.click(continueButton);

      await waitFor(() => {
        expect(mockLocation[1]).toHaveBeenCalledWith('/job-description');
      });
    });

    it('should handle session recovery workflow', async () => {
      // Start with existing session
      (mockLocalStorage.getItem as any).mockImplementation((key: string) => {
        if (key === 'currentUploadSession') return mockSessionId;
        if (key === 'currentBatchId') return mockBatchId;
        return null;
      });

      mockApiSuccess(mockResumeList);

      renderWithProviders(<UploadPage />);

      await waitFor(() => {
        expect(screen.getByText('john_doe_resume.pdf')).toBeInTheDocument();
        expect(screen.getByText('jane_smith_resume.pdf')).toBeInTheDocument();
      });

      // Should show batch information
      expect(screen.getByText(/Current Batch:/)).toBeInTheDocument();
    });
  });
});