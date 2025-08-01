import express, { Express, Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { registerRoutes } from './routes.js';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from "@shared/schema";
import { createDeploymentPool, getServerConfig } from './deployment-helper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Initializing specialized database configuration for Replit deployment...');

// Create a simplified pool for Replit deployment 
const pool = createDeploymentPool();
const db = drizzle({ client: pool, schema });

// Export for routes to use
export { pool, db };

// Create Express server
const app: Express = express();

// JSON parsing middleware
app.use(express.json());

// Configure static file serving for the production build
app.use(express.static(path.join(__dirname, '../client')));

// Set up API routes
registerRoutes(app).then(() => {
  console.log('API routes registered for production');
}).catch((err) => {
  console.error('Failed to register routes:', err);
});

// Global error handler - production safe
app.use((err: Error | unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Server error:', err.message);
  res.status(500).json({ message: 'Internal server error' });
});

// For all other routes, serve the React app
app.get('*', (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Get server config from deployment helper
const serverConfig = getServerConfig();

// Start server
app.listen(serverConfig.port, serverConfig.host, () => {
  console.log(`Server running on port ${serverConfig.port} in production mode`);
  console.log(`Using host: ${serverConfig.host}`);
  console.log(`Database heartbeat disabled: ${serverConfig.disableHeartbeat}`);
});