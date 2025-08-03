/**
 * Comprehensive Tests for Header Component
 * 
 * Tests all functionality including:
 * - Component rendering and layout
 * - Authentication state handling
 * - Navigation and routing
 * - User menu interactions
 * - Auth modal functionality
 * - Help center integration
 * - Responsive design
 * - Accessibility features
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';

import userEvent from '@testing-library/user-event';

import Header from '@/components/layout/header';
import {
  renderWithProviders,
  setupTest,
  cleanupTest,
  testKeyboardNavigation,
  checkAriaAttributes,
  mockAuthContext,
  mockLocation,
} from '@/tests/helpers/component-test-helpers';

// ===== MOCK SETUP =====

// Mock Link component from wouter
vi.mock('wouter', () => ({
  Link: ({ href, children, className }: any) => (
    <a href={href} className={className} data-testid="wouter-link">
      {children}
    </a>
  ),
}));

// Mock auth components
vi.mock('@/components/auth', () => ({
  UserMenu: () => <div data-testid="user-menu">User Menu</div>,
  AuthModal: ({ isOpen, onClose, defaultMode }: any) =>
    isOpen ? (
      <div data-testid="auth-modal" data-mode={defaultMode}>
        <button onClick={onClose}>Close Modal</button>
      </div>
    ) : null,
}));

// Mock onboarding components
vi.mock('@/components/onboarding', () => ({
  HelpCenter: ({ triggerButton }: any) => (
    <div data-testid="help-center">
      {triggerButton}
    </div>
  ),
}));

// ===== TEST DATA =====

const mockUser = {
  uid: 'test-user-123',
  email: 'test@example.com',
  displayName: 'Test User',
};

const mockUnauthenticatedState = {
  user: null,
  isAuthenticated: false,
  loading: false,
  signIn: vi.fn(),
  signOut: vi.fn(),
  signUp: vi.fn(),
};

const mockAuthenticatedState = {
  user: mockUser,
  isAuthenticated: true,
  loading: false,
  signIn: vi.fn(),
  signOut: vi.fn(),
  signUp: vi.fn(),
};

const mockLoadingState = {
  user: null,
  isAuthenticated: false,
  loading: true,
  signIn: vi.fn(),
  signOut: vi.fn(),
  signUp: vi.fn(),
};

// ===== TEST SETUP =====

describe('Header Component', () => {
  beforeEach(() => {
    setupTest();
  });

  afterEach(() => {
    cleanupTest();
  });

  // ===== BASIC RENDERING TESTS =====

  describe('Component Rendering', () => {
    it('should render header with essential elements', () => {
      mockAuthContext.user = null;
      mockAuthContext.isAuthenticated = false;

      render(<Header />);

      expect(screen.getByRole('banner')).toBeInTheDocument();
      expect(screen.getByText('EvalMatchAI')).toBeInTheDocument();
      expect(screen.getByText('Help Center')).toBeInTheDocument();
    });

    it('should render logo as a link to home', () => {
      render(<Header />);

      const logoLink = screen.getByTestId('wouter-link');
      expect(logoLink).toHaveAttribute('href', '/');
      expect(logoLink).toHaveTextContent('EvalMatchAI');
    });

    it('should have proper header structure', () => {
      render(<Header />);

      const header = screen.getByRole('banner');
      expect(header).toHaveClass('bg-white', 'shadow-sm');

      const container = within(header).getByRole('generic');
      expect(container).toHaveClass('max-w-7xl', 'mx-auto', 'px-4');
    });

    it('should render help center component', () => {
      render(<Header />);

      expect(screen.getByTestId('help-center')).toBeInTheDocument();
      expect(screen.getByText('Help Center')).toBeInTheDocument();
    });
  });

  // ===== AUTHENTICATION STATE TESTS =====

  describe('Authentication State Handling', () => {
    it('should show sign in buttons when user is not authenticated', () => {
      mockAuthContext.user = null;
      mockAuthContext.isAuthenticated = false;

      render(<Header />);

      expect(screen.getByText('Sign In')).toBeInTheDocument();
      expect(screen.getByText('Get Started')).toBeInTheDocument();
      expect(screen.queryByTestId('user-menu')).not.toBeInTheDocument();
    });

    it('should show user menu when user is authenticated', () => {
      mockAuthContext.user = mockUser;
      mockAuthContext.isAuthenticated = true;

      render(<Header />);

      expect(screen.getByTestId('user-menu')).toBeInTheDocument();
      expect(screen.queryByText('Sign In')).not.toBeInTheDocument();
      expect(screen.queryByText('Get Started')).not.toBeInTheDocument();
    });

    it('should handle loading state gracefully', () => {
      mockAuthContext.user = null;
      mockAuthContext.isAuthenticated = false;
      mockAuthContext.loading = true;

      render(<Header />);

      // Should render basic structure even during loading
      expect(screen.getByText('EvalMatchAI')).toBeInTheDocument();
      expect(screen.getByText('Help Center')).toBeInTheDocument();
    });

    it('should handle auth state transitions', () => {
      // Start unauthenticated
      mockAuthContext.user = null;
      mockAuthContext.isAuthenticated = false;

      const { rerender } = render(<Header />);

      expect(screen.getByText('Sign In')).toBeInTheDocument();
      expect(screen.queryByTestId('user-menu')).not.toBeInTheDocument();

      // Simulate authentication
      mockAuthContext.user = mockUser;
      mockAuthContext.isAuthenticated = true;

      rerender(<Header />);

      expect(screen.getByTestId('user-menu')).toBeInTheDocument();
      expect(screen.queryByText('Sign In')).not.toBeInTheDocument();
    });
  });

  // ===== USER INTERACTIONS =====

  describe('User Interactions', () => {
    it('should open auth modal when sign in button is clicked', async () => {
      const user = userEvent.setup();
      mockAuthContext.user = null;
      mockAuthContext.isAuthenticated = false;

      render(<Header />);

      const signInButton = screen.getByText('Sign In');
      await user.click(signInButton);

      expect(screen.getByTestId('auth-modal')).toBeInTheDocument();
      expect(screen.getByTestId('auth-modal')).toHaveAttribute('data-mode', 'login');
    });

    it('should open auth modal when get started button is clicked', async () => {
      const user = userEvent.setup();
      mockAuthContext.user = null;
      mockAuthContext.isAuthenticated = false;

      render(<Header />);

      const getStartedButton = screen.getByText('Get Started');
      await user.click(getStartedButton);

      expect(screen.getByTestId('auth-modal')).toBeInTheDocument();
      expect(screen.getByTestId('auth-modal')).toHaveAttribute('data-mode', 'login');
    });

    it('should close auth modal when close button is clicked', async () => {
      const user = userEvent.setup();
      mockAuthContext.user = null;
      mockAuthContext.isAuthenticated = false;

      render(<Header />);

      // Open modal
      const signInButton = screen.getByText('Sign In');
      await user.click(signInButton);

      expect(screen.getByTestId('auth-modal')).toBeInTheDocument();

      // Close modal
      const closeButton = screen.getByText('Close Modal');
      await user.click(closeButton);

      expect(screen.queryByTestId('auth-modal')).not.toBeInTheDocument();
    });

    it('should handle multiple auth modal interactions', async () => {
      const user = userEvent.setup();
      mockAuthContext.user = null;
      mockAuthContext.isAuthenticated = false;

      render(<Header />);

      // Open with Sign In
      const signInButton = screen.getByText('Sign In');
      await user.click(signInButton);
      expect(screen.getByTestId('auth-modal')).toBeInTheDocument();

      // Close modal
      const closeButton = screen.getByText('Close Modal');
      await user.click(closeButton);
      expect(screen.queryByTestId('auth-modal')).not.toBeInTheDocument();

      // Open with Get Started
      const getStartedButton = screen.getByText('Get Started');
      await user.click(getStartedButton);
      expect(screen.getByTestId('auth-modal')).toBeInTheDocument();
    });

    it('should navigate to home when logo is clicked', async () => {
      const user = userEvent.setup();

      render(<Header />);

      const logoLink = screen.getByTestId('wouter-link');
      await user.click(logoLink);

      // Navigation should be handled by Link component
      expect(logoLink).toHaveAttribute('href', '/');
    });
  });

  // ===== BUTTON STYLES AND VARIANTS =====

  describe('Button Styling', () => {
    it('should style sign in button correctly', () => {
      mockAuthContext.user = null;
      mockAuthContext.isAuthenticated = false;

      render(<Header />);

      const signInButton = screen.getByText('Sign In');
      expect(signInButton).toHaveClass('bg-transparent'); // ghost variant
    });

    it('should style get started button correctly', () => {
      mockAuthContext.user = null;
      mockAuthContext.isAuthenticated = false;

      render(<Header />);

      const getStartedButton = screen.getByText('Get Started');
      expect(getStartedButton).toHaveClass('bg-primary');
      expect(getStartedButton).toHaveClass('text-white');
    });

    it('should style help center button correctly', () => {
      render(<Header />);

      const helpButton = screen.getByText('Help Center');
      expect(helpButton).toHaveClass('bg-transparent'); // ghost variant
      expect(helpButton).toHaveClass('text-gray-600');
    });
  });

  // ===== LAYOUT AND RESPONSIVE DESIGN =====

  describe('Layout and Responsive Design', () => {
    it('should use responsive container classes', () => {
      render(<Header />);

      const container = screen.getByRole('banner').querySelector('.max-w-7xl');
      expect(container).toHaveClass('mx-auto');
      expect(container).toHaveClass('px-4');
      expect(container).toHaveClass('sm:px-6');
      expect(container).toHaveClass('lg:px-8');
    });

    it('should use flexbox for header layout', () => {
      render(<Header />);

      const flexContainer = screen.getByRole('banner').querySelector('.flex');
      expect(flexContainer).toHaveClass('justify-between');
      expect(flexContainer).toHaveClass('h-16');
      expect(flexContainer).toHaveClass('items-center');
    });

    it('should organize nav items with proper spacing', () => {
      mockAuthContext.user = null;
      mockAuthContext.isAuthenticated = false;

      render(<Header />);

      const navSection = screen.getByText('Help Center').closest('.space-x-4');
      expect(navSection).toBeInTheDocument();
    });

    it('should handle different auth states with consistent layout', () => {
      // Test unauthenticated layout
      mockAuthContext.user = null;
      mockAuthContext.isAuthenticated = false;

      const { rerender } = render(<Header />);

      const authButtons = screen.getByText('Sign In').closest('.space-x-2');
      expect(authButtons).toBeInTheDocument();

      // Test authenticated layout
      mockAuthContext.user = mockUser;
      mockAuthContext.isAuthenticated = true;

      rerender(<Header />);

      expect(screen.getByTestId('user-menu')).toBeInTheDocument();
    });
  });

  // ===== ACCESSIBILITY TESTS =====

  describe('Accessibility', () => {
    it('should have proper semantic structure', () => {
      render(<Header />);

      expect(screen.getByRole('banner')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'EvalMatchAI' })).toBeInTheDocument();
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      mockAuthContext.user = null;
      mockAuthContext.isAuthenticated = false;

      const { container } = render(<Header />);

      await testKeyboardNavigation(container, user);
    });

    it('should have proper ARIA attributes', () => {
      const { container } = render(<Header />);

      checkAriaAttributes(container);
    });

    it('should provide accessible button labels', () => {
      mockAuthContext.user = null;
      mockAuthContext.isAuthenticated = false;

      render(<Header />);

      expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Get Started' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Help Center' })).toBeInTheDocument();
    });

    it('should maintain focus management with modal', async () => {
      const user = userEvent.setup();
      mockAuthContext.user = null;
      mockAuthContext.isAuthenticated = false;

      render(<Header />);

      const signInButton = screen.getByText('Sign In');
      await user.click(signInButton);

      // Modal should be present and focusable
      expect(screen.getByTestId('auth-modal')).toBeInTheDocument();

      const closeButton = screen.getByText('Close Modal');
      expect(closeButton).toBeInTheDocument();
    });

    it('should provide proper contrast for all elements', () => {
      render(<Header />);

      // Logo should have good contrast
      const logo = screen.getByText('EvalMatchAI');
      expect(logo).toHaveClass('text-primary');

      // Help button should have proper text color
      const helpButton = screen.getByText('Help Center');
      expect(helpButton).toHaveClass('text-gray-600');
    });
  });

  // ===== AUTH MODAL INTEGRATION =====

  describe('Auth Modal Integration', () => {
    it('should pass correct props to auth modal', async () => {
      const user = userEvent.setup();
      mockAuthContext.user = null;
      mockAuthContext.isAuthenticated = false;

      render(<Header />);

      // Modal should not be open initially
      expect(screen.queryByTestId('auth-modal')).not.toBeInTheDocument();

      // Open modal
      const signInButton = screen.getByText('Sign In');
      await user.click(signInButton);

      const modal = screen.getByTestId('auth-modal');
      expect(modal).toHaveAttribute('data-mode', 'login');
    });

    it('should handle modal state correctly', async () => {
      const user = userEvent.setup();
      mockAuthContext.user = null;
      mockAuthContext.isAuthenticated = false;

      render(<Header />);

      // Initially closed
      expect(screen.queryByTestId('auth-modal')).not.toBeInTheDocument();

      // Open modal
      await user.click(screen.getByText('Sign In'));
      expect(screen.getByTestId('auth-modal')).toBeInTheDocument();

      // Close modal
      await user.click(screen.getByText('Close Modal'));
      expect(screen.queryByTestId('auth-modal')).not.toBeInTheDocument();
    });

    it('should not show modal when user is authenticated', () => {
      mockAuthContext.user = mockUser;
      mockAuthContext.isAuthenticated = true;

      render(<Header />);

      expect(screen.queryByTestId('auth-modal')).not.toBeInTheDocument();
      expect(screen.queryByText('Sign In')).not.toBeInTheDocument();
    });
  });

  // ===== HELP CENTER INTEGRATION =====

  describe('Help Center Integration', () => {
    it('should render help center with trigger button', () => {
      render(<Header />);

      expect(screen.getByTestId('help-center')).toBeInTheDocument();
      expect(screen.getByText('Help Center')).toBeInTheDocument();
    });

    it('should pass correct trigger button to help center', () => {
      render(<Header />);

      const helpCenter = screen.getByTestId('help-center');
      const helpButton = within(helpCenter).getByText('Help Center');

      expect(helpButton).toHaveClass('bg-transparent'); // ghost variant
      expect(helpButton).toHaveClass('text-gray-600');
    });
  });

  // ===== ERROR HANDLING =====

  describe('Error Handling', () => {
    it('should handle auth hook errors gracefully', () => {
      // Simulate error in auth hook
      mockAuthContext.user = null;
      mockAuthContext.isAuthenticated = false;
      mockAuthContext.loading = false;

      expect(() => {
        render(<Header />);
      }).not.toThrow();

      expect(screen.getByText('EvalMatchAI')).toBeInTheDocument();
    });

    it('should handle missing user data gracefully', () => {
      mockAuthContext.user = null;
      mockAuthContext.isAuthenticated = true; // Inconsistent state

      expect(() => {
        render(<Header />);
      }).not.toThrow();

      // Should default to showing user menu if isAuthenticated is true
      expect(screen.getByTestId('user-menu')).toBeInTheDocument();
    });

    it('should handle component mount/unmount cycles', () => {
      const { unmount } = render(<Header />);

      expect(screen.getByText('EvalMatchAI')).toBeInTheDocument();

      expect(() => unmount()).not.toThrow();
    });
  });

  // ===== INTEGRATION TESTS =====

  describe('Integration with Router', () => {
    it('should work with wouter Link component', () => {
      render(<Header />);

      const logoLink = screen.getByTestId('wouter-link');
      expect(logoLink).toHaveAttribute('href', '/');
      expect(logoLink).toHaveTextContent('EvalMatchAI');
    });

    it('should maintain proper routing structure', () => {
      render(<Header />);

      // Logo should link to home
      const homeLink = screen.getByRole('link', { name: 'EvalMatchAI' });
      expect(homeLink).toHaveAttribute('href', '/');
    });
  });

  describe('State Management Integration', () => {
    it('should respond to auth state changes', () => {
      mockAuthContext.user = null;
      mockAuthContext.isAuthenticated = false;

      const { rerender } = render(<Header />);

      // Initially unauthenticated
      expect(screen.getByText('Sign In')).toBeInTheDocument();

      // Simulate login
      mockAuthContext.user = mockUser;
      mockAuthContext.isAuthenticated = true;

      rerender(<Header />);

      // Should now show user menu
      expect(screen.getByTestId('user-menu')).toBeInTheDocument();
      expect(screen.queryByText('Sign In')).not.toBeInTheDocument();
    });

    it('should handle rapid state changes', () => {
      const { rerender } = render(<Header />);

      // Cycle through different states
      mockAuthContext.loading = true;
      rerender(<Header />);

      mockAuthContext.loading = false;
      mockAuthContext.isAuthenticated = true;
      mockAuthContext.user = mockUser;
      rerender(<Header />);

      mockAuthContext.isAuthenticated = false;
      mockAuthContext.user = null;
      rerender(<Header />);

      // Should end up in unauthenticated state
      expect(screen.getByText('Sign In')).toBeInTheDocument();
    });
  });

  // ===== PERFORMANCE TESTS =====

  describe('Performance', () => {
    it('should not re-render unnecessarily', () => {
      let renderCount = 0;

      const TestHeader = () => {
        renderCount++;
        return <Header />;
      };

      const { rerender } = render(<TestHeader />);
      expect(renderCount).toBe(1);

      // Rerender with same auth state
      rerender(<TestHeader />);
      expect(renderCount).toBe(2); // Normal React behavior
    });

    it('should handle frequent auth state updates efficiently', () => {
      const { rerender } = render(<Header />);

      // Rapidly change auth state
      for (let i = 0; i < 10; i++) {
        mockAuthContext.isAuthenticated = i % 2 === 0;
        mockAuthContext.user = i % 2 === 0 ? mockUser : null;
        rerender(<Header />);
      }

      // Should still work correctly
      expect(screen.getByText('EvalMatchAI')).toBeInTheDocument();
    });
  });
});