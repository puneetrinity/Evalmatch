/**
 * Simplified Database Configuration for Deployment
 * 
 * This is a streamlined version of the database connection
 * that avoids permissions issues during deployment.
 */
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

// Configure Neon for WebSocket support
neonConfig.webSocketConstructor = ws;

// We need to disable the type check as the types are outdated
neonConfig.pipelineConnect = true as any;

// Function to initialize database connection
export function initializeDatabase() {
  // Ensure DATABASE_URL is available
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?",
    );
  }

  // Use simplified pool configuration for deployment
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 60000,
    connectionTimeoutMillis: 60000,
    allowExitOnIdle: true
  });

  // Initialize Drizzle ORM with our connection pool
  const db = drizzle({ client: pool, schema });

  return { pool, db };
}