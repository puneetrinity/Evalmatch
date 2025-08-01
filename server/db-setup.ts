/**
 * Database Schema Setup
 * 
 * This module handles initializing the PostgreSQL database schema
 * for the EvalMatchAI application.
 */
import { db } from './db';
import * as schema from '@shared/schema';
import { sql } from 'drizzle-orm';

/**
 * Run initialization to create database tables
 */
export async function initializeDatabase(): Promise<{ success: boolean; message: string }> {
  try {
    console.log('Starting database schema initialization...');
    
    // Create tables in the correct order (respecting dependencies)
    await createUsersTable();
    await createResumesTable();
    await createJobDescriptionsTable();
    await createAnalysisResultsTable();
    await createInterviewQuestionsTable();
    
    console.log('Database schema initialization completed successfully');
    return { 
      success: true, 
      message: 'Database tables created successfully' 
    };
  } catch (error) {
    console.error('Error initializing database schema:', error);
    return { 
      success: false, 
      message: error instanceof Error ? error.message : 'Unknown error during database initialization'
    };
  }
}

// Create users table
async function createUsersTable() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL
      );
    `);
    console.log('- Users table created or already exists');
    return true;
  } catch (error) {
    console.error('Error creating users table:', error);
    throw error;
  }
}

// Create resumes table
async function createResumesTable() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS resumes (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        file_type TEXT NOT NULL,
        content TEXT NOT NULL,
        analyzed_data JSONB,
        session_id TEXT NOT NULL DEFAULT 'default',
        created TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
    `);
    console.log('- Resumes table created or already exists');
    return true;
  } catch (error) {
    console.error('Error creating resumes table:', error);
    throw error;
  }
}

// Create job_descriptions table
async function createJobDescriptionsTable() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS job_descriptions (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        analyzed_data JSONB,
        created TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
    `);
    console.log('- Job descriptions table created or already exists');
    return true;
  } catch (error) {
    console.error('Error creating job_descriptions table:', error);
    throw error;
  }
}

// Create analysis_results table
async function createAnalysisResultsTable() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS analysis_results (
        id SERIAL PRIMARY KEY,
        resume_id INTEGER NOT NULL,
        job_description_id INTEGER NOT NULL,
        match_percentage INTEGER NOT NULL,
        matched_skills JSONB NOT NULL,
        missing_skills JSONB NOT NULL,
        analysis JSONB NOT NULL,
        created TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
    `);
    console.log('- Analysis results table created or already exists');
    return true;
  } catch (error) {
    console.error('Error creating analysis_results table:', error);
    throw error;
  }
}

// Create interview_questions table
async function createInterviewQuestionsTable() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS interview_questions (
        id SERIAL PRIMARY KEY,
        resume_id INTEGER NOT NULL,
        job_description_id INTEGER NOT NULL,
        technical_questions JSONB NOT NULL,
        experience_questions JSONB NOT NULL,
        skill_gap_questions JSONB NOT NULL,
        created TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
    `);
    console.log('- Interview questions table created or already exists');
    return true;
  } catch (error) {
    console.error('Error creating interview_questions table:', error);
    throw error;
  }
}