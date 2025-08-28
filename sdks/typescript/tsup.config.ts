import { defineConfig } from 'tsup'

export default defineConfig([
  // ESM and CJS builds (with externals)
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: false,
    clean: true,
    splitting: true,
    sourcemap: true,
    minify: true,
    treeshake: true,
    external: [
      'firebase',
      'firebase-admin', 
      'firebase/app',
      'firebase/auth',
      'axios'
    ],
    target: 'es2020',
    metafile: true,
    outDir: 'dist',
    outExtension({ format }) {
      return {
        js: format === 'cjs' ? '.cjs' : '.mjs'
      }
    },
    banner: {
      js: '/*! EvalMatch SDK - AI-powered recruitment platform */'
    },
    platform: 'neutral',
    define: {
      'process.env.NODE_ENV': '"production"'
    },
    esbuildOptions(options) {
      options.treeShaking = true
      options.mangleProps = /^_/
      options.drop = ['console', 'debugger']
      options.legalComments = 'none'
    }
  },
  
  // Browser IIFE build (with all externals bundled for standalone use)
  {
    entry: ['src/index.ts'],
    format: ['iife'],
    dts: false,
    clean: false, // Don't clean, we want to keep other formats
    minify: true,
    globalName: 'EvalMatch',
    target: 'es2020',
    outDir: 'dist',
    outExtension() {
      return { js: '.global.js' }
    },
    banner: {
      js: '/*! EvalMatch SDK - AI-powered recruitment platform - Standalone Browser Build */'
    },
    platform: 'browser',
    define: {
      'process.env.NODE_ENV': '"production"'
    },
    // For IIFE, we need to handle Node.js polyfills
    esbuildOptions(options) {
      options.treeShaking = true
      options.drop = ['console', 'debugger']
      options.legalComments = 'none'
      // Add Node.js polyfills for browser
      options.define = {
        ...options.define,
        'global': 'globalThis',
        'process.env.NODE_ENV': '"production"'
      }
    },
    // Only external Firebase for IIFE (axios will be bundled)
    external: [
      'firebase',
      'firebase/app', 
      'firebase/auth'
    ]
  }
])