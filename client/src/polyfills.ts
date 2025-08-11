/**
 * Browser polyfills for Node.js APIs
 * This file provides compatibility shims for Node.js APIs used in shared code
 */

import { Buffer } from 'buffer';

// CRITICAL FIX: Prevent React Children undefined race condition
// This guard prevents modules from accessing React.Children before React is fully initialized
const createReactGuard = () => {
  if (typeof globalThis !== 'undefined' && !globalThis.__REACT_INITIALIZATION_GUARD__) {
    // Create a proxy to prevent premature access to React internals
    const reactGuard = {
      Children: undefined,
      createElement: undefined,
      __REACT_LOADING__: true,
    };
    
    // Store guard globally
    globalThis.__REACT_INITIALIZATION_GUARD__ = reactGuard;
    
    // Remove guard after React loads
    const checkReactLoaded = () => {
      if (typeof window !== 'undefined' && window.React && window.React.Children) {
        delete globalThis.__REACT_INITIALIZATION_GUARD__;
        return;
      }
      setTimeout(checkReactLoaded, 100);
    };
    
    // Start checking if we're in browser
    if (typeof window !== 'undefined') {
      setTimeout(checkReactLoaded, 100);
    }
  }
};

// Initialize React guard early
createReactGuard();

// Defer global assignments to avoid conflicts with React initialization
const setupBufferPolyfill = () => {
  // Make Buffer available globally for browser compatibility
  if (typeof globalThis !== 'undefined' && !globalThis.Buffer) {
    (globalThis as any).Buffer = Buffer;
  }

  // Make it available on window as well for legacy compatibility
  if (typeof window !== 'undefined' && !(window as any).Buffer) {
    (window as any).Buffer = Buffer;
  }
};

// Execute after DOM content loads to avoid module initialization conflicts
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupBufferPolyfill);
  } else {
    setupBufferPolyfill();
  }
} else {
  // For server-side or non-DOM environments
  setupBufferPolyfill();
}

export { Buffer };