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
  // Store the original JSDOM location implementation first
  const originalLocation = window.location;
  
  // Intercept the JSDOM Location implementation before it triggers navigation
  try {
    // Get the JSDOM internal objects
    const LocationImpl = window.location.constructor;
    if (LocationImpl && LocationImpl.prototype._locationObjectNavigate) {
      // Override the internal navigation method
      LocationImpl.prototype._locationObjectNavigate = function(url, options = {}) {
        // Just update the URL properties without navigating
        if (url && typeof url === 'object' && url.href) {
          this._href = url.href;
        }
        return Promise.resolve();
      };
      
      LocationImpl.prototype._locationObjectSetterNavigate = function(url) {
        // Same as above but for setter navigation
        if (url && typeof url === 'object' && url.href) {
          this._href = url.href;
        }
        return Promise.resolve();
      };
    }
  } catch (e) {
    // If we can't override the prototype, continue with fallback approach
  }
  
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
  
  // Safer approach: Only override problematic properties instead of replacing entire location
  try {
    // Override specific location setters that trigger navigation
    Object.defineProperty(window.location, 'href', {
      get: () => window.location._href || 'http://localhost/',
      set: (value) => {
        window.location._href = value;
        // Don't actually navigate, just store the value
      },
      configurable: true
    });
    
    // Override other navigation-triggering properties
    ['protocol', 'hostname', 'port', 'pathname', 'search', 'hash'].forEach(prop => {
      const originalGetter = Object.getOwnPropertyDescriptor(window.location, prop)?.get;
      if (originalGetter) {
        Object.defineProperty(window.location, prop, {
          get: originalGetter,
          set: (value) => {
            // Store the change but don't navigate
            const currentUrl = new URL(window.location._href || window.location.href);
            currentUrl[prop] = value;
            window.location._href = currentUrl.href;
          },
          configurable: true
        });
      }
    });
  } catch (e) {
    // If property override fails, fall back to full replacement
    try {
      Object.defineProperty(window, 'location', {
        value: createLocationMock(),
        writable: true,
        configurable: true,
      });
    } catch (e2) {
      // Last resort: silent failure
      console.warn('Could not override window.location for JSDOM navigation polyfill');
    }
  }
  
  // Provide a way to safely update location for tests
  window.mockLocation = (url) => {
    try {
      window.location._href = url;
      // Update other properties to match
      const urlObj = new URL(url);
      Object.assign(window.location, {
        href: urlObj.href,
        origin: urlObj.origin,
        protocol: urlObj.protocol,
        hostname: urlObj.hostname,
        port: urlObj.port,
        pathname: urlObj.pathname,
        search: urlObj.search,
        hash: urlObj.hash,
        host: urlObj.host,
      });
    } catch (e) {
      console.warn('Could not update mock location:', e.message);
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