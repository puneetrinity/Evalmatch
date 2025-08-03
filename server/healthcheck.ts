import { Request, Response } from 'express';
import { pool } from './db';

/**
 * Health check handler for Render
 * This endpoint will check:
 * 1. If the server is running
 * 2. If the database connection is working (when configured)
 * 3. If the OpenAI API key is set (optional)
 */
interface HealthCheckStatus {
  status: string;
  error?: string;
}

interface HealthCheck {
  status: string;
  timestamp: string;
  checks: {
    server: HealthCheckStatus;
    database: HealthCheckStatus;
    openai: HealthCheckStatus;
  };
}

export async function healthCheck(req: Request, res: Response) {
  const health: HealthCheck = {
    status: 'UP',
    timestamp: new Date().toISOString(),
    checks: {
      server: { status: 'UP' },
      database: { status: 'UNKNOWN' },
      openai: { status: 'UNKNOWN' }
    }
  };

  // Check database connection if DATABASE_URL is set
  if (process.env.DATABASE_URL) {
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      health.checks.database = { status: 'UP' };
    } catch (error) {
      health.checks.database = { 
        status: 'DOWN',
        error: (error as Error).message
      };
      health.status = 'DEGRADED';
    }
  } else {
    health.checks.database = { status: 'DISABLED' };
  }

  // Check if OpenAI API key is set
  if (process.env.OPENAI_API_KEY) {
    health.checks.openai = { status: 'CONFIGURED' };
  } else {
    health.checks.openai = { status: 'NOT_CONFIGURED' };
    health.status = 'DEGRADED';
  }

  res.json(health);
}