#!/usr/bin/env node

/**
 * Script to run the performance optimization database migration
 * This will add critical indexes for 3x faster queries
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function runMigration() {
  console.log('🚀 Running performance optimization migration...');
  
  try {
    // Read the migration file
    const migrationPath = path.resolve(__dirname, '../migrations/002_performance_indexes.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Start transaction
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Execute migration
      console.log('📊 Creating performance indexes...');
      await client.query(migrationSQL);
      
      await client.query('COMMIT');
      console.log('✅ Performance migration completed successfully!');
      
      // Show index statistics
      const indexStats = await client.query(`
        SELECT 
          schemaname,
          tablename,
          indexname,
          idx_scan as index_scans,
          pg_size_pretty(pg_relation_size(indexrelid)) as index_size
        FROM pg_stat_user_indexes
        WHERE schemaname = 'public'
        ORDER BY tablename, indexname;
      `);
      
      console.log('\n📈 Index Statistics:');
      console.table(indexStats.rows);
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the migration
runMigration();