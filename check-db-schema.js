import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: 'postgresql://postgres:HGKHgvEKUPhAWmISYrFnNPGFuMepRvct@viaduct.proxy.rlwy.net:57982/railway',
  ssl: { rejectUnauthorized: false }
});

async function checkSchema() {
  try {
    console.log('🔍 Connecting to Railway PostgreSQL...');
    
    // Check if resumes table exists and get its schema
    const tableQuery = `
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'resumes' 
      ORDER BY ordinal_position;
    `;
    
    const result = await pool.query(tableQuery);
    
    if (result.rows.length === 0) {
      console.log('❌ No resumes table found');
      return;
    }
    
    console.log('✅ Resumes table schema:');
    console.log('Column Name          | Data Type    | Nullable');
    console.log('---------------------|--------------|----------');
    result.rows.forEach(row => {
      console.log(`${row.column_name.padEnd(20)} | ${row.data_type.padEnd(12)} | ${row.is_nullable}`);
    });
    
    // Check analysis_results table as well
    console.log('\n🔍 Checking analysis_results table:');
    const analysisQuery = `
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'analysis_results' 
      ORDER BY ordinal_position;
    `;
    
    const analysisResult = await pool.query(analysisQuery);
    
    if (analysisResult.rows.length > 0) {
      console.log('✅ Analysis_results table schema:');
      console.log('Column Name          | Data Type    | Nullable');
      console.log('---------------------|--------------|----------');
      analysisResult.rows.forEach(row => {
        console.log(`${row.column_name.padEnd(20)} | ${row.data_type.padEnd(12)} | ${row.is_nullable}`);
      });
    }
    
    // Check if there's existing data
    console.log('\n🔍 Checking existing data:');
    const countQuery = 'SELECT COUNT(*) as count FROM resumes';
    const countResult = await pool.query(countQuery);
    console.log(`Resumes count: ${countResult.rows[0].count}`);
    
    const jobCountQuery = 'SELECT COUNT(*) as count FROM job_descriptions';
    const jobCountResult = await pool.query(jobCountQuery);
    console.log(`Job descriptions count: ${jobCountResult.rows[0].count}`);
    
  } catch (error) {
    console.error('❌ Database error:', error.message);
  } finally {
    await pool.end();
  }
}

checkSchema().catch(console.error);