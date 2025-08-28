/**
 * Phase 0.1a: Verify Foreign Key Constraints (Migration 007 check)
 * 
 * Checks if critical foreign key constraints from Migration 007 exist
 * in the Railway production database and validates data integrity.
 */

import pkg from 'pg';
const { Client } = pkg;

// Critical foreign key constraints that should exist
const CRITICAL_CONSTRAINTS = [
  {
    table: 'skill_categories',
    constraint: 'fk_skill_categories_parent',
    column: 'parent_id',
    references: 'skill_categories(id)',
    criticality: 'MEDIUM',
    reason: 'Self-referencing hierarchy for skill categories'
  },
  {
    table: 'skills', 
    constraint: 'fk_skills_category',
    column: 'category_id',
    references: 'skill_categories(id)', 
    criticality: 'MEDIUM',
    reason: 'Links skills to their categories'
  },
  {
    table: 'analysis_results',
    constraint: 'fk_analysis_results_resume', 
    column: 'resume_id',
    references: 'resumes(id)',
    criticality: 'HIGH',
    reason: 'Prevents orphaned analysis data under concurrent load'
  },
  {
    table: 'analysis_results',
    constraint: 'fk_analysis_results_job',
    column: 'job_description_id', 
    references: 'job_descriptions(id)',
    criticality: 'HIGH', 
    reason: 'Prevents orphaned job analysis data'
  },
  {
    table: 'interview_questions',
    constraint: 'fk_interview_questions_resume',
    column: 'resume_id',
    references: 'resumes(id)',
    criticality: 'MEDIUM',
    reason: 'Links interview questions to specific resume'
  },
  {
    table: 'interview_questions',
    constraint: 'fk_interview_questions_job',
    column: 'job_description_id',
    references: 'job_descriptions(id)',
    criticality: 'MEDIUM', 
    reason: 'Links interview questions to specific job description'
  }
];

async function verifyForeignKeyConstraints() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    console.log('🔗 Connected to Railway PostgreSQL database');
    
    const results = {
      isValid: true,
      criticalIssues: [],
      recommendations: [],
      existingConstraints: [],
      missingConstraints: [],
      orphanedDataFound: []
    };

    // Step 1: Get all existing foreign key constraints
    console.log('\n📋 Step 1: Checking existing foreign key constraints...');
    
    const constraintQuery = `
      SELECT 
        tc.table_name,
        tc.constraint_name,
        tc.constraint_type,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name  
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      ORDER BY tc.table_name, tc.constraint_name;
    `;
    
    const constraintResult = await client.query(constraintQuery);
    results.existingConstraints = constraintResult.rows;
    
    console.log(`✅ Found ${constraintResult.rows.length} existing foreign key constraints`);
    
    // Step 2: Check each critical constraint
    console.log('\n🔍 Step 2: Verifying critical constraints...');
    
    for (const expectedConstraint of CRITICAL_CONSTRAINTS) {
      const found = constraintResult.rows.find(existing => 
        existing.table_name === expectedConstraint.table &&
        existing.column_name === expectedConstraint.column &&
        existing.constraint_name.toLowerCase().includes(expectedConstraint.constraint.replace('fk_', '').toLowerCase())
      );
      
      if (found) {
        console.log(`✅ ${expectedConstraint.table}.${expectedConstraint.column} → ${expectedConstraint.references}`);
      } else {
        console.log(`❌ MISSING: ${expectedConstraint.table}.${expectedConstraint.column} → ${expectedConstraint.references}`);
        
        results.missingConstraints.push(expectedConstraint);
        
        if (expectedConstraint.criticality === 'HIGH') {
          results.criticalIssues.push(
            `CRITICAL: Missing foreign key ${expectedConstraint.table}.${expectedConstraint.column} -> ${expectedConstraint.references}. ` +
            `This will cause data integrity issues under 100-user load. Reason: ${expectedConstraint.reason}`
          );
          results.isValid = false;
        } else {
          results.recommendations.push(
            `Recommended: Add foreign key ${expectedConstraint.table}.${expectedConstraint.column} -> ${expectedConstraint.references}. ` +
            `Reason: ${expectedConstraint.reason}`
          );
        }
      }
    }

    // Step 3: Check for orphaned data that would prevent constraint creation
    console.log('\n🔍 Step 3: Checking for orphaned data...');
    
    const orphanChecks = [
      {
        name: 'orphaned_analysis_results_resume',
        query: `
          SELECT COUNT(*) as count FROM analysis_results
          WHERE resume_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM resumes r WHERE r.id = resume_id)
        `
      },
      {
        name: 'orphaned_analysis_results_job',
        query: `
          SELECT COUNT(*) as count FROM analysis_results
          WHERE job_description_id IS NOT NULL  
          AND NOT EXISTS (SELECT 1 FROM job_descriptions jd WHERE jd.id = job_description_id)
        `
      },
      {
        name: 'orphaned_skills_category',
        query: `
          SELECT COUNT(*) as count FROM skills
          WHERE category_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM skill_categories sc WHERE sc.id = category_id)
        `
      },
      {
        name: 'orphaned_skill_categories_parent',
        query: `
          SELECT COUNT(*) as count FROM skill_categories
          WHERE parent_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM skill_categories sc WHERE sc.id = parent_id)
        `
      }
    ];

    for (const check of orphanChecks) {
      try {
        const result = await client.query(check.query);
        const count = parseInt(result.rows[0]?.count || 0);
        
        if (count > 0) {
          console.log(`⚠️  Found ${count} orphaned records for ${check.name}`);
          results.orphanedDataFound.push({ check: check.name, count });
          results.criticalIssues.push(`Found ${count} orphaned records for ${check.name}`);
          results.isValid = false;
        } else {
          console.log(`✅ No orphaned data for ${check.name}`);
        }
      } catch (error) {
        console.log(`❌ Error checking ${check.name}: ${error.message}`);
      }
    }

    // Step 4: Generate summary report
    console.log('\n📊 FOREIGN KEY CONSTRAINT VERIFICATION REPORT');
    console.log('================================================');
    console.log(`Overall Status: ${results.isValid ? '✅ VALID' : '❌ ISSUES FOUND'}`);
    console.log(`Existing Constraints: ${results.existingConstraints.length}`);
    console.log(`Missing Critical Constraints: ${results.missingConstraints.filter(c => c.criticality === 'HIGH').length}`);
    console.log(`Missing Recommended Constraints: ${results.missingConstraints.filter(c => c.criticality === 'MEDIUM').length}`);
    console.log(`Orphaned Data Issues: ${results.orphanedDataFound.length}`);
    
    if (results.criticalIssues.length > 0) {
      console.log('\n🚨 CRITICAL ISSUES:');
      results.criticalIssues.forEach(issue => console.log(`   ${issue}`));
    }
    
    if (results.recommendations.length > 0) {
      console.log('\n💡 RECOMMENDATIONS:');
      results.recommendations.forEach(rec => console.log(`   ${rec}`));
    }

    // Step 5: Next Steps
    console.log('\n🛠️  NEXT STEPS:');
    if (!results.isValid) {
      console.log('   1. Proceed to Phase 0.1b: Repair missing FK constraints + cleanup orphaned data');
      console.log('   2. Run Migration 007 repair script to fix missing constraints');
      console.log('   3. Re-run this verification after repairs');
    } else {
      console.log('   1. ✅ All critical constraints exist - proceed to Phase 0.1c');
      console.log('   2. 🎯 Database is ready for 100-user load testing');
    }

    return results;

  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    throw error;
  } finally {
    await client.end();
    console.log('🔌 Database connection closed');
  }
}

// Run verification if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  verifyForeignKeyConstraints()
    .then(results => {
      process.exit(results.isValid ? 0 : 1);
    })
    .catch(error => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}

export { verifyForeignKeyConstraints, CRITICAL_CONSTRAINTS };