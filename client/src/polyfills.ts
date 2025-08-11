/**
 * Browser polyfills for Node.js APIs
 * This file provides compatibility shims for Node.js APIs used in shared code
 */

import { Buffer } from 'buffer';

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