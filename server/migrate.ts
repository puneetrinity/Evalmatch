import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { getDatabase } from './database';
import { logger } from './lib/logger';

// This script will be used for manual migrations in production
async function main() {
  logger.info('Running database migrations...');
  
  try {
    const db = getDatabase();
    await migrate(db, { migrationsFolder: 'drizzle' });
    logger.info('Migrations completed successfully');
  } catch (error) {
    logger.error('Migration failed', error instanceof Error ? error : new Error(String(error)));
    process.exit(1);
  }
  
  process.exit(0);
}

main();