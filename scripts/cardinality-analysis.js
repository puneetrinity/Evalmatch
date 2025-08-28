#!/usr/bin/env node

/**
 * Cardinality Analysis Script
 * Run database queries to determine if indexes are needed
 */

import { Pool } from 'pg';

// Use Railway aware-forgiveness database public URL for analysis
const DATABASE_PUBLIC_URL = 'postgresql://postgres:qNFtdVByQYaGptcAbSGwQsvQnAJnXLdK@tramway.proxy.rlwy.net:33895/railway';

const pool = new Pool({
  connectionString: DATABASE_PUBLIC_URL,
  ssl: { rejectUnauthorized: false }, // Required for Railway connections
});

async function runCardinalityAnalysis() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Starting Cardinality Analysis for Index Planning...\n');
    
    // Resumes table analysis
    console.log('📊 RESUMES TABLE ANALYSIS');
    const resumesAnalysis = await client.query(`
      SELECT 
        COUNT(*) as total_resumes,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT batch_id) as unique_batches,
        COUNT(*) FILTER (WHERE batch_id IS NOT NULL) as batch_resumes,
        ROUND(AVG(LENGTH(analyzed_data::text))) as avg_analysis_size
      FROM resumes
    `);
    console.table(resumesAnalysis.rows[0]);
    
    // Skills table analysis  
    console.log('\n📊 SKILLS TABLE ANALYSIS');
    const skillsAnalysis = await client.query(`
      SELECT 
        COUNT(*) as total_skills,
        COUNT(CASE WHEN aliases IS NOT NULL THEN 1 END) as skills_with_aliases,
        ROUND(AVG(LENGTH(aliases::text)), 2) as avg_aliases_length
      FROM skills
    `);
    console.table(skillsAnalysis.rows[0]);
    
    // Analysis results table analysis
    console.log('\n📊 ANALYSIS_RESULTS TABLE ANALYSIS'); 
    const analysisResultsAnalysis = await client.query(`
      SELECT 
        COUNT(*) as total_analysis_results,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT resume_id) as unique_resumes,
        COUNT(DISTINCT job_description_id) as unique_jobs,
        ROUND(AVG(LENGTH(analysis::text))) as avg_analysis_size
      FROM analysis_results
    `);
    console.table(analysisResultsAnalysis.rows[0]);
    
    // Index recommendations
    console.log('\n💡 INDEX RECOMMENDATIONS');
    const resume_data = resumesAnalysis.rows[0];
    const skills_data = skillsAnalysis.rows[0];
    const analysis_data = analysisResultsAnalysis.rows[0];
    
    console.log('✅ idx_resumes_batch_created:', resume_data.batch_resumes > 100 ? 'RECOMMENDED' : 'SKIP (low batch usage)');
    console.log('✅ idx_skills_aliases_gin:', skills_data.skills_with_aliases > 10 ? 'RECOMMENDED' : 'SKIP (few skills with aliases)');
    console.log('✅ idx_analysis_results_user_job_perf:', analysis_data.total_analysis_results > 100 ? 'RECOMMENDED' : 'SKIP (low analysis volume)');
    
    // Check existing indexes
    console.log('\n🔍 EXISTING INDEXES CHECK');
    const existingIndexes = await client.query(`
      SELECT 
        indexname, 
        tablename,
        indexdef
      FROM pg_indexes 
      WHERE schemaname = 'public'
        AND (indexname LIKE 'idx_resumes_%' 
             OR indexname LIKE 'idx_skills_%' 
             OR indexname LIKE 'idx_analysis_%')
      ORDER BY tablename, indexname
    `);
    
    if (existingIndexes.rows.length > 0) {
      console.table(existingIndexes.rows);
    } else {
      console.log('No matching indexes found - safe to create new ones');
    }
    
  } catch (error) {
    console.error('❌ Cardinality analysis failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runCardinalityAnalysis().catch(console.error);