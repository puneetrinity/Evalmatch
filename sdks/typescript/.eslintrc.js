module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: [
    '@typescript-eslint',
  ],
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended',
  ],
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  rules: {
    // Allow any type for generated SDK code
    '@typescript-eslint/no-explicit-any': 'off',
    // Allow unused vars in generated code
    '@typescript-eslint/no-unused-vars': 'off',
    // Allow empty interfaces in generated code
    '@typescript-eslint/no-empty-interface': 'off',
  },
  ignorePatterns: [
    'dist/',
    'node_modules/',
    '**/*.js',
  ],
};