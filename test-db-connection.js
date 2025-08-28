import { Pool } from 'pg';

// Test Railway database connection
async function testDatabaseConnection() {
  console.log('🔌 Testing Railway PostgreSQL connection...\n');
  
  const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:QUfZoAyRRSdFBbzGpQqOXLdHGBCUDhka@junction.proxy.rlwy.net:33007/railway';
  
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  try {
    // Test basic connection
    console.log('1️⃣ Testing basic connection...');
    const client = await pool.connect();
    const result = await client.query('SELECT version()');
    console.log('✅ Connected to:', result.rows[0].version);
    client.release();

    // Test if our tables exist
    console.log('\n2️⃣ Checking table structure...');
    const tablesResult = await pool.query(`
      SELECT table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name IN ('resumes', 'analysis_results', 'interview_questions')
      ORDER BY table_name, ordinal_position
    `);
    
    if (tablesResult.rows.length === 0) {
      console.log('❌ No tables found - database needs initialization');
    } else {
      console.log('✅ Found tables:');
      let currentTable = '';
      for (const row of tablesResult.rows) {
        if (row.table_name !== currentTable) {
          currentTable = row.table_name;
          console.log(`\n📋 ${currentTable}:`);
        }
        console.log(`   - ${row.column_name} (${row.data_type})`);
      }
    }

    // Test specific columns that were causing issues
    console.log('\n3️⃣ Checking problematic columns...');
    try {
      const columnCheck = await pool.query(`
        SELECT table_name, column_name 
        FROM information_schema.columns 
        WHERE table_name IN ('resumes', 'analysis_results', 'interview_questions')
        AND column_name IN ('created', 'created_at', 'user_id')
        ORDER BY table_name, column_name
      `);
      
      console.log('✅ Found columns:');
      for (const row of columnCheck.rows) {
        console.log(`   ${row.table_name}.${row.column_name}`);
      }
    } catch (error) {
      console.log('❌ Error checking columns:', error.message);
    }

  } catch (error) {
    console.log('❌ Database connection failed:', error.message);
    console.log('   Code:', error.code);
    console.log('   Detail:', error.detail);
  } finally {
    await pool.end();
  }
}

testDatabaseConnection().catch(console.error);