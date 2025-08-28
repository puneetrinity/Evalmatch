import express, { type Request, Response, NextFunction } from "express";
import path from "path";
import { registerRoutes } from "./routes";
import { logger } from "./config/logger";

// For ES modules in Node.js - handle both CommonJS and ES modules
let currentDirPath: string;

// In test environment or when __dirname is not available, use process.cwd()
// This avoids syntax errors with import.meta.url in CommonJS environments
if (process.env.NODE_ENV === 'test' || typeof __dirname === 'undefined') {
  currentDirPath = path.join(process.cwd(), 'server');
} else {
  currentDirPath = __dirname;
}

// Check for OpenAI API Key
if (!process.env.OPENAI_API_KEY) {
  logger.warn("Warning: OPENAI_API_KEY environment variable is not set");
  logger.warn("Some features of the application may not work correctly");
} else {
  logger.info("OpenAI API key configuration: Key is set");
}

// Create Express application
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      logger.info(logLine);
    }
  });

  next();
});

(async () => {
  // Register API routes
  registerRoutes(app);

  // Global error handler
  app.use((err: Error | unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = (err as { status?: number; statusCode?: number })?.status || (err as { status?: number; statusCode?: number })?.statusCode || 500;
    const message = err instanceof Error ? err.message : "Internal Server Error";

    res.status(status).json({ message });
    logger.error("Error:", err instanceof Error ? err.message : String(err));
  });

  // Serve static files from the React app
  const clientPath = path.join(currentDirPath, '../client');
  app.use(express.static(clientPath));

  // For all other routes, serve the React app
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientPath, 'index.html'));
  });

  // Determine port - use PORT environment variable if set (for Render)
  const port = process.env.PORT || 3000;
  
  app.listen(parseInt(port.toString()), "0.0.0.0", () => {
    logger.info(`Server running on port ${port} in production mode`);
  });
})();