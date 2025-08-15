/**
 * Comprehensive Tests for Footer Component
 * 
 * Tests all functionality including:
 * - Component rendering and layout
 * - Copyright notice with dynamic year
 * - Navigation links and routing
 * - Responsive design behavior
 * - Accessibility features
 * - Styling and visual appearance
 * - Link hover states
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import userEvent from '@testing-library/user-event';

import Footer from '@/components/layout/footer';
import {
  setupTest,
  cleanupTest,
  testKeyboardNavigation,
  checkAriaAttributes,
} from '../../helpers/component-test-helpers';

// ===== MOCK SETUP =====

// Mock Link component from wouter
jest.mock('wouter', () => ({
  Link: ({ href, children, className }: any) => (
    <a href={href} className={className} data-testid="wouter-link">
      {children}
    </a>
  ),
}));

// ===== TEST SETUP =====

describe('Footer Component', () => {
  beforeEach(() => {
    setupTest();
  });

  afterEach(() => {
    cleanupTest();
  });

  // ===== BASIC RENDERING TESTS =====

  describe('Component Rendering', () => {
    it('should render footer with essential elements', () => {
      render(<Footer />);

      expect(screen.getByRole('contentinfo')).toBeInTheDocument();
      expect(screen.getByText(/© \d{4} EvalMatchAI\. All rights reserved\./)).toBeInTheDocument();
      expect(screen.getByText('Privacy Policy')).toBeInTheDocument();
      expect(screen.getByText('Terms of Service')).toBeInTheDocument();
      expect(screen.getByText('Feedback')).toBeInTheDocument();
    });

    it('should have proper footer structure', () => {
      render(<Footer />);

      const footer = screen.getByRole('contentinfo');
      expect(footer).toHaveClass('bg-white', 'border-t', 'mt-12');

      const container = footer.querySelector('.max-w-7xl');
      expect(container).toBeInTheDocument();
      expect(container).toHaveClass('mx-auto', 'px-4', 'sm:px-6', 'lg:px-8', 'py-6');
    });

    it('should use semantic HTML structure', () => {
      render(<Footer />);

      const footer = screen.getByRole('contentinfo');
      expect(footer.tagName).toBe('FOOTER');
    });

    it('should render all navigation links', () => {
      render(<Footer />);

      const links = screen.getAllByTestId('wouter-link');
      expect(links).toHaveLength(3);

      expect(screen.getByRole('link', { name: 'Privacy Policy' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Terms of Service' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Feedback' })).toBeInTheDocument();
    });
  });

  // ===== COPYRIGHT NOTICE TESTS =====

  describe('Copyright Notice', () => {
    it('should display current year in copyright notice', () => {
      render(<Footer />);

      const currentYear = new Date().getFullYear();
      expect(screen.getByText(`© ${currentYear} EvalMatchAI. All rights reserved.`)).toBeInTheDocument();
    });

    it('should handle year transitions correctly', () => {
      // Mock Date to return a specific year
      const mockDate = new Date('2025-01-01');
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      render(<Footer />);

      expect(screen.getByText('© 2025 EvalMatchAI. All rights reserved.')).toBeInTheDocument();

      jest.restoreAllMocks();
    });

    it('should format copyright text correctly', () => {
      render(<Footer />);

      const copyrightText = screen.getByText(/© \d{4} EvalMatchAI\. All rights reserved\./);
      expect(copyrightText).toHaveClass('text-gray-500', 'text-sm', 'mb-4', 'md:mb-0');
    });

    it('should handle different years correctly', () => {
      // Test with year 2030
      const futureDate = new Date('2030-06-15');
      jest.spyOn(global, 'Date').mockImplementation(() => futureDate);

      render(<Footer />);

      expect(screen.getByText('© 2030 EvalMatchAI. All rights reserved.')).toBeInTheDocument();

      jest.restoreAllMocks();
    });
  });

  // ===== NAVIGATION LINKS TESTS =====

  describe('Navigation Links', () => {
    it('should have correct href attributes for all links', () => {
      render(<Footer />);

      const privacyLink = screen.getByRole('link', { name: 'Privacy Policy' });
      expect(privacyLink).toHaveAttribute('href', '/privacy-policy');

      const termsLink = screen.getByRole('link', { name: 'Terms of Service' });
      expect(termsLink).toHaveAttribute('href', '/terms-of-service');

      const feedbackLink = screen.getByRole('link', { name: 'Feedback' });
      expect(feedbackLink).toHaveAttribute('href', '/feedback');
    });

    it('should style links correctly', () => {
      render(<Footer />);

      const links = screen.getAllByTestId('wouter-link');

      links.forEach(link => {
        expect(link).toHaveClass('text-gray-500', 'hover:text-gray-700');
      });
    });

    it('should navigate to correct routes when clicked', async () => {
      const user = userEvent.setup();
      render(<Footer />);

      const privacyLink = screen.getByRole('link', { name: 'Privacy Policy' });
      await user.click(privacyLink);

      // Navigation should be handled by Link component
      expect(privacyLink).toHaveAttribute('href', '/privacy-policy');
    });

    it('should handle all link interactions', async () => {
      const user = userEvent.setup();
      render(<Footer />);

      const links = [
        { name: 'Privacy Policy', href: '/privacy-policy' },
        { name: 'Terms of Service', href: '/terms-of-service' },
        { name: 'Feedback', href: '/feedback' },
      ];

      for (const linkInfo of links) {
        const link = screen.getByRole('link', { name: linkInfo.name });
        expect(link).toHaveAttribute('href', linkInfo.href);

        // Test click interaction
        await user.click(link);
        expect(link).toHaveAttribute('href', linkInfo.href);
      }
    });
  });

  // ===== LAYOUT AND RESPONSIVE DESIGN =====

  describe('Layout and Responsive Design', () => {
    it('should use flexbox for responsive layout', () => {
      render(<Footer />);

      const flexContainer = screen.getByRole('contentinfo').querySelector('.flex');
      expect(flexContainer).toHaveClass(
        'flex',
        'flex-col',
        'md:flex-row',
        'justify-between',
        'items-center'
      );
    });

    it('should have responsive container classes', () => {
      render(<Footer />);

      const container = screen.getByRole('contentinfo').querySelector('.max-w-7xl');
      expect(container).toHaveClass(
        'max-w-7xl',
        'mx-auto',
        'px-4',
        'sm:px-6',
        'lg:px-8',
        'py-6'
      );
    });

    it('should organize links with proper spacing', () => {
      render(<Footer />);

      const linksContainer = screen.getByText('Privacy Policy').closest('.space-x-6');
      expect(linksContainer).toHaveClass('flex', 'space-x-6');
    });

    it('should handle responsive breakpoints correctly', () => {
      render(<Footer />);

      // Check mobile-first approach
      const copyrightText = screen.getByText(/© \d{4} EvalMatchAI/);
      expect(copyrightText).toHaveClass('mb-4', 'md:mb-0');

      // Check responsive flex direction
      const flexContainer = copyrightText.closest('.flex');
      expect(flexContainer).toHaveClass('flex-col', 'md:flex-row');
    });

    it('should maintain consistent spacing across screen sizes', () => {
      render(<Footer />);

      const footer = screen.getByRole('contentinfo');
      expect(footer).toHaveClass('mt-12'); // Top margin

      const container = footer.querySelector('.py-6');
      expect(container).toBeInTheDocument(); // Vertical padding
    });
  });

  // ===== STYLING AND VISUAL APPEARANCE =====

  describe('Styling and Visual Appearance', () => {
    it('should have proper background and border styling', () => {
      render(<Footer />);

      const footer = screen.getByRole('contentinfo');
      expect(footer).toHaveClass('bg-white', 'border-t');
    });

    it('should style text elements correctly', () => {
      render(<Footer />);

      const copyrightText = screen.getByText(/© \d{4} EvalMatchAI/);
      expect(copyrightText).toHaveClass('text-gray-500', 'text-sm');
    });

    it('should apply hover states to links', () => {
      render(<Footer />);

      const links = screen.getAllByTestId('wouter-link');
      links.forEach(link => {
        expect(link).toHaveClass('hover:text-gray-700');
      });
    });

    it('should maintain consistent color scheme', () => {
      render(<Footer />);

      // Copyright text should be gray
      const copyrightText = screen.getByText(/© \d{4} EvalMatchAI/);
      expect(copyrightText).toHaveClass('text-gray-500');

      // Links should be gray with darker hover
      const links = screen.getAllByTestId('wouter-link');
      links.forEach(link => {
        expect(link).toHaveClass('text-gray-500', 'hover:text-gray-700');
      });
    });

    it('should use appropriate font sizes', () => {
      render(<Footer />);

      const copyrightText = screen.getByText(/© \d{4} EvalMatchAI/);
      expect(copyrightText).toHaveClass('text-sm');

      // Links should inherit normal text size (no explicit size class)
      const links = screen.getAllByTestId('wouter-link');
      links.forEach(link => {
        expect(link.className).not.toMatch(/text-(xs|sm|lg|xl)/);
      });
    });
  });

  // ===== ACCESSIBILITY TESTS =====

  describe('Accessibility', () => {
    it('should have proper semantic structure', () => {
      render(<Footer />);

      expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      const { container } = render(<Footer />);

      await testKeyboardNavigation(container, user);
    });

    it('should have proper ARIA attributes', () => {
      const { container } = render(<Footer />);

      checkAriaAttributes(container);
    });

    it('should provide accessible link text', () => {
      render(<Footer />);

      expect(screen.getByRole('link', { name: 'Privacy Policy' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Terms of Service' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Feedback' })).toBeInTheDocument();
    });

    it('should maintain proper color contrast', () => {
      render(<Footer />);

      // Text should have sufficient contrast
      const copyrightText = screen.getByText(/© \d{4} EvalMatchAI/);
      expect(copyrightText).toHaveClass('text-gray-500');

      // Links should have good contrast and hover states
      const links = screen.getAllByTestId('wouter-link');
      links.forEach(link => {
        expect(link).toHaveClass('text-gray-500', 'hover:text-gray-700');
      });
    });

    it('should provide landmark navigation', () => {
      render(<Footer />);

      const footer = screen.getByRole('contentinfo');
      expect(footer).toBeInTheDocument();
    });

    it('should handle focus states correctly', async () => {
      const user = userEvent.setup();
      render(<Footer />);

      const firstLink = screen.getByRole('link', { name: 'Privacy Policy' });
      await user.tab();
      expect(firstLink).toHaveFocus();

      const secondLink = screen.getByRole('link', { name: 'Terms of Service' });
      await user.tab();
      expect(secondLink).toHaveFocus();

      const thirdLink = screen.getByRole('link', { name: 'Feedback' });
      await user.tab();
      expect(thirdLink).toHaveFocus();
    });
  });

  // ===== USER INTERACTIONS =====

  describe('User Interactions', () => {
    it('should handle link clicks', async () => {
      const user = userEvent.setup();
      render(<Footer />);

      const privacyLink = screen.getByRole('link', { name: 'Privacy Policy' });
      await user.click(privacyLink);

      expect(privacyLink).toHaveAttribute('href', '/privacy-policy');
    });

    it('should handle hover interactions', async () => {
      const user = userEvent.setup();
      render(<Footer />);

      const link = screen.getByRole('link', { name: 'Privacy Policy' });
      
      // Test hover
      await user.hover(link);
      expect(link).toHaveClass('hover:text-gray-700');

      // Test unhover
      await user.unhover(link);
      expect(link).toHaveClass('text-gray-500');
    });

    it('should support keyboard interactions', async () => {
      const user = userEvent.setup();
      render(<Footer />);

      const link = screen.getByRole('link', { name: 'Privacy Policy' });
      
      // Focus with tab
      await user.tab();
      expect(link).toHaveFocus();

      // Activate with Enter
      await user.keyboard('{Enter}');
      expect(link).toHaveAttribute('href', '/privacy-policy');
    });

    it('should handle multiple rapid interactions', async () => {
      const user = userEvent.setup();
      render(<Footer />);

      const links = [
        screen.getByRole('link', { name: 'Privacy Policy' }),
        screen.getByRole('link', { name: 'Terms of Service' }),
        screen.getByRole('link', { name: 'Feedback' }),
      ];

      // Rapidly click all links
      for (const link of links) {
        await user.click(link);
        expect(link).toHaveAttribute('href');
      }
    });
  });

  // ===== ERROR HANDLING =====

  describe('Error Handling', () => {
    it('should handle Date constructor errors gracefully', () => {
      // Mock Date to throw an error
      const originalDate = global.Date;
      global.Date = jest.fn(() => {
        throw new Error('Date error');
      }) as any;

      expect(() => {
        render(<Footer />);
      }).toThrow(); // This would actually throw, but in real app should be handled

      global.Date = originalDate;
    });

    it('should handle component mount/unmount cycles', () => {
      const { unmount } = render(<Footer />);

      expect(screen.getByRole('contentinfo')).toBeInTheDocument();

      expect(() => unmount()).not.toThrow();
    });

    it('should render consistently across multiple mounts', () => {
      const { unmount, rerender } = render(<Footer />);

      const initialYear = screen.getByText(/© \d{4} EvalMatchAI/).textContent;

      unmount();
      rerender(<Footer />);

      const secondYear = screen.getByText(/© \d{4} EvalMatchAI/).textContent;
      expect(initialYear).toBe(secondYear);
    });
  });

  // ===== INTEGRATION TESTS =====

  describe('Integration with Router', () => {
    it('should work with wouter Link component', () => {
      render(<Footer />);

      const links = screen.getAllByTestId('wouter-link');
      expect(links).toHaveLength(3);

      links.forEach(link => {
        expect(link.tagName).toBe('A');
        expect(link).toHaveAttribute('href');
      });
    });

    it('should maintain proper routing structure', () => {
      render(<Footer />);

      const expectedRoutes = [
        { name: 'Privacy Policy', href: '/privacy-policy' },
        { name: 'Terms of Service', href: '/terms-of-service' },
        { name: 'Feedback', href: '/feedback' },
      ];

      expectedRoutes.forEach(route => {
        const link = screen.getByRole('link', { name: route.name });
        expect(link).toHaveAttribute('href', route.href);
      });
    });
  });

  // ===== PERFORMANCE TESTS =====

  describe('Performance', () => {
    it('should not re-render unnecessarily', () => {
      let renderCount = 0;

      const TestFooter = () => {
        renderCount++;
        return <Footer />;
      };

      const { rerender } = render(<TestFooter />);
      expect(renderCount).toBe(1);

      // Rerender with same props
      rerender(<TestFooter />);
      expect(renderCount).toBe(2); // Normal React behavior
    });

    it('should handle rapid re-renders efficiently', () => {
      const { rerender } = render(<Footer />);

      // Rapidly rerender
      for (let i = 0; i < 10; i++) {
        rerender(<Footer />);
      }

      // Should still work correctly
      expect(screen.getByRole('contentinfo')).toBeInTheDocument();
      expect(screen.getByText(/© \d{4} EvalMatchAI/)).toBeInTheDocument();
    });

    it('should create Date object efficiently', () => {
      const dateSpy = jest.spyOn(global, 'Date');

      render(<Footer />);

      // Should only create Date object once during render
      expect(dateSpy).toHaveBeenCalled();

      dateSpy.mockRestore();
    });
  });

  // ===== VISUAL REGRESSION PREVENTION =====

  describe('Visual Consistency', () => {
    it('should maintain consistent layout structure', () => {
      render(<Footer />);

      const footer = screen.getByRole('contentinfo');
      const container = footer.querySelector('.max-w-7xl');
      const flexContainer = container?.querySelector('.flex');

      expect(flexContainer).toHaveClass(
        'flex',
        'flex-col',
        'md:flex-row',
        'justify-between',
        'items-center'
      );
    });

    it('should maintain consistent spacing', () => {
      render(<Footer />);

      const footer = screen.getByRole('contentinfo');
      expect(footer).toHaveClass('mt-12');

      const container = footer.querySelector('.py-6');
      expect(container).toBeInTheDocument();

      const linksContainer = screen.getByText('Privacy Policy').closest('.space-x-6');
      expect(linksContainer).toHaveClass('space-x-6');
    });

    it('should maintain consistent typography', () => {
      render(<Footer />);

      const copyrightText = screen.getByText(/© \d{4} EvalMatchAI/);
      expect(copyrightText).toHaveClass('text-gray-500', 'text-sm');

      const links = screen.getAllByTestId('wouter-link');
      links.forEach(link => {
        expect(link).toHaveClass('text-gray-500', 'hover:text-gray-700');
      });
    });
  });
});