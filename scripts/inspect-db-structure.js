#!/usr/bin/env node

/**
 * Database Structure Inspector
 * Check actual table structure before running cardinality analysis
 */

import { Pool } from 'pg';

// Use Railway aware-forgiveness database public URL
const DATABASE_PUBLIC_URL = 'postgresql://postgres:qNFtdVByQYaGptcAbSGwQsvQnAJnXLdK@tramway.proxy.rlwy.net:33895/railway';

const pool = new Pool({
  connectionString: DATABASE_PUBLIC_URL,
  ssl: { rejectUnauthorized: false },
});

async function inspectDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Inspecting Database Structure...\n');
    
    // Check what tables exist
    console.log('📋 EXISTING TABLES');
    const tables = await client.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);
    console.table(tables.rows);
    
    // Check columns in key tables if they exist
    const tableNames = ['resumes', 'skills', 'analysis_results'];
    
    for (const tableName of tableNames) {
      const tableExists = tables.rows.find(t => t.tablename === tableName);
      if (tableExists) {
        console.log(`\n🏗️ COLUMNS IN ${tableName.toUpperCase()}`);
        const columns = await client.query(`
          SELECT 
            column_name,
            data_type,
            is_nullable,
            column_default
          FROM information_schema.columns 
          WHERE table_name = $1 
          AND table_schema = 'public'
          ORDER BY ordinal_position
        `, [tableName]);
        console.table(columns.rows);
      } else {
        console.log(`\n❌ Table ${tableName} does not exist`);
      }
    }
    
    // Check existing indexes
    console.log('\n🔍 EXISTING INDEXES');
    const indexes = await client.query(`
      SELECT 
        indexname,
        tablename,
        indexdef
      FROM pg_indexes 
      WHERE schemaname = 'public'
        AND indexname NOT LIKE 'pg_%'
      ORDER BY tablename, indexname
    `);
    
    if (indexes.rows.length > 0) {
      console.table(indexes.rows);
    } else {
      console.log('No user-defined indexes found');
    }
    
  } catch (error) {
    console.error('❌ Database inspection failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

inspectDatabase().catch(console.error);