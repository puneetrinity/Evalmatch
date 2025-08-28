/**
 * JSDOM Navigation Polyfill
 * Suppress "Not implemented: navigation" errors in tests
 */

// Polyfill navigation methods that JSDOM doesn't implement
if (typeof window !== 'undefined' && !window.navigation) {
  // Mock navigation API (use plain functions instead of jest.fn in setup)
  window.navigation = {
    navigate: () => Promise.resolve(),
    back: () => Promise.resolve(),
    forward: () => Promise.resolve(),
    canGoBack: false,
    canGoForward: false,
    entries: () => [],
    currentEntry: null,
    updateCurrentEntry: () => {},
    reload: () => Promise.resolve(),
    traverseTo: () => Promise.resolve(),
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  };
}

// Enhanced location polyfill to handle navigation errors
if (typeof window !== 'undefined') {
  // Store the original JSDOM location implementation
  const originalLocation = window.location;
  
  // Create a safer location mock that doesn't trigger navigation
  const createLocationMock = (url = 'http://localhost/') => {
    const urlObj = new URL(url);
    return {
      href: urlObj.href,
      origin: urlObj.origin,
      protocol: urlObj.protocol,
      hostname: urlObj.hostname,
      port: urlObj.port,
      pathname: urlObj.pathname,
      search: urlObj.search,
      hash: urlObj.hash,
      host: urlObj.host,
      // Mock navigation methods to prevent JSDOM errors
      assign: () => {},
      replace: () => {},
      reload: () => {},
      toString: () => urlObj.href,
      valueOf: () => urlObj.href,
    };
  };
  
  // Replace the location object with a safer mock
  try {
    delete window.location;
    window.location = createLocationMock();
  } catch (e) {
    // If we can't delete location, try to override its properties
    Object.defineProperty(window, 'location', {
      value: createLocationMock(),
      writable: true,
      configurable: true,
    });
  }
  
  // Provide a way to safely update location for tests
  window.mockLocation = (url) => {
    const newLocation = createLocationMock(url);
    try {
      // Try to replace the entire location object
      delete window.location;
      window.location = newLocation;
    } catch (e) {
      // If we can't replace it, update individual properties
      Object.assign(window.location, newLocation);
    }
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
     args[0].includes('Not implemented: HTMLFormElement.prototype.requestSubmit') ||
     args[0].includes('Error: Not implemented: navigation'))
  ) {
    return;
  }
  
  // Also filter out JSDOM navigation errors from the error objects
  if (args[0] && typeof args[0] === 'object' && args[0].type === 'not implemented') {
    return;
  }
  
  originalConsoleError.apply(console, args);
};

// Enhanced navigator polyfill
if (typeof window !== 'undefined') {
  // Ensure navigator exists and can be modified
  if (!window.navigator) {
    window.navigator = {};
  }
  
  // Create a mock navigator that can be safely overridden in tests
  const createNavigatorMock = (userAgent = 'Test User Agent') => ({
    userAgent,
    platform: 'Test Platform',
    language: 'en-US',
    languages: ['en-US', 'en'],
    onLine: true,
    cookieEnabled: true,
  });
  
  // Set up the initial navigator
  Object.defineProperty(window, 'navigator', {
    value: createNavigatorMock(),
    writable: true,
    configurable: true,
  });
  
  // Provide a way to safely update navigator for tests
  window.mockNavigator = (userAgent) => {
    window.navigator = createNavigatorMock(userAgent);
  };
}