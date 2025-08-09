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
    global: 'globalThis',
  },
  root: path.resolve(__dirname, "client"),
  build: {
    outDir: path.resolve(__dirname, "build/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Core vendor dependencies
          if (id.includes('node_modules')) {
            // React ecosystem
            if (id.includes('react') || id.includes('react-dom')) {
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
            
            // Everything else goes to common vendor chunk
            return 'vendor-common';
          }
          
          // Application code chunking
          if (id.includes('src/pages/')) {
            const pageName = id.match(/src\/pages\/([^/]+)\./)?.[1];
            if (pageName) {
              return `page-${pageName}`;
            }
          }
          
          if (id.includes('src/components/')) {
            // Group related components
            if (id.includes('ui/')) return 'components-ui';
            if (id.includes('layout/')) return 'components-layout';
            return 'components-common';
          }
          
          if (id.includes('src/hooks/')) {
            return 'hooks';
          }
          
          if (id.includes('src/lib/')) {
            return 'lib';
          }
          
          if (id.includes('shared/')) {
            return 'shared';
          }
        }
      },
    },
    chunkSizeWarningLimit: 1000,
    target: 'esnext',
    minify: 'esbuild'
  },
});
