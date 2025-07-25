// Emergency database schema fix for Railway database
// This adds the missing user_id column that's causing the job analysis to fail

const { Pool } = require('pg');

async function fixDatabaseSchema() {
  // This is a public external URL for the Railway database
  // You may need to get this from Railway dashboard
  const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:HGKHgvEKUPhAWmISYrFnNPGFuMepRvct@autorack.proxy.rlwy.net:44817/railway';
  
  const pool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Connecting to Railway database...');
    
    // Check current schema
    const checkColumns = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'job_descriptions'
      ORDER BY ordinal_position;
    `);
    
    console.log('Current job_descriptions columns:', checkColumns.rows);
    
    // Add missing columns
    const alterQueries = [
      'ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS user_id INTEGER',
      'ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS analyzed_data JSON',
      'ALTER TABLE resumes ADD COLUMN IF NOT EXISTS user_id TEXT',
      'ALTER TABLE resumes ADD COLUMN IF NOT EXISTS session_id TEXT', 
      'ALTER TABLE resumes ADD COLUMN IF NOT EXISTS analyzed_data JSON'
    ];
    
    for (const query of alterQueries) {
      console.log('Executing:', query);
      await pool.query(query);
    }
    
    // Verify the fix
    const verifyColumns = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'job_descriptions'
      ORDER BY ordinal_position;
    `);
    
    console.log('Updated job_descriptions columns:', verifyColumns.rows);
    console.log('✅ Database schema fixed successfully!');
    
  } catch (error) {
    console.error('❌ Database fix failed:', error);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  fixDatabaseSchema();
}

module.exports = { fixDatabaseSchema };