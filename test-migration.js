// Test script to verify the analysis column migration
const { Pool } = require('pg');
require('dotenv').config();

async function testMigration() {
  console.log('Testing database migration...');
  
  if (!process.env.DATABASE_URL) {
    console.log('No DATABASE_URL found');
    return;
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    // Check current columns in analysis_results table
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'analysis_results'
      ORDER BY ordinal_position
    `);

    console.log('\nCurrent columns in analysis_results table:');
    console.log('==========================================');
    result.rows.forEach(row => {
      console.log(`${row.column_name}: ${row.data_type} ${row.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'} ${row.column_default ? `DEFAULT ${row.column_default}` : ''}`);
    });

    // Check if analysis column exists
    const analysisColumn = result.rows.find(row => row.column_name === 'analysis');
    if (analysisColumn) {
      console.log('\n✅ SUCCESS: analysis column exists!');
    } else {
      console.log('\n❌ ERROR: analysis column is missing!');
      console.log('Run the migration to fix this issue.');
    }

  } catch (error) {
    console.error('Error checking database:', error);
  } finally {
    await pool.end();
  }
}

testMigration();