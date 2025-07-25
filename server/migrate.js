// Emergency database migration for Railway deployment
// This fixes the missing user_id column issue that's breaking job analysis

const { Pool } = require('pg');

async function runMigration() {
  console.log('🔧 Running emergency database schema migration...');
  
  if (!process.env.DATABASE_URL) {
    console.log('⚠️  No DATABASE_URL found, skipping migration (using memory storage)');
    return;
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    // Check if user_id column exists
    const checkResult = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'job_descriptions' AND column_name = 'user_id'
    `);

    if (checkResult.rows.length === 0) {
      console.log('📊 Adding missing user_id column to job_descriptions...');
      await pool.query('ALTER TABLE job_descriptions ADD COLUMN user_id INTEGER');
    }

    // Check if analyzed_data column exists
    const checkAnalysis = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'job_descriptions' AND column_name = 'analyzed_data'
    `);

    if (checkAnalysis.rows.length === 0) {
      console.log('📊 Adding missing analyzed_data column to job_descriptions...');
      await pool.query('ALTER TABLE job_descriptions ADD COLUMN analyzed_data JSON');
    }

    // Fix resumes table if needed
    const resumeQueries = [
      { column: 'user_id', type: 'TEXT' },
      { column: 'session_id', type: 'TEXT' },
      { column: 'analyzed_data', type: 'JSON' }
    ];

    for (const { column, type } of resumeQueries) {
      const checkCol = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'resumes' AND column_name = $1
      `, [column]);

      if (checkCol.rows.length === 0) {
        console.log(`📊 Adding missing ${column} column to resumes...`);
        await pool.query(`ALTER TABLE resumes ADD COLUMN ${column} ${type}`);
      }
    }

    console.log('✅ Database migration completed successfully!');

  } catch (error) {
    console.error('❌ Database migration failed:', error);
    // Don't exit with error code - let the app start with memory storage
    console.log('⚠️  Continuing with memory storage fallback...');
  } finally {
    await pool.end();
  }
}

// Run migration if this script is executed directly
if (require.main === module) {
  runMigration().then(() => {
    console.log('Migration script completed');
    process.exit(0);
  }).catch((error) => {
    console.error('Migration script failed:', error);
    process.exit(0); // Don't fail the deployment
  });
}

module.exports = { runMigration };