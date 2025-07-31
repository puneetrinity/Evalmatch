import { Router, Request, Response } from 'express';
import { db } from '../db';
import { sql } from 'drizzle-orm';

const router = Router();

// Check database type and version
router.get('/db-type', async (req: Request, res: Response) => {
  try {
    // Get database version (works for both PostgreSQL and MySQL)
    const versionResult = await db.execute(sql`SELECT version()`);
    const version = versionResult.rows[0]?.version || 'Unknown';
    
    // Try PostgreSQL-specific function
    let dbType = 'Unknown';
    let pgInfo = null;
    
    try {
      const pgResult = await db.execute(sql`SELECT pg_backend_pid(), current_database()`);
      dbType = 'PostgreSQL';
      pgInfo = pgResult.rows[0];
    } catch (pgError) {
      // Try MySQL-specific function
      try {
        const mysqlResult = await db.execute(sql`SELECT CONNECTION_ID(), DATABASE()`);
        dbType = 'MySQL';
        pgInfo = mysqlResult.rows[0];
      } catch (mysqlError) {
        dbType = 'Unknown';
      }
    }
    
    res.json({
      databaseType: dbType,
      version: version,
      connectionInfo: pgInfo,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      error: 'Database check failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;