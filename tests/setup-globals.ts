/**
 * Global setup for Jest tests - mocks browser APIs and objects
 */

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