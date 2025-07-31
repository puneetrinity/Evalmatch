#!/usr/bin/env node

// Quick script to definitively check database type
import { db } from './server/db.js';
import { sql } from 'drizzle-orm';

async function checkDatabaseType() {
  try {
    console.log('Checking database type...');
    
    // PostgreSQL version check
    const result = await db.execute(sql`SELECT version()`);
    console.log('Database Version:', result.rows[0]?.version || 'Unknown');
    
    // Check current database name
    const dbName = await db.execute(sql`SELECT current_database()`);
    console.log('Database Name:', dbName.rows[0]?.current_database || 'Unknown');
    
    // Check if this is PostgreSQL by testing PostgreSQL-specific function
    try {
      const pgTest = await db.execute(sql`SELECT pg_backend_pid()`);
      console.log('Database Type: PostgreSQL (confirmed)');
      console.log('Backend Process ID:', pgTest.rows[0]?.pg_backend_pid);
    } catch (err) {
      console.log('Database Type: NOT PostgreSQL');
      console.log('Error:', err.message);
    }
    
  } catch (error) {
    console.error('Error checking database:', error.message);
  }
  
  process.exit(0);
}

checkDatabaseType();