/**
 * Browser polyfills for Node.js APIs
 * This file provides compatibility shims for Node.js APIs used in shared code
 */

import { Buffer } from 'buffer';

// Make Buffer available globally for browser compatibility
if (typeof globalThis !== 'undefined' && !globalThis.Buffer) {
  (globalThis as any).Buffer = Buffer;
}

// Make it available on window as well for legacy compatibility  
if (typeof window !== 'undefined' && !(window as any).Buffer) {
  (window as any).Buffer = Buffer;
}

export { Buffer };