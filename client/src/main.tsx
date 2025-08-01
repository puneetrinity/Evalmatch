import { createRoot } from "react-dom/client";
import "./polyfills"; // Import polyfills first
import App from "./App";
import "./index.css";
import { Toaster } from "@/components/ui/toaster";

createRoot(document.getElementById("root")!).render(
  <>
    <Toaster />
    <App />
  </>
);
