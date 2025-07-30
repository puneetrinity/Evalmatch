/**
 * Deployment Helper for Replit
 * 
 * This module provides specialized configuration for deploying
 * the application on Replit with proper database handling.
 */

import fs from 'fs';
import path from 'path';
import { Pool } from '@neondatabase/serverless';

// Try to load deployment configuration
let deployConfig: Record<string, unknown> = {
  database: {
    useSimplifiedConnection: true,
    maxConnections: 5,
    connectionTimeout: 30000,
    idleTimeout: 30000
  },
  server: {
    port: 5000,
    host: "0.0.0.0",
    disableHeartbeat: true
  }
};

try {
  // Check if deploy-config.json exists
  if (fs.existsSync(path.join(process.cwd(), 'deploy-config.json'))) {
    deployConfig = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'deploy-config.json'), 'utf8')
    );
    console.log('Loaded custom deployment configuration');
  }
} catch (error) {
  console.warn('Failed to load deploy-config.json, using defaults');
}

/**
 * Create a simplified database pool for deployment
 */
export function createDeploymentPool(): Pool {
  // Ensure DATABASE_URL is available
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?"
    );
  }

  // Use minimal configuration for deployment
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    max: deployConfig.database.maxConnections,
    idleTimeoutMillis: deployConfig.database.idleTimeout,
    connectionTimeoutMillis: deployConfig.database.connectionTimeout,
    allowExitOnIdle: true
  });
}

/**
 * Get the server configuration for deployment
 */
export function getServerConfig() {
  return {
    port: parseInt(process.env.PORT || deployConfig.server.port.toString(), 10),
    host: process.env.HOST || deployConfig.server.host,
    disableHeartbeat: deployConfig.server.disableHeartbeat
  };
}