/**
 * Database Schema Validation Tests
 * Ensures database schema matches application code expectations
 */

import { Pool } from 'pg';
import * as schema from '../shared/schema';

describe('Database Schema Validation', () => {
  let pool: Pool;

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL or TEST_DATABASE_URL must be set for schema tests');
    }

    pool = new Pool({
      connectionString: databaseUrl,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  describe('Table Existence', () => {
    test('All required tables should exist', async () => {
      const requiredTables = [
        'users',
        'resumes',
        'job_descriptions',
        'analysis_results',
        'interview_questions',
        'skill_categories',
        'skills'
      ];

      const query = `
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = ANY($1)
      `;

      const result = await pool.query(query, [requiredTables]);
      const existingTables = result.rows.map(row => row.table_name);

      for (const table of requiredTables) {
        expect(existingTables).toContain(table);
      }
    });
  });

  describe('Column Validation', () => {
    test('resumes table should have correct columns', async () => {
      const query = `
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'resumes'
        ORDER BY column_name
      `;

      const result = await pool.query(query);
      const columns = result.rows.reduce((acc, row) => {
        acc[row.column_name] = {
          type: row.data_type,
          nullable: row.is_nullable === 'YES'
        };
        return acc;
      }, {});

      // Required columns
      expect(columns).toHaveProperty('id');
      expect(columns).toHaveProperty('user_id');
      expect(columns).toHaveProperty('filename');
      expect(columns).toHaveProperty('content');
      expect(columns).toHaveProperty('created_at');
      expect(columns).toHaveProperty('updated_at');

      // Ensure no deprecated 'created' column exists
      expect(columns).not.toHaveProperty('created');

      // Validate data types
      expect(columns.id.type).toBe('integer');
      expect(columns.filename.type).toBe('text');
      expect(columns.created_at.type).toBe('timestamp without time zone');
    });

    test('job_descriptions table should have correct columns', async () => {
      const query = `
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'job_descriptions'
        ORDER BY column_name
      `;

      const result = await pool.query(query);
      const columns = result.rows.reduce((acc, row) => {
        acc[row.column_name] = {
          type: row.data_type,
          nullable: row.is_nullable === 'YES'
        };
        return acc;
      }, {});

      expect(columns).toHaveProperty('id');
      expect(columns).toHaveProperty('user_id');
      expect(columns).toHaveProperty('title');
      expect(columns).toHaveProperty('description');
      expect(columns).toHaveProperty('created_at');
      expect(columns).toHaveProperty('updated_at');

      expect(columns.id.type).toBe('integer');
      expect(columns.title.type).toBe('text');
      expect(columns.description.type).toBe('text');
    });

    test('analysis_results table should have correct columns', async () => {
      const query = `
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'analysis_results'
        ORDER BY column_name
      `;

      const result = await pool.query(query);
      const columns = result.rows.reduce((acc, row) => {
        acc[row.column_name] = {
          type: row.data_type,
          nullable: row.is_nullable === 'YES'
        };
        return acc;
      }, {});

      expect(columns).toHaveProperty('id');
      expect(columns).toHaveProperty('user_id');
      expect(columns).toHaveProperty('resume_id');
      expect(columns).toHaveProperty('job_description_id');
      expect(columns).toHaveProperty('match_percentage');
      expect(columns).toHaveProperty('created_at');

      // Ensure no deprecated 'created' column exists
      expect(columns).not.toHaveProperty('created');

      // Validate match_percentage is REAL not INTEGER
      expect(columns.match_percentage.type).toBe('real');
    });

    test('interview_questions table should have correct columns', async () => {
      const query = `
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'interview_questions'
        ORDER BY column_name
      `;

      const result = await pool.query(query);
      const columns = result.rows.reduce((acc, row) => {
        acc[row.column_name] = {
          type: row.data_type,
          nullable: row.is_nullable === 'YES'
        };
        return acc;
      }, {});

      expect(columns).toHaveProperty('id');
      expect(columns).toHaveProperty('user_id'); // This was the missing column!
      expect(columns).toHaveProperty('resume_id');
      expect(columns).toHaveProperty('job_description_id');
      expect(columns).toHaveProperty('questions');
      expect(columns).toHaveProperty('created_at');

      expect(columns.questions.type).toBe('json');
    });
  });

  describe('Foreign Key Constraints', () => {
    test('analysis_results should have proper foreign keys', async () => {
      const query = `
        SELECT
          tc.constraint_name,
          tc.table_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = 'analysis_results'
      `;

      const result = await pool.query(query);
      const foreignKeys = result.rows;

      // Should have foreign keys to resumes and job_descriptions
      expect(foreignKeys.some(fk => 
        fk.column_name === 'resume_id' && fk.foreign_table_name === 'resumes'
      )).toBe(true);

      expect(foreignKeys.some(fk => 
        fk.column_name === 'job_description_id' && fk.foreign_table_name === 'job_descriptions'
      )).toBe(true);
    });
  });

  describe('Index Validation', () => {
    test('Important indexes should exist', async () => {
      const query = `
        SELECT 
          indexname,
          tablename,
          indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
        AND tablename IN ('resumes', 'job_descriptions', 'analysis_results', 'interview_questions')
      `;

      const result = await pool.query(query);
      const indexes = result.rows;

      // Check for user_id indexes (important for performance)
      expect(indexes.some(idx => 
        idx.indexdef.includes('user_id') && idx.tablename === 'resumes'
      )).toBe(true);

      expect(indexes.some(idx => 
        idx.indexdef.includes('user_id') && idx.tablename === 'job_descriptions'
      )).toBe(true);
    });
  });

  describe('Data Integrity', () => {
    test('All tables should have reasonable constraints', async () => {
      // Test NOT NULL constraints on critical fields
      const query = `
        SELECT table_name, column_name, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name IN ('resumes', 'job_descriptions', 'analysis_results')
        AND column_name IN ('id', 'filename', 'title', 'description')
      `;

      const result = await pool.query(query);
      
      // All id columns should be NOT NULL
      const idColumns = result.rows.filter(row => row.column_name === 'id');
      idColumns.forEach(col => {
        expect(col.is_nullable).toBe('NO');
      });

      // Critical text fields should be NOT NULL
      const criticalFields = result.rows.filter(row => 
        ['filename', 'title', 'description'].includes(row.column_name)
      );
      criticalFields.forEach(field => {
        expect(field.is_nullable).toBe('NO');
      });
    });
  });

  describe('Migration Status', () => {
    test('Schema migrations table should exist and have records', async () => {
      const query = `
        SELECT COUNT(*) as count
        FROM information_schema.tables
        WHERE table_name = 'schema_migrations'
      `;

      const result = await pool.query(query);
      expect(parseInt(result.rows[0].count)).toBe(1);

      // Check if migrations have been run
      const migrationsQuery = `SELECT version FROM schema_migrations ORDER BY applied_at`;
      const migrations = await pool.query(migrationsQuery);
      
      expect(migrations.rows.length).toBeGreaterThan(0);
      expect(migrations.rows.some(m => m.version === '001_consolidated_schema')).toBe(true);
    });
  });
});