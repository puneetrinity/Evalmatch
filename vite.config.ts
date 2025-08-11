import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
      "@assets": path.resolve(__dirname, "attached_assets"),
    },
  },
  define: {
    // Simple global polyfill - esbuild compatible
    global: 'globalThis',
  },
  root: path.resolve(__dirname, "client"),
  build: {
    outDir: path.resolve(__dirname, "build/public"),
    emptyOutDir: true,
    // PERFORMANCE: Optimize build settings
    cssCodeSplit: true,
    sourcemap: process.env.NODE_ENV === 'development',
    minify: process.env.NODE_ENV === 'production' ? 'esbuild' : false,
    rollupOptions: {
      // PERFORMANCE: External dependencies to reduce bundle size
      external: process.env.NODE_ENV === 'production' ? [] : [
        // Keep all deps internal for production, external for dev
      ],
      output: {
        // PERFORMANCE: Better compression and caching
        format: 'es',
        entryFileNames: '[name]-[hash].js',
        assetFileNames: '[name]-[hash].[ext]',
        // Standard chunk configuration
        inlineDynamicImports: false,
        chunkFileNames: '[name]-[hash].js',
        // CRITICAL FIX: Use automatic chunking to prevent circular dependencies
        // The circular dependency issue was caused by React importing from vendor-common
        // while vendor-common was importing from React. Automatic chunking resolves this.
        manualChunks: undefined
      },
    },
    // PERFORMANCE: Optimized build settings
    chunkSizeWarningLimit: 500, // Stricter chunk size limit
    target: 'esnext',
    reportCompressedSize: false, // Speed up build
  },
  
  // PERFORMANCE: Optimize dev server
  server: {
    hmr: {
      overlay: false, // Reduce dev overhead
    },
  },
  
  // PERFORMANCE: Optimize dependencies
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      '@tanstack/react-query',
      'wouter',
      'lucide-react',
    ],
    exclude: [
      // Exclude heavy dev-only dependencies
      '@replit/vite-plugin-runtime-error-modal',
      '@replit/vite-plugin-cartographer',
    ],
    // Ensure pre-bundling for consistent behavior
    force: true,
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
});
