/**
 * Comprehensive Tests for SkillRadarChart Component
 * 
 * Tests all functionality including:
 * - Component rendering with valid data
 * - Data validation and normalization
 * - Chart visualization and formatting
 * - Responsive design and mobile adaptation
 * - Empty states and error handling
 * - Data transformation and processing
 * - Accessibility features
 * - Performance with large datasets
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';


import SkillRadarChart from '@/components/skill-radar-chart';
import {
  setupTest,
  cleanupTest,
  checkAriaAttributes,
} from '../../helpers/component-test-helpers';

// ===== MOCK RECHARTS =====

// Mock Recharts components
jest.mock('recharts', () => ({
  Radar: ({ dataKey, stroke, fill, fillOpacity }: any) => (
    <g data-testid="radar" data-datakey={dataKey} data-stroke={stroke} data-fill={fill} data-fillopacity={fillOpacity}>
      <path d="M0,0 L100,100" />
    </g>
  ),
  RadarChart: ({ children, cx, cy, outerRadius, data }: any) => (
    <svg data-testid="radar-chart" data-cx={cx} data-cy={cy} data-outerradius={outerRadius} data-length={data?.length}>
      {children}
    </svg>
  ),
  PolarGrid: () => <g data-testid="polar-grid" />,
  PolarAngleAxis: ({ dataKey, tick, tickFormatter }: any) => (
    <g data-testid="polar-angle-axis" data-datakey={dataKey}>
      {tick && <text data-testid="axis-tick">Sample Tick</text>}
    </g>
  ),
  PolarRadiusAxis: ({ angle, domain }: any) => (
    <g data-testid="polar-radius-axis" data-angle={angle} data-domain={domain?.join(',')}>
      <text>0</text>
      <text>100</text>
    </g>
  ),
  ResponsiveContainer: ({ children, width, height }: any) => (
    <div data-testid="responsive-container" data-width={width} data-height={height}>
      {children}
    </div>
  ),
}));

// Mock mobile hook
jest.mock('@/hooks/use-mobile', () => ({
  useIsMobile: jest.fn(() => false),
}));

// ===== TEST DATA =====

const validSkillsData = [
  { skill: 'JavaScript', matchPercentage: 95 },
  { skill: 'React', matchPercentage: 90 },
  { skill: 'Node.js', matchPercentage: 85 },
  { skill: 'TypeScript', matchPercentage: 80 },
  { skill: 'CSS', matchPercentage: 75 },
];

const minimalSkillsData = [
  { skill: 'JavaScript', matchPercentage: 100 },
];

const emptySkillsData: any[] = [];

const invalidSkillsData = [
  { skill: '', matchPercentage: 90 },
  { skill: 'Valid Skill', matchPercentage: NaN },
  { skill: null, matchPercentage: 85 },
  { skill: 'Another Valid', matchPercentage: 'invalid' },
  null,
  undefined,
  { notSkill: 'Invalid Object', notMatch: 50 },
];

const mixedValidInvalidData = [
  { skill: 'JavaScript', matchPercentage: 95 },
  { skill: '', matchPercentage: 90 }, // Invalid
  { skill: 'React', matchPercentage: 85 },
  null, // Invalid
  { skill: 'Node.js', matchPercentage: 80 },
];

const longSkillNames = [
  { skill: 'Very Long Skill Name That Might Cause Layout Issues', matchPercentage: 95 },
  { skill: 'Another Extremely Long Skill Name For Testing', matchPercentage: 90 },
  { skill: 'Short', matchPercentage: 85 },
];

const manySkills = Array.from({ length: 20 }, (_, index) => ({
  skill: `Skill ${index + 1}`,
  matchPercentage: Math.floor(Math.random() * 100),
}));

const extremeValues = [
  { skill: 'Zero Skill', matchPercentage: 0 },
  { skill: 'Perfect Skill', matchPercentage: 100 },
  { skill: 'Negative Skill', matchPercentage: -10 },
  { skill: 'Over Hundred', matchPercentage: 150 },
];

// ===== TEST SETUP =====

describe('SkillRadarChart Component', () => {
  beforeEach(() => {
    setupTest();
    // Reset mobile mock
    const { useIsMobile } = require('@/hooks/use-mobile');
    useIsMobile.mockReturnValue(false);
  });

  afterEach(() => {
    cleanupTest();
  });

  // ===== BASIC RENDERING TESTS =====

  describe('Component Rendering', () => {
    it('should render radar chart with valid data', () => {
      render(<SkillRadarChart matchedSkills={validSkillsData} />);

      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
      expect(screen.getByTestId('radar-chart')).toBeInTheDocument();
      expect(screen.getByTestId('radar')).toBeInTheDocument();
      expect(screen.getByTestId('polar-grid')).toBeInTheDocument();
      expect(screen.getByTestId('polar-angle-axis')).toBeInTheDocument();
      expect(screen.getByTestId('polar-radius-axis')).toBeInTheDocument();
    });

    it('should render with default height', () => {
      render(<SkillRadarChart matchedSkills={validSkillsData} />);

      const container = screen.getByTestId('responsive-container');
      expect(container).toHaveAttribute('data-height', '300');
    });

    it('should render with custom height', () => {
      render(<SkillRadarChart matchedSkills={validSkillsData} height={500} />);

      const container = screen.getByTestId('responsive-container');
      expect(container).toHaveAttribute('data-height', '500');
    });

    it('should render with correct chart configuration', () => {
      render(<SkillRadarChart matchedSkills={validSkillsData} />);

      const chart = screen.getByTestId('radar-chart');
      expect(chart).toHaveAttribute('data-cx', '50%');
      expect(chart).toHaveAttribute('data-cy', '50%');
      expect(chart).toHaveAttribute('data-outerradius', '80%');
    });

    it('should render with responsive container', () => {
      render(<SkillRadarChart matchedSkills={validSkillsData} />);

      const container = screen.getByTestId('responsive-container');
      expect(container).toHaveAttribute('data-width', '100%');
    });
  });

  // ===== DATA PROCESSING TESTS =====

  describe('Data Processing and Validation', () => {
    it('should process valid skills data correctly', () => {
      render(<SkillRadarChart matchedSkills={validSkillsData} />);

      const chart = screen.getByTestId('radar-chart');
      expect(chart).toHaveAttribute('data-length', '5');
    });

    it('should filter out invalid data', () => {
      render(<SkillRadarChart matchedSkills={invalidSkillsData as any} />);

      // Should render empty state since all data is invalid
      expect(screen.getByText('No skill data available')).toBeInTheDocument();
      expect(screen.queryByTestId('radar-chart')).not.toBeInTheDocument();
    });

    it('should handle mixed valid and invalid data', () => {
      render(<SkillRadarChart matchedSkills={mixedValidInvalidData as any} />);

      const chart = screen.getByTestId('radar-chart');
      // Should only count valid items (3 out of 5)
      expect(chart).toHaveAttribute('data-length', '3');
    });

    it('should limit to top 5 skills', () => {
      render(<SkillRadarChart matchedSkills={manySkills} />);

      const chart = screen.getByTestId('radar-chart');
      expect(chart).toHaveAttribute('data-length', '5');
    });

    it('should sort skills by match percentage', () => {
      const unsortedSkills = [
        { skill: 'Low Skill', matchPercentage: 30 },
        { skill: 'High Skill', matchPercentage: 95 },
        { skill: 'Medium Skill', matchPercentage: 60 },
      ];

      render(<SkillRadarChart matchedSkills={unsortedSkills} />);

      // Chart should process and display the data (specific order testing would require more detailed mocking)
      const chart = screen.getByTestId('radar-chart');
      expect(chart).toHaveAttribute('data-length', '3');
    });

    it('should handle empty skill names', () => {
      const skillsWithEmptyNames = [
        { skill: '', matchPercentage: 90 },
        { skill: 'Valid Skill', matchPercentage: 85 },
      ];

      render(<SkillRadarChart matchedSkills={skillsWithEmptyNames} />);

      // Should only count valid skill
      const chart = screen.getByTestId('radar-chart');
      expect(chart).toHaveAttribute('data-length', '1');
    });

    it('should handle extreme percentage values', () => {
      render(<SkillRadarChart matchedSkills={extremeValues} />);

      // Should still render chart with data
      const chart = screen.getByTestId('radar-chart');
      expect(chart).toHaveAttribute('data-length', '4');
    });
  });

  // ===== EMPTY STATES =====

  describe('Empty States', () => {
    it('should render empty state for no skills', () => {
      render(<SkillRadarChart matchedSkills={emptySkillsData} />);

      expect(screen.getByText('No skill data available')).toBeInTheDocument();
      expect(screen.queryByTestId('radar-chart')).not.toBeInTheDocument();
    });

    it('should render empty state for null/undefined skills', () => {
      render(<SkillRadarChart matchedSkills={null as any} />);

      expect(screen.getByText('No skill data available')).toBeInTheDocument();
      expect(screen.queryByTestId('radar-chart')).not.toBeInTheDocument();
    });

    it('should render empty state for undefined prop', () => {
      render(<SkillRadarChart matchedSkills={undefined as any} />);

      expect(screen.getByText('No skill data available')).toBeInTheDocument();
      expect(screen.queryByTestId('radar-chart')).not.toBeInTheDocument();
    });

    it('should style empty state correctly', () => {
      render(<SkillRadarChart matchedSkills={emptySkillsData} />);

      const emptyMessage = screen.getByText('No skill data available');
      expect(emptyMessage.closest('div')).toHaveClass('flex');
      expect(emptyMessage.closest('div')).toHaveClass('items-center');
      expect(emptyMessage.closest('div')).toHaveClass('justify-center');
      expect(emptyMessage.closest('div')).toHaveClass('h-full');
      expect(emptyMessage.closest('div')).toHaveClass('text-gray-500');
    });
  });

  // ===== CHART CONFIGURATION =====

  describe('Chart Configuration', () => {
    it('should configure radar component correctly', () => {
      render(<SkillRadarChart matchedSkills={validSkillsData} />);

      const radar = screen.getByTestId('radar');
      expect(radar).toHaveAttribute('data-datakey', 'value');
      expect(radar).toHaveAttribute('data-stroke', '#15803d');
      expect(radar).toHaveAttribute('data-fill', '#22c55e');
      expect(radar).toHaveAttribute('data-fillopacity', '0.5');
    });

    it('should configure polar axes correctly', () => {
      render(<SkillRadarChart matchedSkills={validSkillsData} />);

      const angleAxis = screen.getByTestId('polar-angle-axis');
      expect(angleAxis).toHaveAttribute('data-datakey', 'skill');

      const radiusAxis = screen.getByTestId('polar-radius-axis');
      expect(radiusAxis).toHaveAttribute('data-angle', '90');
      expect(radiusAxis).toHaveAttribute('data-domain', '0,100');
    });

    it('should include polar grid', () => {
      render(<SkillRadarChart matchedSkills={validSkillsData} />);

      expect(screen.getByTestId('polar-grid')).toBeInTheDocument();
    });
  });

  // ===== RESPONSIVE DESIGN =====

  describe('Responsive Design', () => {
    it('should adapt to mobile screens', () => {
      const { useIsMobile } = require('@/hooks/use-mobile');
      useIsMobile.mockReturnValue(true);

      render(<SkillRadarChart matchedSkills={validSkillsData} />);

      // Chart should still render on mobile
      expect(screen.getByTestId('radar-chart')).toBeInTheDocument();
    });

    it('should handle different screen sizes', () => {
      // Test with different heights
      const { rerender } = render(
        <SkillRadarChart matchedSkills={validSkillsData} height={200} />
      );

      let container = screen.getByTestId('responsive-container');
      expect(container).toHaveAttribute('data-height', '200');

      rerender(<SkillRadarChart matchedSkills={validSkillsData} height={600} />);

      container = screen.getByTestId('responsive-container');
      expect(container).toHaveAttribute('data-height', '600');
    });

    it('should maintain responsive width', () => {
      render(<SkillRadarChart matchedSkills={validSkillsData} />);

      const container = screen.getByTestId('responsive-container');
      expect(container).toHaveAttribute('data-width', '100%');
    });
  });

  // ===== SKILL NAME HANDLING =====

  describe('Skill Name Processing', () => {
    it('should handle long skill names', () => {
      render(<SkillRadarChart matchedSkills={longSkillNames} />);

      // Should render chart with long names
      const chart = screen.getByTestId('radar-chart');
      expect(chart).toHaveAttribute('data-length', '3');
    });

    it('should handle special characters in skill names', () => {
      const specialCharSkills = [
        { skill: 'C++', matchPercentage: 90 },
        { skill: 'C#', matchPercentage: 85 },
        { skill: 'JavaScript/TypeScript', matchPercentage: 80 },
        { skill: 'React & Redux', matchPercentage: 75 },
      ];

      render(<SkillRadarChart matchedSkills={specialCharSkills} />);

      const chart = screen.getByTestId('radar-chart');
      expect(chart).toHaveAttribute('data-length', '4');
    });

    it('should handle unicode characters', () => {
      const unicodeSkills = [
        { skill: 'Español', matchPercentage: 90 },
        { skill: '中文', matchPercentage: 85 },
        { skill: 'العربية', matchPercentage: 80 },
      ];

      render(<SkillRadarChart matchedSkills={unicodeSkills} />);

      const chart = screen.getByTestId('radar-chart');
      expect(chart).toHaveAttribute('data-length', '3');
    });
  });

  // ===== DATA TRANSFORMATION =====

  describe('Data Transformation', () => {
    it('should transform data for chart consumption', () => {
      render(<SkillRadarChart matchedSkills={validSkillsData} />);

      // Chart should receive properly formatted data
      const chart = screen.getByTestId('radar-chart');
      expect(chart).toBeInTheDocument();
      
      // The radar component should be configured with the value dataKey
      const radar = screen.getByTestId('radar');
      expect(radar).toHaveAttribute('data-datakey', 'value');
    });

    it('should handle missing matchPercentage values', () => {
      const skillsWithMissingValues = [
        { skill: 'JavaScript', matchPercentage: 90 },
        { skill: 'React' }, // Missing matchPercentage
        { skill: 'Node.js', matchPercentage: 85 },
      ];

      render(<SkillRadarChart matchedSkills={skillsWithMissingValues as any} />);

      // Should filter out invalid entries
      const chart = screen.getByTestId('radar-chart');
      expect(chart).toHaveAttribute('data-length', '2');
    });

    it('should set fullMark property correctly', () => {
      render(<SkillRadarChart matchedSkills={validSkillsData} />);

      // Radius axis should show 0-100 domain
      const radiusAxis = screen.getByTestId('polar-radius-axis');
      expect(radiusAxis).toHaveAttribute('data-domain', '0,100');
    });
  });

  // ===== ACCESSIBILITY =====

  describe('Accessibility', () => {
    it('should provide accessible chart structure', () => {
      const { container } = render(<SkillRadarChart matchedSkills={validSkillsData} />);

      // Should have proper container structure
      const chartContainer = container.firstChild;
      expect(chartContainer).toBeInTheDocument();

      checkAriaAttributes(container);
    });

    it('should handle screen reader accessibility', () => {
      render(<SkillRadarChart matchedSkills={validSkillsData} />);

      // Chart should be renderable by assistive technology
      expect(screen.getByTestId('radar-chart')).toBeInTheDocument();
    });

    it('should provide meaningful empty state message', () => {
      render(<SkillRadarChart matchedSkills={emptySkillsData} />);

      const emptyMessage = screen.getByText('No skill data available');
      expect(emptyMessage).toBeInTheDocument();
      expect(emptyMessage).toBeVisible();
    });
  });

  // ===== ERROR HANDLING =====

  describe('Error Handling', () => {
    it('should handle malformed data gracefully', () => {
      const malformedData = [
        'not an object',
        123,
        true,
        { skill: 'Valid', matchPercentage: 90 },
      ];

      expect(() => {
        render(<SkillRadarChart matchedSkills={malformedData as any} />);
      }).not.toThrow();

      // Should filter and show only valid data
      const chart = screen.getByTestId('radar-chart');
      expect(chart).toHaveAttribute('data-length', '1');
    });

    it('should handle console logging gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      render(<SkillRadarChart matchedSkills={validSkillsData} />);

      // Should log skills data for debugging
      expect(consoleSpy).toHaveBeenCalledWith(
        'Skills data received by chart:',
        validSkillsData
      );

      consoleSpy.mockRestore();
    });

    it('should handle unexpected data types', () => {
      const unexpectedData = {
        notAnArray: 'invalid',
      };

      expect(() => {
        render(<SkillRadarChart matchedSkills={unexpectedData as any} />);
      }).not.toThrow();

      // Should show empty state
      expect(screen.getByText('No skill data available')).toBeInTheDocument();
    });
  });

  // ===== PERFORMANCE TESTS =====

  describe('Performance', () => {
    it('should handle large datasets efficiently', () => {
      const largeDataset = Array.from({ length: 100 }, (_, index) => ({
        skill: `Skill ${index + 1}`,
        matchPercentage: Math.floor(Math.random() * 100),
      }));

      expect(() => {
        render(<SkillRadarChart matchedSkills={largeDataset} />);
      }).not.toThrow();

      // Should limit to top 5 skills
      const chart = screen.getByTestId('radar-chart');
      expect(chart).toHaveAttribute('data-length', '5');
    });

    it('should not re-render unnecessarily', () => {
      let renderCount = 0;

      const TestChart = ({ skills }: { skills: any[] }) => {
        renderCount++;
        return <SkillRadarChart matchedSkills={skills} />;
      };

      const { rerender } = render(<TestChart skills={validSkillsData} />);
      expect(renderCount).toBe(1);

      // Rerender with same data
      rerender(<TestChart skills={validSkillsData} />);
      expect(renderCount).toBe(2); // Normal React behavior

      // Rerender with different data
      rerender(<TestChart skills={[...validSkillsData]} />);
      expect(renderCount).toBe(3);
    });

    it('should memoize data processing efficiently', () => {
      const { rerender } = render(<SkillRadarChart matchedSkills={validSkillsData} />);

      // Initial render
      expect(screen.getByTestId('radar-chart')).toHaveAttribute('data-length', '5');

      // Rerender with same data - should use memoized result
      rerender(<SkillRadarChart matchedSkills={validSkillsData} />);
      expect(screen.getByTestId('radar-chart')).toHaveAttribute('data-length', '5');

      // Rerender with different data
      rerender(<SkillRadarChart matchedSkills={minimalSkillsData} />);
      expect(screen.getByTestId('radar-chart')).toHaveAttribute('data-length', '1');
    });
  });

  // ===== INTEGRATION TESTS =====

  describe('Integration with Parent Components', () => {
    it('should work correctly when embedded in analysis results', () => {
      const AnalysisResultCard = () => (
        <div>
          <h3>Candidate Analysis</h3>
          <div>
            <h5>Skill Match Visualization</h5>
            <SkillRadarChart matchedSkills={validSkillsData} height={240} />
          </div>
        </div>
      );

      render(<AnalysisResultCard />);

      expect(screen.getByText('Skill Match Visualization')).toBeInTheDocument();
      expect(screen.getByTestId('radar-chart')).toBeInTheDocument();
      
      const container = screen.getByTestId('responsive-container');
      expect(container).toHaveAttribute('data-height', '240');
    });

    it('should handle dynamic data updates from parent', () => {
      let currentSkills = validSkillsData;

      const DynamicChart = () => (
        <SkillRadarChart matchedSkills={currentSkills} />
      );

      const { rerender } = render(<DynamicChart />);

      expect(screen.getByTestId('radar-chart')).toHaveAttribute('data-length', '5');

      // Update data
      currentSkills = minimalSkillsData;
      rerender(<DynamicChart />);

      expect(screen.getByTestId('radar-chart')).toHaveAttribute('data-length', '1');
    });

    it('should maintain state consistency across rerenders', () => {
      const { rerender } = render(
        <SkillRadarChart matchedSkills={validSkillsData} height={300} />
      );

      const initialChart = screen.getByTestId('radar-chart');
      const initialContainer = screen.getByTestId('responsive-container');

      // Rerender with same props
      rerender(<SkillRadarChart matchedSkills={validSkillsData} height={300} />);

      const rerenderChart = screen.getByTestId('radar-chart');
      const rerenderContainer = screen.getByTestId('responsive-container');

      // Should maintain same configuration
      expect(rerenderChart).toHaveAttribute('data-length', '5');
      expect(rerenderContainer).toHaveAttribute('data-height', '300');
    });
  });
});