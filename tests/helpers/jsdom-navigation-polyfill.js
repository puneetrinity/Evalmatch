/**
 * JSDOM Navigation Polyfill
 * Suppress "Not implemented: navigation" errors in tests
 */

// Polyfill navigation methods that JSDOM doesn't implement
if (typeof window !== 'undefined' && !window.navigation) {
  // Mock navigation API
  window.navigation = {
    navigate: jest.fn(() => Promise.resolve()),
    back: jest.fn(() => Promise.resolve()),
    forward: jest.fn(() => Promise.resolve()),
    canGoBack: false,
    canGoForward: false,
    entries: jest.fn(() => []),
    currentEntry: null,
    updateCurrentEntry: jest.fn(),
    reload: jest.fn(() => Promise.resolve()),
    traverseTo: jest.fn(() => Promise.resolve()),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  };
}

// Silence specific JSDOM errors
const originalConsoleError = console.error;
console.error = (...args) => {
  // Filter out known JSDOM limitations
  if (
    args[0] &&
    typeof args[0] === 'string' &&
    (args[0].includes('Not implemented: navigation') ||
     args[0].includes('Not implemented: window.focus') ||
     args[0].includes('Not implemented: window.scrollTo') ||
     args[0].includes('Not implemented: HTMLFormElement.prototype.requestSubmit'))
  ) {
    return;
  }
  originalConsoleError.apply(console, args);
};