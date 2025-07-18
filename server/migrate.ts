import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db } from './db.js';

// This script will be used for manual migrations in production
async function main() {
  console.log('Running database migrations...');
  
  try {
    await migrate(db, { migrationsFolder: 'drizzle' });
    console.log('Migrations completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

main();