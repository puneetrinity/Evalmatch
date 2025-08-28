/**
 * Phase 0.1a: Comprehensive Foreign Key Constraint Verification
 * 
 * Admin endpoint to check ALL foreign key constraints across the entire database
 * Not limited to Migration 007 - checks complete database integrity
 */

import { Router, Request, Response } from "express";
import { executeQuery } from "../../database/index.js";
import { logger } from "../../lib/logger.js";

const router = Router();

router.get('/foreign-key-check', async (req: Request, res: Response) => {
  try {
    logger.info('Starting comprehensive foreign key constraint verification for ALL tables');

    const results = {
      isValid: true,
      criticalIssues: [] as string[],
      warnings: [] as string[],
      allConstraints: [] as any[],
      missingConstraints: [] as any[],
      orphanedDataFound: [] as any[],
      tableAnalysis: {} as any,
      timestamp: new Date().toISOString(),
      phase: 'Phase 0.1a - Complete Database FK Verification'
    };

    // Step 1: Get ALL existing foreign key constraints
    logger.info('Step 1: Getting all existing foreign key constraints');
    const constraintQuery = `
      SELECT 
        tc.table_name,
        tc.constraint_name,
        tc.constraint_type,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        rc.delete_rule,
        rc.update_rule
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name  
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
      LEFT JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      ORDER BY tc.table_name, tc.constraint_name;
    `;
    
    const constraintResult = await executeQuery(constraintQuery);
    results.allConstraints = constraintResult;
    
    // Step 2: Get ALL tables to analyze for potential foreign key relationships
    logger.info('Step 2: Analyzing all tables for potential foreign key relationships');
    const tablesQuery = `
      SELECT 
        t.table_name,
        array_agg(c.column_name ORDER BY c.ordinal_position) as columns
      FROM information_schema.tables t
      JOIN information_schema.columns c ON t.table_name = c.table_name
      WHERE t.table_schema = 'public' 
      AND t.table_type = 'BASE TABLE'
      AND t.table_name NOT LIKE 'pg_%'
      GROUP BY t.table_name
      ORDER BY t.table_name;
    `;
    
    const tablesResult = await executeQuery(tablesQuery);
    
    // Step 3: Analyze each table for foreign key relationships
    logger.info('Step 3: Analyzing potential foreign key relationships');
    for (const table of tablesResult) {
      const tableName = table.table_name;
      const columns = table.columns;
      
      results.tableAnalysis[tableName] = {
        totalColumns: columns.length,
        foreignKeyColumns: [],
        existingConstraints: [],
        potentialConstraints: [],
        orphanedData: []
      };

      // Find existing constraints for this table
      const existingConstraints = constraintResult.filter((c: any) => c.table_name === tableName);
      results.tableAnalysis[tableName].existingConstraints = existingConstraints;

      // Look for columns that might be foreign keys (end with _id and reference other tables)
      for (const column of columns) {
        if (column.endsWith('_id') || column === 'user_id' || column === 'parent_id') {
          // Check if this column already has a foreign key constraint
          const hasConstraint = existingConstraints.some((c: any) => c.column_name === column);
          
          if (!hasConstraint) {
            // Try to find the referenced table
            let referencedTable = '';
            if (column === 'user_id') referencedTable = 'users';
            else if (column === 'parent_id') referencedTable = tableName; // Self-reference
            else if (column.endsWith('_id')) {
              const baseColumn = column.replace('_id', '');
              // Try singular and plural forms
              referencedTable = baseColumn + 's'; // e.g. category_id -> categories
              if (baseColumn.endsWith('y')) {
                referencedTable = baseColumn.slice(0, -1) + 'ies'; // e.g. category -> categories
              }
              // Check if plural table exists
              const tableExists = tablesResult.some((t: any) => t.table_name === referencedTable);
              if (!tableExists) {
                referencedTable = baseColumn; // Try singular form
              }
            }

            // Check if referenced table exists
            const referencedTableExists = tablesResult.some((t: any) => t.table_name === referencedTable);
            
            if (referencedTableExists) {
              results.tableAnalysis[tableName].potentialConstraints.push({
                column: column,
                referencedTable: referencedTable,
                referencedColumn: 'id', // Assume 'id' as primary key
                priority: column.includes('user') || column.includes('resume') || column.includes('job') ? 'HIGH' : 'MEDIUM'
              });
            }

            results.tableAnalysis[tableName].foreignKeyColumns.push({
              column: column,
              hasConstraint: false,
              referencedTable: referencedTable,
              exists: referencedTableExists
            });
          } else {
            results.tableAnalysis[tableName].foreignKeyColumns.push({
              column: column,
              hasConstraint: true,
              constraintName: existingConstraints.find((c: any) => c.column_name === column)?.constraint_name
            });
          }
        }
      }
    }

    // Step 4: Check for orphaned data in ALL potential foreign key relationships
    logger.info('Step 4: Checking for orphaned data across all tables');
    for (const [tableName, analysis] of Object.entries(results.tableAnalysis)) {
      const tableAnalysis = analysis as any;
      
      for (const potentialConstraint of tableAnalysis.potentialConstraints) {
        try {
          const orphanQuery = `
            SELECT COUNT(*) as count FROM ${tableName}
            WHERE ${potentialConstraint.column} IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM ${potentialConstraint.referencedTable} 
              WHERE ${potentialConstraint.referencedColumn} = ${tableName}.${potentialConstraint.column}
            )
          `;
          
          const orphanResult = await executeQuery(orphanQuery);
          const count = parseInt(orphanResult[0]?.count || 0);
          
          if (count > 0) {
            const orphanInfo = {
              table: tableName,
              column: potentialConstraint.column,
              referencedTable: potentialConstraint.referencedTable,
              count: count,
              priority: potentialConstraint.priority
            };
            
            results.orphanedDataFound.push(orphanInfo);
            tableAnalysis.orphanedData.push(orphanInfo);
            
            if (potentialConstraint.priority === 'HIGH') {
              results.criticalIssues.push(
                `CRITICAL: ${count} orphaned records in ${tableName}.${potentialConstraint.column} -> ${potentialConstraint.referencedTable}.id`
              );
              results.isValid = false;
            } else {
              results.warnings.push(
                `WARNING: ${count} orphaned records in ${tableName}.${potentialConstraint.column} -> ${potentialConstraint.referencedTable}.id`
              );
            }
          }
        } catch (error) {
          logger.warn(`Error checking orphaned data for ${tableName}.${potentialConstraint.column}:`, error);
        }
      }
    }

    // Step 5: Generate comprehensive summary and recommendations
    const totalTables = Object.keys(results.tableAnalysis).length;
    const totalConstraints = results.allConstraints.length;
    const totalPotentialConstraints = Object.values(results.tableAnalysis)
      .reduce((sum: number, analysis: any) => sum + analysis.potentialConstraints.length, 0);

    const summary = {
      status: results.isValid ? 'VALID' : 'CRITICAL_ISSUES_FOUND',
      totalTables: totalTables,
      existingConstraints: totalConstraints,
      potentialMissingConstraints: totalPotentialConstraints,
      criticalIssues: results.criticalIssues.length,
      warnings: results.warnings.length,
      orphanedDataIssues: results.orphanedDataFound.length,
      tablesWithIssues: Object.entries(results.tableAnalysis)
        .filter(([, analysis]) => (analysis as any).orphanedData.length > 0)
        .length
    };

    // Generate recommendations
    const recommendations = [];
    if (results.criticalIssues.length > 0) {
      recommendations.push('🚨 IMMEDIATE ACTION REQUIRED: Clean up orphaned data before adding constraints');
      recommendations.push('Proceed to Phase 0.1b: Repair missing FK constraints + cleanup orphaned data');
    }
    
    if (totalPotentialConstraints > 0) {
      recommendations.push(`Consider adding ${totalPotentialConstraints} foreign key constraints for data integrity`);
    }
    
    if (results.isValid) {
      recommendations.push('✅ Database integrity is good - proceed to Phase 0.1c');
      recommendations.push('🎯 Database is ready for 100-user load testing');
    }

    const response = {
      success: true,
      data: {
        ...results,
        summary,
        recommendations,
        detailedAnalysis: {
          constraintsByTable: Object.fromEntries(
            Object.entries(results.tableAnalysis).map(([table, analysis]) => [
              table, 
              {
                existing: (analysis as any).existingConstraints.length,
                potential: (analysis as any).potentialConstraints.length,
                orphaned: (analysis as any).orphanedData.length
              }
            ])
          )
        }
      },
      timestamp: new Date().toISOString()
    };

    const statusCode = results.isValid ? 200 : 422;
    res.status(statusCode).json(response);

    logger.info('Complete database foreign key verification finished', {
      totalTables: totalTables,
      totalConstraints: totalConstraints,
      criticalIssues: results.criticalIssues.length,
      warnings: results.warnings.length,
      isValid: results.isValid
    });

  } catch (error) {
    logger.error('Complete foreign key verification failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify database foreign key constraints',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;