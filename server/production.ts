import express, { Express, Request, Response, NextFunction } from 'express';
import path from 'path';
import { registerRoutes } from './routes.js';
import { drizzle as _drizzle } from 'drizzle-orm/neon-serverless';
import * as _schema from "@shared/schema";
import { logger } from './lib/logger.js';
// import { createDeploymentPool, getServerConfig } from './deployment-helper.js';

// ES modules equivalent of __dirname - handle both CommonJS and ES modules
let currentDirPath: string;

// In test environment or when __dirname is not available, use process.cwd()
// This avoids syntax errors with import.meta.url in CommonJS environments
if (process.env.NODE_ENV === 'test' || typeof __dirname === 'undefined') {
  currentDirPath = path.join(process.cwd(), 'server');
} else {
  currentDirPath = __dirname;
}

logger.info('Initializing specialized database configuration for Replit deployment');

// Create a simplified pool for production deployment 
const pool = null; // createDeploymentPool();
const db = null; // drizzle({ client: pool, schema });

// Export for routes to use
export { pool, db };

// Create Express server
const app: Express = express();

// JSON parsing middleware
app.use(express.json());

// Configure static file serving for the production build
app.use(express.static(path.join(currentDirPath, '../client')));

// Set up API routes
try {
  registerRoutes(app);
  logger.info('API routes registered for production');
} catch (err) {
  logger.error('Failed to register routes', { error: err instanceof Error ? err.message : String(err) });
}

// Global error handler - production safe
app.use((err: Error | unknown, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Server error', { error: err instanceof Error ? err.message : String(err) });
  res.status(500).json({ message: 'Internal server error' });
});

// For all other routes, serve the React app
app.get('*', (_req: Request, res: Response) => {
  res.sendFile(path.join(currentDirPath, '../client/index.html'));
});

// Get server config from deployment helper
const serverConfig = {
  port: process.env.PORT || 3000,
  host: process.env.HOST || 'localhost',
  disableHeartbeat: true
};

// Start server
app.listen(Number(serverConfig.port), serverConfig.host, () => {
  logger.info('Server started in production mode', {
    port: serverConfig.port,
    host: serverConfig.host,
    databaseHeartbeatDisabled: serverConfig.disableHeartbeat
  });
});