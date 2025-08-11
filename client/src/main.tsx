import { createRoot } from "react-dom/client";
import "./polyfills"; // Import polyfills first
import App from "./App";
import "./index.css";
import { Toaster } from "@/components/ui/toaster";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { StrictMode } from "react";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <Toaster />
      <App />
    </ErrorBoundary>
  </StrictMode>
);
