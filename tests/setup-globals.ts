/**
 * Global setup for Jest tests - mocks browser APIs and objects
 */

// Mock import.meta.env for Vite environment variables FIRST
(globalThis as any).import = {
  meta: {
    env: {
      VITE_FIREBASE_API_KEY: 'test-api-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'test-auth-domain',
      VITE_FIREBASE_PROJECT_ID: 'test-project-id',
      VITE_FIREBASE_STORAGE_BUCKET: 'test-storage-bucket',
      VITE_FIREBASE_MESSAGING_SENDER_ID: 'test-sender-id',
      VITE_FIREBASE_APP_ID: 'test-app-id',
      DEV: false,
      PROD: true,
      MODE: 'test'
    }
  }
};

// Mock window and related browser globals for Node.js test environment
const mockWindow = {
  navigator: { userAgent: 'Node.js Test Environment' },
  location: { href: 'http://localhost:3000/test' }
};

global.window = mockWindow as any;

// Mock Response constructor to handle invalid status codes gracefully for tests
global.Response = class MockResponse {
  status: number;
  statusText: string;
  ok: boolean;

  constructor(body?: any, init?: { status?: number; statusText?: string }) {
    this.status = init?.status ?? 200;
    this.statusText = init?.statusText ?? 'OK';
    this.ok = this.status >= 200 && this.status < 300;
  }
} as any;

export {};