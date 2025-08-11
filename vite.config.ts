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
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: '[name]-[hash].[ext]',
        manualChunks(id) {
          // Core vendor dependencies
          if (id.includes('node_modules')) {
            // React ecosystem - ensure proper loading order
            if (id.includes('react-dom')) {
              return 'vendor-react-dom';
            }
            if (id.includes('react') && !id.includes('react-dom')) {
              return 'vendor-react';
            }
            
            // UI components (keep together for better caching)
            if (id.includes('@radix-ui') || id.includes('lucide-react')) {
              return 'vendor-ui';
            }
            
            // Data fetching
            if (id.includes('@tanstack/react-query')) {
              return 'vendor-query';
            }
            
            // Firebase (heavy - separate chunk)
            if (id.includes('firebase')) {
              return 'vendor-firebase';
            }
            
            // AI SDK (heavy - separate chunk)
            if (id.includes('@anthropic-ai') || id.includes('groq-sdk') || id.includes('openai')) {
              return 'vendor-ai';
            }
            
            // Charts (heavy - separate chunk)
            if (id.includes('recharts') || id.includes('d3-')) {
              return 'vendor-charts';
            }
            
            // Utilities (small - can be combined)
            if (id.includes('clsx') || id.includes('tailwind-merge') || id.includes('class-variance-authority') || id.includes('date-fns')) {
              return 'vendor-utils';
            }
            
            // Other large libraries get their own chunks
            if (id.includes('wouter')) return 'vendor-router';
            
            // PERFORMANCE: Heavy libraries get separate chunks
            if (id.includes('tesseract.js') || id.includes('pdf')) {
              return 'vendor-pdf';
            }
            
            if (id.includes('framer-motion')) {
              return 'vendor-animation';
            }
            
            // Everything else goes to common vendor chunk
            return 'vendor-common';
          }
          
          // PERFORMANCE: Smart application code chunking
          if (id.includes('src/pages/')) {
            const pageName = id.match(/src\/pages\/([^/]+)\./)?.[1];
            if (pageName) {
              // Group related pages together
              if (['upload', 'analysis'].includes(pageName)) {
                return 'page-core';
              }
              return `page-${pageName}`;
            }
          }
          
          if (id.includes('src/components/')) {
            // PERFORMANCE: More granular component chunking
            if (id.includes('ui/')) {
              // Split large UI components
              if (id.includes('sidebar') || id.includes('dialog') || id.includes('sheet')) {
                return 'components-ui-heavy';
              }
              return 'components-ui';
            }
            if (id.includes('layout/')) return 'components-layout';
            if (id.includes('onboarding/')) return 'components-onboarding';
            return 'components-common';
          }
          
          if (id.includes('src/hooks/')) {
            // Split heavy hooks
            if (id.includes('useBatchManager') || id.includes('use-analysis')) {
              return 'hooks-heavy';
            }
            return 'hooks';
          }
          
          if (id.includes('src/lib/')) {
            // PERFORMANCE: Split heavy libraries
            if (id.includes('storage-manager') || id.includes('batch')) {
              return 'lib-storage';
            }
            if (id.includes('error') || id.includes('global-error-handler')) {
              return 'lib-errors';
            }
            return 'lib';
          }
          
          if (id.includes('shared/')) {
            return 'shared';
          }
        }
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
    // Force pre-bundling of React to ensure proper initialization
    force: true,
  },
});
