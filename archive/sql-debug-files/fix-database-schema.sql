-- Fix database schema by adding missing user_id column to job_descriptions table
-- This should be run directly on the Railway PostgreSQL database

-- Add user_id column to job_descriptions table
ALTER TABLE job_descriptions ADD COLUMN user_id INTEGER;

-- Add analyzed_data column to job_descriptions table (stores the AI analysis)
ALTER TABLE job_descriptions ADD COLUMN analyzed_data JSON;

-- Add user_id column to resumes table if it doesn't exist
ALTER TABLE resumes ADD COLUMN user_id TEXT;

-- Add session_id column to resumes table if it doesn't exist  
ALTER TABLE resumes ADD COLUMN session_id TEXT;

-- Add analyzed_data column to resumes table if it doesn't exist
ALTER TABLE resumes ADD COLUMN analyzed_data JSON;

-- Update existing job descriptions to have a default user_id (you may need to fix this manually)
-- UPDATE job_descriptions SET user_id = 1 WHERE user_id IS NULL;

SELECT 'Schema migration completed' AS result;