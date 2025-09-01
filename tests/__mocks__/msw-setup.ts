/**
 * MSW (Mock Service Worker) Setup for Node.js Testing
 * Configures the mock server for comprehensive EvalMatch testing
 */

import { setupServer } from 'msw/node';
import { handlers } from './msw-handlers';

// Create MSW server with all handlers
export const server = setupServer(...handlers);

// Global setup and teardown for MSW
beforeAll(() => {
  // Start the server before all tests
  server.listen({
    onUnhandledRequest: 'warn' // Warn about unhandled requests rather than error
  });
});

afterEach(() => {
  // Reset any request handlers that were added during individual tests
  server.resetHandlers();
});

afterAll(() => {
  // Clean up after all tests are done
  server.close();
});