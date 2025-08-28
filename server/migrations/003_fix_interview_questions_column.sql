-- Fix missing 'questions' column in interview_questions table
-- This addresses the database error: column "questions" of relation "interview_questions" does not exist

-- First, ensure the interview_questions table exists with the correct structure
CREATE TABLE IF NOT EXISTS interview_questions (
    id SERIAL PRIMARY KEY,
    user_id TEXT,
    resume_id INTEGER,
    job_description_id INTEGER,
    questions JSON DEFAULT '[]'::json,
    metadata JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add missing columns if they don't exist
DO $$ 
BEGIN
    -- Add questions column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'interview_questions' AND column_name = 'questions') THEN
        ALTER TABLE interview_questions ADD COLUMN questions JSON DEFAULT '[]'::json;
    END IF;
    
    -- Add metadata column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'interview_questions' AND column_name = 'metadata') THEN
        ALTER TABLE interview_questions ADD COLUMN metadata JSON;
    END IF;
    
    -- Add user_id column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'interview_questions' AND column_name = 'user_id') THEN
        ALTER TABLE interview_questions ADD COLUMN user_id TEXT;
    END IF;
    
    -- Add created_at column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'interview_questions' AND column_name = 'created_at') THEN
        ALTER TABLE interview_questions ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    END IF;
    
    -- Add updated_at column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'interview_questions' AND column_name = 'updated_at') THEN
        ALTER TABLE interview_questions ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    END IF;
END $$;

-- Add foreign key constraints if they don't exist
DO $$ 
BEGIN
    -- Add resume foreign key constraint if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                   WHERE constraint_name = 'interview_questions_resume_id_fkey' 
                   AND table_name = 'interview_questions') THEN
        ALTER TABLE interview_questions 
        ADD CONSTRAINT interview_questions_resume_id_fkey 
        FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE;
    END IF;
    
    -- Add job_description foreign key constraint if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                   WHERE constraint_name = 'interview_questions_job_description_id_fkey' 
                   AND table_name = 'interview_questions') THEN
        ALTER TABLE interview_questions 
        ADD CONSTRAINT interview_questions_job_description_id_fkey 
        FOREIGN KEY (job_description_id) REFERENCES job_descriptions(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_interview_questions_user_id ON interview_questions(user_id);
CREATE INDEX IF NOT EXISTS idx_interview_questions_resume_id ON interview_questions(resume_id);
CREATE INDEX IF NOT EXISTS idx_interview_questions_job_id ON interview_questions(job_description_id);

-- Update any existing NULL created_at/updated_at fields
UPDATE interview_questions SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL;
UPDATE interview_questions SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL;

-- Record this migration if the table exists
INSERT INTO schema_migrations (version, description) VALUES 
('002_fix_interview_questions_column', 'Fix missing questions column in interview_questions table')
ON CONFLICT (version) DO NOTHING;