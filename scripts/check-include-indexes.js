#!/usr/bin/env node

/**
 * Check for indexes with INCLUDE clauses containing large JSONB columns
 */

import { Pool } from 'pg';

// Use Railway aware-forgiveness database public URL
const DATABASE_PUBLIC_URL = 'postgresql://postgres:qNFtdVByQYaGptcAbSGwQsvQnAJnXLdK@tramway.proxy.rlwy.net:33895/railway';

const pool = new Pool({
  connectionString: DATABASE_PUBLIC_URL,
  ssl: { rejectUnauthorized: false },
});

async function checkIncludeIndexes() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Checking for indexes with INCLUDE clauses containing large columns...\n');
    
    // Check for indexes with INCLUDE clauses
    console.log('📋 INDEXES WITH INCLUDE CLAUSES');
    const includeIndexes = await client.query(`
      SELECT 
        indexname,
        tablename,
        indexdef
      FROM pg_indexes 
      WHERE schemaname = 'public'
        AND indexdef LIKE '%INCLUDE%'
      ORDER BY tablename, indexname
    `);
    
    if (includeIndexes.rows.length > 0) {
      console.table(includeIndexes.rows);
      
      // Check if any include JSONB columns
      console.log('\n🔍 ANALYZING INCLUDE CLAUSES FOR LARGE COLUMNS...');
      for (const index of includeIndexes.rows) {
        const indexDef = index.indexdef.toLowerCase();
        
        // Check for potential large column types in INCLUDE
        const largeCols = [];
        if (indexDef.includes('analyzed_data')) largeCols.push('analyzed_data (JSONB)');
        if (indexDef.includes('analysis')) largeCols.push('analysis (JSONB/JSON)');
        if (indexDef.includes('aliases')) largeCols.push('aliases (JSONB/JSON)');
        if (indexDef.includes('skills_matched')) largeCols.push('skills_matched (JSONB)');
        if (indexDef.includes('resume_sections')) largeCols.push('resume_sections (JSONB)');
        
        if (largeCols.length > 0) {
          console.log(`⚠️  ${index.indexname} on ${index.tablename}: Contains large columns in INCLUDE: ${largeCols.join(', ')}`);
          console.log(`   Definition: ${index.indexdef}`);
        } else {
          console.log(`✅ ${index.indexname} on ${index.tablename}: No large columns detected in INCLUDE`);
        }
      }
    } else {
      console.log('✅ No indexes with INCLUDE clauses found - no optimization needed');
    }
    
    // Also check for potentially problematic indexes by size
    console.log('\n📊 INDEX SIZE ANALYSIS');
    const indexSizes = await client.query(`
      SELECT 
        schemaname,
        tablename,
        indexname,
        pg_size_pretty(pg_relation_size(indexrelid)) as size,
        pg_relation_size(indexrelid) as size_bytes
      FROM pg_stat_user_indexes 
      WHERE schemaname = 'public'
        AND indexname NOT LIKE 'pg_%'
      ORDER BY pg_relation_size(indexrelid) DESC
      LIMIT 20
    `);
    
    if (indexSizes.rows.length > 0) {
      console.table(indexSizes.rows);
      
      // Flag unusually large indexes
      console.log('\n💡 INDEX SIZE RECOMMENDATIONS:');
      for (const index of indexSizes.rows) {
        const sizeMB = Math.round(index.size_bytes / 1024 / 1024);
        if (sizeMB > 10) {
          console.log(`⚠️  ${index.indexname}: ${index.size} - Consider reviewing for large INCLUDE columns`);
        } else if (sizeMB > 1) {
          console.log(`ℹ️  ${index.indexname}: ${index.size} - Normal size for active index`);
        } else {
          console.log(`✅ ${index.indexname}: ${index.size} - Efficient size`);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Include index check failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

checkIncludeIndexes().catch(console.error);