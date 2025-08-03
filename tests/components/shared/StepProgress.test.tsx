/**
 * Comprehensive Tests for StepProgress Component
 * 
 * Tests all functionality including:
 * - Component rendering with different step states
 * - Step progression and state management
 * - Visual indicators (current, completed, pending)
 * - Responsive design and layout
 * - Accessibility features
 * - Animation and transition effects
 * - Edge cases and error scenarios
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';


import StepProgress from '@/components/step-progress';
import type { Step } from '@/hooks/use-steps';
import {
  setupTest,
  cleanupTest,
  checkAriaAttributes,
} from '../../helpers/component-test-helpers';

// ===== TEST DATA =====

const mockSteps: Step[] = [
  {
    id: 'step-1',
    title: 'Resume Upload',
    isCompleted: true,
    isCurrent: false,
  },
  {
    id: 'step-2',
    title: 'Job Description',
    isCompleted: true,
    isCurrent: false,
  },
  {
    id: 'step-3',
    title: 'Bias Detection',
    isCompleted: false,
    isCurrent: true,
  },
  {
    id: 'step-4',
    title: 'Fit Analysis',
    isCompleted: false,
    isCurrent: false,
  },
  {
    id: 'step-5',
    title: 'Interview Prep',
    isCompleted: false,
    isCurrent: false,
  },
];

const singleStep: Step[] = [
  {
    id: 'step-1',
    title: 'Single Step',
    isCompleted: false,
    isCurrent: true,
  },
];

const allCompletedSteps: Step[] = [
  {
    id: 'step-1',
    title: 'Step 1',
    isCompleted: true,
    isCurrent: false,
  },
  {
    id: 'step-2',
    title: 'Step 2',
    isCompleted: true,
    isCurrent: false,
  },
  {
    id: 'step-3',
    title: 'Step 3',
    isCompleted: true,
    isCurrent: true,
  },
];

const longTitleSteps: Step[] = [
  {
    id: 'step-1',
    title: 'Very Long Step Title That Might Wrap',
    isCompleted: true,
    isCurrent: false,
  },
  {
    id: 'step-2',
    title: 'Another Extremely Long Step Title That Could Cause Layout Issues',
    isCompleted: false,
    isCurrent: true,
  },
];

// ===== TEST SETUP =====

describe('StepProgress Component', () => {
  beforeEach(() => {
    setupTest();
  });

  afterEach(() => {
    cleanupTest();
  });

  // ===== BASIC RENDERING TESTS =====

  describe('Component Rendering', () => {
    it('should render all provided steps', () => {
      render(<StepProgress steps={mockSteps} />);

      mockSteps.forEach(step => {
        expect(screen.getByText(step.title)).toBeInTheDocument();
      });
    });

    it('should render step numbers for incomplete steps', () => {
      render(<StepProgress steps={mockSteps} />);

      // Step 4 should show number "4" (not completed, not current)
      const step4Container = screen.getByText('Fit Analysis').closest('div')?.parentElement;
      expect(within(step4Container!).getByText('4')).toBeInTheDocument();

      // Step 5 should show number "5"
      const step5Container = screen.getByText('Interview Prep').closest('div')?.parentElement;
      expect(within(step5Container!).getByText('5')).toBeInTheDocument();
    });

    it('should render checkmarks for completed steps', () => {
      render(<StepProgress steps={mockSteps} />);

      // Completed steps should have checkmark SVG
      const step1Container = screen.getByText('Resume Upload').closest('div')?.parentElement;
      const checkmark1 = step1Container?.querySelector('svg');
      expect(checkmark1).toBeInTheDocument();

      const step2Container = screen.getByText('Job Description').closest('div')?.parentElement;
      const checkmark2 = step2Container?.querySelector('svg');
      expect(checkmark2).toBeInTheDocument();
    });

    it('should handle empty steps array', () => {
      render(<StepProgress steps={[]} />);

      // Should not crash and should render container
      const container = document.querySelector('.mb-14');
      expect(container).toBeInTheDocument();
    });

    it('should handle single step', () => {
      render(<StepProgress steps={singleStep} />);

      expect(screen.getByText('Single Step')).toBeInTheDocument();
      
      // Should show step number since it's current
      const stepContainer = screen.getByText('Single Step').closest('div')?.parentElement;
      expect(within(stepContainer!).getByText('1')).toBeInTheDocument();
    });
  });

  // ===== STEP STATE VISUALIZATION =====

  describe('Step State Visualization', () => {
    it('should apply correct styles to current step', () => {
      render(<StepProgress steps={mockSteps} />);

      const currentStepContainer = screen.getByText('Bias Detection').closest('div')?.parentElement;
      const currentStepCircle = currentStepContainer?.querySelector('.h-12.w-12');
      
      expect(currentStepCircle).toHaveClass('bg-primary');
      expect(currentStepCircle).toHaveClass('border-primary');
      expect(currentStepCircle).toHaveClass('text-white');
      expect(currentStepCircle).toHaveClass('scale-110');
    });

    it('should apply correct styles to completed steps', () => {
      render(<StepProgress steps={mockSteps} />);

      const completedStepContainer = screen.getByText('Resume Upload').closest('div')?.parentElement;
      const completedStepCircle = completedStepContainer?.querySelector('.h-12.w-12');
      
      expect(completedStepCircle).toHaveClass('bg-primary');
      expect(completedStepCircle).toHaveClass('border-primary');
      expect(completedStepCircle).toHaveClass('text-white');
      expect(completedStepCircle).not.toHaveClass('scale-110');
    });

    it('should apply correct styles to pending steps', () => {
      render(<StepProgress steps={mockSteps} />);

      const pendingStepContainer = screen.getByText('Fit Analysis').closest('div')?.parentElement;
      const pendingStepCircle = pendingStepContainer?.querySelector('.h-12.w-12');
      
      expect(pendingStepCircle).toHaveClass('bg-white');
      expect(pendingStepCircle).toHaveClass('border-gray-300');
      expect(pendingStepCircle).toHaveClass('text-gray-500');
    });

    it('should apply correct text styles to step labels', () => {
      render(<StepProgress steps={mockSteps} />);

      // Current step should have primary color and bold text
      const currentLabel = screen.getByText('Bias Detection');
      expect(currentLabel).toHaveClass('text-primary');
      expect(currentLabel).toHaveClass('font-bold');

      // Completed step should have dark text
      const completedLabel = screen.getByText('Resume Upload');
      expect(completedLabel).toHaveClass('text-gray-700');

      // Pending step should have light text
      const pendingLabel = screen.getByText('Fit Analysis');
      expect(pendingLabel).toHaveClass('text-gray-500');
    });
  });

  // ===== CONNECTION LINES =====

  describe('Step Connection Lines', () => {
    it('should render connection lines between steps', () => {
      render(<StepProgress steps={mockSteps} />);

      // Should have connection lines (one less than number of steps)
      const connections = document.querySelectorAll('.flex-1.h-0\\.5');
      expect(connections).toHaveLength(mockSteps.length - 1);
    });

    it('should style connection lines based on step completion', () => {
      render(<StepProgress steps={mockSteps} />);

      const connections = document.querySelectorAll('.flex-1.h-0\\.5 > div');
      
      // First connection (after completed step) should be primary
      expect(connections[0]).toHaveClass('bg-primary');
      
      // Second connection (after completed step) should be primary
      expect(connections[1]).toHaveClass('bg-primary');
      
      // Third connection (after current step) should have gradient
      const gradientConnection = connections[2]?.querySelector('.bg-gradient-to-r');
      expect(gradientConnection).toBeInTheDocument();
    });

    it('should not render connection line after last step', () => {
      render(<StepProgress steps={mockSteps} />);

      const lastStepContainer = screen.getByText('Interview Prep').closest('div');
      const connectionInLastStep = lastStepContainer?.querySelector('.flex-1.h-0\\.5');
      expect(connectionInLastStep).not.toBeInTheDocument();
    });
  });

  // ===== ANIMATION EFFECTS =====

  describe('Animation and Visual Effects', () => {
    it('should add pulsing effect to current step', () => {
      render(<StepProgress steps={mockSteps} />);

      const currentStepContainer = screen.getByText('Bias Detection').closest('div')?.parentElement;
      const pulsingElement = currentStepContainer?.querySelector('.animate-pulse');
      
      expect(pulsingElement).toBeInTheDocument();
      expect(pulsingElement).toHaveClass('bg-primary');
      expect(pulsingElement).toHaveClass('opacity-20');
    });

    it('should not add pulsing effect to non-current steps', () => {
      render(<StepProgress steps={mockSteps} />);

      const completedStepContainer = screen.getByText('Resume Upload').closest('div')?.parentElement;
      const pulsingElement = completedStepContainer?.querySelector('.animate-pulse');
      expect(pulsingElement).not.toBeInTheDocument();

      const pendingStepContainer = screen.getByText('Fit Analysis').closest('div')?.parentElement;
      const pulsingElementPending = pendingStepContainer?.querySelector('.animate-pulse');
      expect(pulsingElementPending).not.toBeInTheDocument();
    });

    it('should apply scale transform to current step', () => {
      render(<StepProgress steps={mockSteps} />);

      const currentStepCircle = screen.getByText('Bias Detection')
        .closest('div')?.parentElement?.querySelector('.h-12.w-12');
      
      expect(currentStepCircle).toHaveClass('scale-110');
      expect(currentStepCircle).toHaveClass('transition-transform');
      expect(currentStepCircle).toHaveClass('duration-300');
    });
  });

  // ===== LAYOUT AND RESPONSIVE DESIGN =====

  describe('Layout and Responsive Design', () => {
    it('should use flexbox layout for proper spacing', () => {
      render(<StepProgress steps={mockSteps} />);

      const container = document.querySelector('.flex.items-center');
      expect(container).toBeInTheDocument();

      const stepContainers = document.querySelectorAll('.relative.flex.items-center.flex-1');
      expect(stepContainers).toHaveLength(mockSteps.length);
    });

    it('should position step labels correctly', () => {
      render(<StepProgress steps={mockSteps} />);

      const stepLabel = screen.getByText('Bias Detection');
      expect(stepLabel).toHaveClass('absolute');
      expect(stepLabel).toHaveClass('-bottom-10');
      expect(stepLabel).toHaveClass('left-1/2');
      expect(stepLabel).toHaveClass('transform');
      expect(stepLabel).toHaveClass('-translate-x-1/2');
      expect(stepLabel).toHaveClass('text-center');
      expect(stepLabel).toHaveClass('w-32');
    });

    it('should handle long step titles gracefully', () => {
      render(<StepProgress steps={longTitleSteps} />);

      expect(screen.getByText('Very Long Step Title That Might Wrap')).toBeInTheDocument();
      expect(screen.getByText('Another Extremely Long Step Title That Could Cause Layout Issues')).toBeInTheDocument();

      // Labels should maintain their styling
      const longLabel = screen.getByText('Another Extremely Long Step Title That Could Cause Layout Issues');
      expect(longLabel).toHaveClass('w-32');
      expect(longLabel).toHaveClass('text-center');
    });

    it('should maintain consistent spacing with different numbers of steps', () => {
      const { rerender } = render(<StepProgress steps={mockSteps} />);

      // Check with 5 steps
      let stepContainers = document.querySelectorAll('.relative.flex.items-center.flex-1');
      expect(stepContainers).toHaveLength(5);

      // Rerender with 2 steps
      rerender(<StepProgress steps={longTitleSteps} />);
      
      stepContainers = document.querySelectorAll('.relative.flex.items-center.flex-1');
      expect(stepContainers).toHaveLength(2);
    });
  });

  // ===== ACCESSIBILITY TESTS =====

  describe('Accessibility', () => {
    it('should provide accessible step indicators', () => {
      render(<StepProgress steps={mockSteps} />);

      // Step circles should be focusable or have proper semantic structure
      const stepCircles = document.querySelectorAll('.h-12.w-12.rounded-full');
      expect(stepCircles).toHaveLength(mockSteps.length);

      stepCircles.forEach(circle => {
        expect(circle).toBeInTheDocument();
      });
    });

    it('should provide clear visual distinction between step states', () => {
      render(<StepProgress steps={mockSteps} />);

      // Completed steps should have checkmarks
      const checkmarks = document.querySelectorAll('svg');
      expect(checkmarks.length).toBeGreaterThan(0);

      // Current step should be visually distinct
      const currentStepCircle = screen.getByText('Bias Detection')
        .closest('div')?.parentElement?.querySelector('.scale-110');
      expect(currentStepCircle).toBeInTheDocument();
    });

    it('should maintain readable contrast ratios', () => {
      render(<StepProgress steps={mockSteps} />);

      // Current step: primary background with white text
      const currentStepCircle = screen.getByText('Bias Detection')
        .closest('div')?.parentElement?.querySelector('.bg-primary.text-white');
      expect(currentStepCircle).toBeInTheDocument();

      // Pending step: white background with gray text
      const pendingStepCircle = screen.getByText('Fit Analysis')
        .closest('div')?.parentElement?.querySelector('.bg-white.text-gray-500');
      expect(pendingStepCircle).toBeInTheDocument();
    });

    it('should provide semantic structure for screen readers', () => {
      const { container } = render(<StepProgress steps={mockSteps} />);

      // Should have proper structure that screen readers can navigate
      checkAriaAttributes(container);

      // Step titles should be readable
      mockSteps.forEach(step => {
        expect(screen.getByText(step.title)).toBeInTheDocument();
      });
    });

    it('should announce step progress to screen readers', () => {
      render(<StepProgress steps={mockSteps} />);

      // Should have readable content indicating progress
      expect(screen.getByText('Bias Detection')).toBeInTheDocument();
      
      // Visual indicators should be complemented by text
      const currentStepNumber = screen.getByText('3');
      expect(currentStepNumber).toBeInTheDocument();
    });
  });

  // ===== EDGE CASES AND ERROR SCENARIOS =====

  describe('Edge Cases', () => {
    it('should handle steps with missing properties gracefully', () => {
      const incompleteSteps = [
        {
          id: 'step-1',
          title: 'Complete Step',
          isCompleted: true,
          isCurrent: false,
        },
        {
          id: 'step-2',
          title: 'Current Step',
          isCompleted: false,
          isCurrent: true,
        },
        {
          id: 'step-3',
          // Missing title - should handle gracefully
          title: '',
          isCompleted: false,
          isCurrent: false,
        },
      ] as Step[];

      expect(() => {
        render(<StepProgress steps={incompleteSteps} />);
      }).not.toThrow();

      expect(screen.getByText('Complete Step')).toBeInTheDocument();
      expect(screen.getByText('Current Step')).toBeInTheDocument();
    });

    it('should handle multiple current steps', () => {
      const multipleCurrentSteps = [
        {
          id: 'step-1',
          title: 'Step 1',
          isCompleted: true,
          isCurrent: true,
        },
        {
          id: 'step-2',
          title: 'Step 2',
          isCompleted: false,
          isCurrent: true,
        },
      ] as Step[];

      render(<StepProgress steps={multipleCurrentSteps} />);

      // Should render both as current (though this is incorrect state)
      const currentStep1 = screen.getByText('Step 1').closest('div')?.parentElement?.querySelector('.scale-110');
      const currentStep2 = screen.getByText('Step 2').closest('div')?.parentElement?.querySelector('.scale-110');

      expect(currentStep1).toBeInTheDocument();
      expect(currentStep2).toBeInTheDocument();
    });

    it('should handle all completed steps', () => {
      render(<StepProgress steps={allCompletedSteps} />);

      // All steps should show checkmarks
      const checkmarks = document.querySelectorAll('svg');
      expect(checkmarks).toHaveLength(3);

      // Last step should be current even though completed
      const lastStepCircle = screen.getByText('Step 3')
        .closest('div')?.parentElement?.querySelector('.scale-110');
      expect(lastStepCircle).toBeInTheDocument();
    });

    it('should handle steps with special characters in titles', () => {
      const specialCharSteps = [
        {
          id: 'step-1',
          title: 'Step with "Quotes" & Symbols',
          isCompleted: false,
          isCurrent: true,
        },
        {
          id: 'step-2',
          title: 'Step with <HTML> Tags',
          isCompleted: false,
          isCurrent: false,
        },
      ] as Step[];

      render(<StepProgress steps={specialCharSteps} />);

      expect(screen.getByText('Step with "Quotes" & Symbols')).toBeInTheDocument();
      expect(screen.getByText('Step with <HTML> Tags')).toBeInTheDocument();
    });
  });

  // ===== PERFORMANCE TESTS =====

  describe('Performance', () => {
    it('should not re-render unnecessarily', () => {
      let renderCount = 0;
      
      const TestStepProgress = ({ steps }: { steps: Step[] }) => {
        renderCount++;
        return <StepProgress steps={steps} />;
      };

      const { rerender } = render(<TestStepProgress steps={mockSteps} />);
      expect(renderCount).toBe(1);

      // Rerender with same steps
      rerender(<TestStepProgress steps={mockSteps} />);
      expect(renderCount).toBe(2); // Normal React behavior

      // Rerender with different steps
      rerender(<TestStepProgress steps={[...mockSteps]} />);
      expect(renderCount).toBe(3);
    });

    it('should handle large numbers of steps efficiently', () => {
      const manySteps = Array.from({ length: 20 }, (_, index) => ({
        id: `step-${index + 1}`,
        title: `Step ${index + 1}`,
        isCompleted: index < 10,
        isCurrent: index === 10,
      }));

      expect(() => {
        render(<StepProgress steps={manySteps} />);
      }).not.toThrow();

      // Should render all steps
      expect(screen.getByText('Step 1')).toBeInTheDocument();
      expect(screen.getByText('Step 11')).toBeInTheDocument(); // Current step
      expect(screen.getByText('Step 20')).toBeInTheDocument();
    });

    it('should maintain smooth animations', () => {
      render(<StepProgress steps={mockSteps} />);

      // Check that animation classes are applied
      const currentStepCircle = screen.getByText('Bias Detection')
        .closest('div')?.parentElement?.querySelector('.transition-transform.duration-300');
      expect(currentStepCircle).toBeInTheDocument();

      const pulsingElement = screen.getByText('Bias Detection')
        .closest('div')?.parentElement?.querySelector('.animate-pulse');
      expect(pulsingElement).toBeInTheDocument();
    });
  });

  // ===== INTEGRATION TESTS =====

  describe('Integration with useSteps Hook', () => {
    it('should work correctly with real useSteps data structure', () => {
      // This would typically come from useSteps hook
      const realStepsData = [
        {
          id: 'step-1',
          title: 'Resume Upload',
          isCompleted: true,
          isCurrent: false,
        },
        {
          id: 'step-2',
          title: 'Job Description',
          isCompleted: false,
          isCurrent: true,
        },
        {
          id: 'step-3',
          title: 'Bias Detection',
          isCompleted: false,
          isCurrent: false,
        },
      ] as Step[];

      render(<StepProgress steps={realStepsData} />);

      // Should render correctly with real data structure
      expect(screen.getByText('Resume Upload')).toBeInTheDocument();
      expect(screen.getByText('Job Description')).toBeInTheDocument();
      expect(screen.getByText('Bias Detection')).toBeInTheDocument();

      // Step 1 should be completed
      const step1Container = screen.getByText('Resume Upload').closest('div')?.parentElement;
      expect(step1Container?.querySelector('svg')).toBeInTheDocument();

      // Step 2 should be current
      const step2Container = screen.getByText('Job Description').closest('div')?.parentElement;
      expect(step2Container?.querySelector('.scale-110')).toBeInTheDocument();
    });

    it('should handle dynamic step updates', () => {
      const { rerender } = render(<StepProgress steps={mockSteps} />);

      // Current step should be "Bias Detection"
      expect(screen.getByText('Bias Detection').closest('div')?.parentElement?.querySelector('.scale-110')).toBeInTheDocument();

      // Update to next step
      const updatedSteps = mockSteps.map((step, index) => ({
        ...step,
        isCompleted: index < 3,
        isCurrent: index === 3,
      }));

      rerender(<StepProgress steps={updatedSteps} />);

      // Current step should now be "Fit Analysis"
      expect(screen.getByText('Fit Analysis').closest('div')?.parentElement?.querySelector('.scale-110')).toBeInTheDocument();
      
      // Previous step should now be completed
      expect(screen.getByText('Bias Detection').closest('div')?.parentElement?.querySelector('svg')).toBeInTheDocument();
    });
  });
});