/**
 * EvalMatch Design System
 * Centralized design tokens for consistent UI across the application
 */

// Color Palette
export const colors = {
  // Primary Brand Colors
  primary: {
    50: '#eff6ff',
    100: '#dbeafe',
    200: '#bfdbfe',
    300: '#93c5fd',
    400: '#60a5fa',
    500: '#3b82f6', // Main primary
    600: '#2563eb',
    700: '#1d4ed8',
    800: '#1e40af',
    900: '#1e3a8a',
  },
  
  // Success Colors (Green)
  success: {
    50: '#f0fdf4',
    100: '#dcfce7',
    200: '#bbf7d0',
    300: '#86efac',
    400: '#4ade80',
    500: '#22c55e', // Main success
    600: '#16a34a',
    700: '#15803d',
    800: '#166534',
    900: '#14532d',
  },
  
  // Warning Colors (Amber)
  warning: {
    50: '#fffbeb',
    100: '#fef3c7',
    200: '#fde68a',
    300: '#fcd34d',
    400: '#fbbf24',
    500: '#f59e0b', // Main warning
    600: '#d97706',
    700: '#b45309',
    800: '#92400e',
    900: '#78350f',
  },
  
  // Error/Danger Colors (Red)
  error: {
    50: '#fef2f2',
    100: '#fee2e2',
    200: '#fecaca',
    300: '#fca5a5',
    400: '#f87171',
    500: '#ef4444', // Main error
    600: '#dc2626',
    700: '#b91c1c',
    800: '#991b1b',
    900: '#7f1d1d',
  },
  
  // Neutral Colors (Gray)
  neutral: {
    50: '#fafafa',
    100: '#f4f4f5',
    200: '#e4e4e7',
    300: '#d4d4d8',
    400: '#a1a1aa',
    500: '#71717a',
    600: '#52525b',
    700: '#3f3f46',
    800: '#27272a',
    900: '#18181b',
  },
  
  // Background Colors
  background: {
    primary: '#ffffff',
    secondary: '#f9fafb',
    tertiary: '#f3f4f6',
    inverse: '#1f2937',
  },
  
  // Text Colors
  text: {
    primary: '#111827',
    secondary: '#6b7280',
    tertiary: '#9ca3af',
    inverse: '#ffffff',
    link: '#3b82f6',
    linkHover: '#2563eb',
  },
  
  // Border Colors
  border: {
    light: '#e5e7eb',
    DEFAULT: '#d1d5db',
    dark: '#9ca3af',
  },
};

// Typography
export const typography = {
  // Font Families
  fontFamily: {
    sans: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    mono: '"JetBrains Mono", "SF Mono", Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  },
  
  // Font Sizes
  fontSize: {
    xs: '0.75rem',     // 12px
    sm: '0.875rem',    // 14px
    base: '1rem',      // 16px
    lg: '1.125rem',    // 18px
    xl: '1.25rem',     // 20px
    '2xl': '1.5rem',   // 24px
    '3xl': '1.875rem', // 30px
    '4xl': '2.25rem',  // 36px
    '5xl': '3rem',     // 48px
  },
  
  // Font Weights
  fontWeight: {
    thin: 100,
    light: 300,
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
  },
  
  // Line Heights
  lineHeight: {
    none: 1,
    tight: 1.25,
    snug: 1.375,
    normal: 1.5,
    relaxed: 1.625,
    loose: 2,
  },
  
  // Letter Spacing
  letterSpacing: {
    tighter: '-0.05em',
    tight: '-0.025em',
    normal: '0em',
    wide: '0.025em',
    wider: '0.05em',
    widest: '0.1em',
  },
};

// Spacing Scale
export const spacing = {
  0: '0',
  px: '1px',
  0.5: '0.125rem',  // 2px
  1: '0.25rem',     // 4px
  1.5: '0.375rem',  // 6px
  2: '0.5rem',      // 8px
  2.5: '0.625rem',  // 10px
  3: '0.75rem',     // 12px
  3.5: '0.875rem',  // 14px
  4: '1rem',        // 16px
  5: '1.25rem',     // 20px
  6: '1.5rem',      // 24px
  7: '1.75rem',     // 28px
  8: '2rem',        // 32px
  9: '2.25rem',     // 36px
  10: '2.5rem',     // 40px
  11: '2.75rem',    // 44px
  12: '3rem',       // 48px
  14: '3.5rem',     // 56px
  16: '4rem',       // 64px
  20: '5rem',       // 80px
  24: '6rem',       // 96px
  28: '7rem',       // 112px
  32: '8rem',       // 128px
  36: '9rem',       // 144px
  40: '10rem',      // 160px
  44: '11rem',      // 176px
  48: '12rem',      // 192px
  52: '13rem',      // 208px
  56: '14rem',      // 224px
  60: '15rem',      // 240px
  64: '16rem',      // 256px
  72: '18rem',      // 288px
  80: '20rem',      // 320px
  96: '24rem',      // 384px
};

// Border Radius
export const borderRadius = {
  none: '0px',
  sm: '0.125rem',   // 2px
  DEFAULT: '0.25rem', // 4px
  md: '0.375rem',   // 6px
  lg: '0.5rem',     // 8px
  xl: '0.75rem',    // 12px
  '2xl': '1rem',    // 16px
  '3xl': '1.5rem',  // 24px
  full: '9999px',
};

// Shadows
export const shadows = {
  none: 'none',
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  DEFAULT: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
  '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
  inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
};

// Z-Index Scale
export const zIndex = {
  0: 0,
  10: 10,
  20: 20,
  30: 30,
  40: 40,
  50: 50,
  auto: 'auto',
  dropdown: 1000,
  sticky: 1020,
  fixed: 1030,
  modalBackdrop: 1040,
  modal: 1050,
  popover: 1060,
  tooltip: 1070,
};

// Transitions
export const transitions = {
  duration: {
    fast: '150ms',
    normal: '300ms',
    slow: '500ms',
  },
  timing: {
    easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
    easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
    easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    linear: 'linear',
  },
};

// Breakpoints
export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
};

// Component-Specific Styles
export const components = {
  button: {
    padding: {
      sm: `${spacing[2]} ${spacing[3]}`,
      md: `${spacing[2.5]} ${spacing[4]}`,
      lg: `${spacing[3]} ${spacing[6]}`,
    },
    fontSize: {
      sm: typography.fontSize.sm,
      md: typography.fontSize.base,
      lg: typography.fontSize.lg,
    },
  },
  
  input: {
    padding: `${spacing[2.5]} ${spacing[3]}`,
    fontSize: typography.fontSize.base,
    borderRadius: borderRadius.md,
    borderColor: colors.border.DEFAULT,
    focusBorderColor: colors.primary[500],
  },
  
  card: {
    padding: spacing[6],
    borderRadius: borderRadius.lg,
    boxShadow: shadows.DEFAULT,
    borderColor: colors.border.light,
  },
  
  alert: {
    padding: spacing[4],
    borderRadius: borderRadius.md,
    variants: {
      info: {
        bg: colors.primary[50],
        border: colors.primary[200],
        text: colors.primary[800],
      },
      success: {
        bg: colors.success[50],
        border: colors.success[200],
        text: colors.success[800],
      },
      warning: {
        bg: colors.warning[50],
        border: colors.warning[200],
        text: colors.warning[800],
      },
      error: {
        bg: colors.error[50],
        border: colors.error[200],
        text: colors.error[800],
      },
    },
  },
};

// Semantic Colors (for easy reference)
export const semanticColors = {
  // Match Strength Colors
  matchStrength: {
    excellent: colors.success[600],
    strong: colors.success[500],
    moderate: colors.warning[500],
    weak: colors.error[500],
  },
  
  // Confidence Levels
  confidence: {
    high: colors.success[500],
    medium: colors.warning[500],
    low: colors.error[500],
  },
  
  // Status Colors
  status: {
    active: colors.success[500],
    pending: colors.warning[500],
    inactive: colors.neutral[400],
    error: colors.error[500],
  },
};

// Utility function to get consistent spacing
export const getSpacing = (multiplier: number): string => {
  return `${multiplier * 0.25}rem`;
};

// Utility function to create consistent shadows
export const createShadow = (
  x: number,
  y: number,
  blur: number,
  spread: number,
  opacity: number
): string => {
  return `${x}px ${y}px ${blur}px ${spread}px rgba(0, 0, 0, ${opacity})`;
};

// Export a theme object for easy use
export const theme = {
  colors,
  typography,
  spacing,
  borderRadius,
  shadows,
  zIndex,
  transitions,
  breakpoints,
  components,
  semanticColors,
};

export default theme;