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

// Mock complete browser environment for tests
const mockWindow = {
  navigator: { 
    userAgent: 'Node.js Test Environment',
    onLine: true,
    connection: {
      effectiveType: '4g',
      addEventListener: () => {},
      removeEventListener: () => {}
    }
  },
  location: { 
    href: 'http://localhost:3000/test',
    reload: () => {}
  },
  addEventListener: () => {},
  removeEventListener: () => {},
  localStorage: {
    clear: () => {}
  },
  sessionStorage: {
    clear: () => {}
  },
  caches: {
    keys: () => Promise.resolve([]),
    delete: () => Promise.resolve(true)
  }
};

global.window = mockWindow as any;
global.navigator = mockWindow.navigator as any;

// Mock Response constructor to handle invalid status codes gracefully for tests
global.Response = class MockResponse {
  status: number;
  statusText: string;
  ok: boolean;
  url: string;

  constructor(body?: any, init?: { status?: number; statusText?: string }) {
    // Validate status codes to be in proper range
    const status = init?.status ?? 200;
    if (status < 200 || status > 599) {
      throw new RangeError(`init["status"] must be in the range of 200 to 599, inclusive.`);
    }
    
    this.status = status;
    this.statusText = init?.statusText ?? 'OK';
    this.ok = this.status >= 200 && this.status < 300;
    this.url = 'https://test.example.com/test';
  }
} as any;

export {};