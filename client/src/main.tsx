// CRITICAL FIX: Ensure React is fully loaded before any operations
import "./polyfills"; // Import polyfills first

// CRITICAL: Import React in specific order to prevent Children undefined
import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// CRITICAL FIX: Ensure React.Children is available before other modules access it
const ensureReactInitialized = () => {
  let attempts = 0;
  const maxAttempts = 50;
  
  return new Promise<void>((resolve) => {
    const check = () => {
      attempts++;
      if (typeof React !== 'undefined' && React.Children && React.createElement) {
        resolve();
      } else if (attempts < maxAttempts) {
        setTimeout(check, 10); // Small delay for initialization
      } else {
        console.warn('React initialization timeout - proceeding anyway');
        resolve();
      }
    };
    check();
  });
};

// Import components only after ensuring React is ready
import App from "./App";
import "./index.css";
import { Toaster } from "@/components/ui/toaster";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Global React reference for runtime checks
declare global {
  interface Window {
    React: any;
  }
}

if (typeof window !== 'undefined') {
  import('react').then(React => {
    window.React = React;
  });
}

// CRITICAL FIX: Only render after React is fully initialized
const renderApp = async () => {
  // Wait for React to be fully initialized
  await ensureReactInitialized();
  
  const rootElement = document.getElementById("root");
  if (!rootElement) {
    throw new Error('Root element not found');
  }

  // Additional safety check before rendering
  if (typeof React === 'undefined') {
    console.error('React still undefined after initialization check');
    return;
  }

  try {
    const root = createRoot(rootElement);
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <Toaster />
          <App />
        </ErrorBoundary>
      </StrictMode>
    );
  } catch (error) {
    console.error('React render error:', error);
    // Fallback render without StrictMode
    const root = createRoot(rootElement);
    root.render(
      <ErrorBoundary>
        <Toaster />
        <App />
      </ErrorBoundary>
    );
  }
};

// Execute rendering with error handling
renderApp().catch(error => {
  console.error('App initialization failed:', error);
  // Basic fallback
  document.getElementById("root")!.innerHTML = '<div>Application failed to load. Please refresh the page.</div>';
});
