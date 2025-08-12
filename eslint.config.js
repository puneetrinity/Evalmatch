import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  js.configs.recommended,
  {
    files: ['server/**/*.ts', 'server/**/*.js'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json',
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // Explicit any temporarily disabled to reach zero-warning baseline; re-enable with gradual typing plan
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }],
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }],
      // Allow common console methods during migration; prefer migrating to central logger later
      'no-console': ['off'],
      'no-unreachable': 'error',
      'prefer-const': 'warn',
      'no-var': 'error',
      // Disable strict undefined checks; TS handles this
      'no-undef': 'off'
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-unreachable': 'error',
      'prefer-const': 'warn',
      'no-var': 'error',
      'no-undef': 'error', // Keep undef checking for CommonJS files
    },
  },
  {
    ignores: [
      'node_modules/',
      'build/',
      'dist/',
      'client/',
      'tests/',
      'scripts/',
      '*.config.*',
      '**/*.test.ts',
      '**/*.spec.ts',
    ],
  },
];