/**
 * Mock for import.meta.env in Jest tests
 * This handles Vite-specific environment variable access patterns
 */

// Create a comprehensive mock for import.meta.env
const mockImportMetaEnv = {
  // Vite-specific variables
  VITE_API_BASE_URL: process.env.VITE_API_BASE_URL || 'http://localhost:3000',
  VITE_APP_ENV: 'test',
  
  // Firebase configuration for tests
  VITE_FIREBASE_API_KEY: 'test-api-key-mock',
  VITE_FIREBASE_AUTH_DOMAIN: 'test-project.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'test-project',
  VITE_FIREBASE_STORAGE_BUCKET: 'test-project.appspot.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '123456789',
  VITE_FIREBASE_APP_ID: '1:123456789:web:abcdef123456',
  
  // Standard environment variables
  NODE_ENV: 'test',
  MODE: 'test',
  DEV: false,
  PROD: false,
  SSR: false,
  
  // Ensure all environment variables are available
  ...Object.keys(process.env)
    .filter(key => key.startsWith('VITE_'))
    .reduce((acc, key) => {
      acc[key] = process.env[key];
      return acc;
    }, {})
};

// Mock the entire import.meta object
const mockImportMeta = {
  env: mockImportMetaEnv,
  url: 'file:///test',
  resolve: (specifier) => new URL(specifier, 'file:///test').href
};

// Set up the global mock
if (typeof global !== 'undefined') {
  // Node.js environment (Jest)
  global.importMeta = mockImportMeta;
  
  // Also mock the import.meta syntax directly
  Object.defineProperty(global, 'import', {
    value: {
      meta: mockImportMeta
    },
    writable: true,
    configurable: true
  });
}

// For ES modules that might access import.meta directly
if (typeof globalThis !== 'undefined') {
  globalThis.importMeta = mockImportMeta;
}

export default mockImportMeta;