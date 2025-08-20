-- Consolidated Database Migration v2.0.0
-- This migration consolidates all scattered fixes and creates the authoritative schema
-- Handles existing tables by adding missing columns and creating new tables as needed
-- Run date: 2025-01-31

-- ============================================================================
-- MIGRATION TRACKING TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    version VARCHAR(50) UNIQUE NOT NULL,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    description TEXT
);

-- Record this migration
INSERT INTO schema_migrations (version, description) 
VALUES ('001_consolidated_schema', 'Consolidated database schema with all fixes')
ON CONFLICT (version) DO NOTHING;

-- ============================================================================
-- CORE TABLES CREATION
-- ============================================================================

-- Users table (Firebase UID based)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE,
    password TEXT, -- Legacy field, not used with Firebase
    email VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Resumes table (comprehensive with all fields)
CREATE TABLE IF NOT EXISTS resumes (
    id SERIAL PRIMARY KEY,
    filename TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Job descriptions table (comprehensive with all fields)
CREATE TABLE IF NOT EXISTS job_descriptions (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Analysis results with enhanced scoring
CREATE TABLE IF NOT EXISTS analysis_results (
    id SERIAL PRIMARY KEY,
    resume_id INTEGER,
    job_description_id INTEGER,
    match_percentage REAL NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Interview questions table
CREATE TABLE IF NOT EXISTS interview_questions (
    id SERIAL PRIMARY KEY,
    resume_id INTEGER,
    job_description_id INTEGER,
    questions JSON DEFAULT '[]'::json,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- SKILLS HIERARCHY SYSTEM
-- ============================================================================

-- Skill categories for hierarchical organization
CREATE TABLE IF NOT EXISTS skill_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    parent_id INTEGER REFERENCES skill_categories(id),
    level INTEGER DEFAULT 0,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Skills table with embeddings and relationships
CREATE TABLE IF NOT EXISTS skills (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    normalized_name VARCHAR(255) NOT NULL,
    category_id INTEGER REFERENCES skill_categories(id),
    aliases JSON DEFAULT '[]'::json, -- Alternative names
    embedding JSON, -- Vector embeddings for semantic matching
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- ADD MISSING COLUMNS TO EXISTING TABLES
-- ============================================================================

-- Add missing columns to resumes table
DO $$ 
BEGIN
    -- Add user_id column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'resumes' AND column_name = 'user_id') THEN
        ALTER TABLE resumes ADD COLUMN user_id TEXT;
    END IF;
    
    -- Add session_id column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'resumes' AND column_name = 'session_id') THEN
        ALTER TABLE resumes ADD COLUMN session_id TEXT;
    END IF;
    
    -- Add other missing columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'resumes' AND column_name = 'file_size') THEN
        ALTER TABLE resumes ADD COLUMN file_size INTEGER;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'resumes' AND column_name = 'file_type') THEN
        ALTER TABLE resumes ADD COLUMN file_type TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'resumes' AND column_name = 'content') THEN
        ALTER TABLE resumes ADD COLUMN content TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'resumes' AND column_name = 'skills') THEN
        ALTER TABLE resumes ADD COLUMN skills JSON DEFAULT '[]'::json;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'resumes' AND column_name = 'experience') THEN
        ALTER TABLE resumes ADD COLUMN experience TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'resumes' AND column_name = 'education') THEN
        ALTER TABLE resumes ADD COLUMN education TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'resumes' AND column_name = 'embedding') THEN
        ALTER TABLE resumes ADD COLUMN embedding JSON;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'resumes' AND column_name = 'skills_embedding') THEN
        ALTER TABLE resumes ADD COLUMN skills_embedding JSON;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'resumes' AND column_name = 'analyzed_data') THEN
        ALTER TABLE resumes ADD COLUMN analyzed_data JSON;
    END IF;
END $$;

-- Add missing columns to job_descriptions table
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'job_descriptions' AND column_name = 'user_id') THEN
        ALTER TABLE job_descriptions ADD COLUMN user_id TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'job_descriptions' AND column_name = 'requirements') THEN
        ALTER TABLE job_descriptions ADD COLUMN requirements JSON DEFAULT '[]'::json;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'job_descriptions' AND column_name = 'skills') THEN
        ALTER TABLE job_descriptions ADD COLUMN skills JSON DEFAULT '[]'::json;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'job_descriptions' AND column_name = 'experience') THEN
        ALTER TABLE job_descriptions ADD COLUMN experience TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'job_descriptions' AND column_name = 'embedding') THEN
        ALTER TABLE job_descriptions ADD COLUMN embedding JSON;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'job_descriptions' AND column_name = 'requirements_embedding') THEN
        ALTER TABLE job_descriptions ADD COLUMN requirements_embedding JSON;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'job_descriptions' AND column_name = 'analyzed_data') THEN
        ALTER TABLE job_descriptions ADD COLUMN analyzed_data JSON;
    END IF;
END $$;

-- Add missing columns to analysis_results table
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'analysis_results' AND column_name = 'user_id') THEN
        ALTER TABLE analysis_results ADD COLUMN user_id TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'analysis_results' AND column_name = 'matched_skills') THEN
        ALTER TABLE analysis_results ADD COLUMN matched_skills JSON DEFAULT '[]'::json;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'analysis_results' AND column_name = 'missing_skills') THEN
        ALTER TABLE analysis_results ADD COLUMN missing_skills JSON DEFAULT '[]'::json;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'analysis_results' AND column_name = 'candidate_strengths') THEN
        ALTER TABLE analysis_results ADD COLUMN candidate_strengths JSON DEFAULT '[]'::json;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'analysis_results' AND column_name = 'candidate_weaknesses') THEN
        ALTER TABLE analysis_results ADD COLUMN candidate_weaknesses JSON DEFAULT '[]'::json;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'analysis_results' AND column_name = 'confidence_level') THEN
        ALTER TABLE analysis_results ADD COLUMN confidence_level VARCHAR(10);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'analysis_results' AND column_name = 'semantic_similarity') THEN
        ALTER TABLE analysis_results ADD COLUMN semantic_similarity REAL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'analysis_results' AND column_name = 'skills_similarity') THEN
        ALTER TABLE analysis_results ADD COLUMN skills_similarity REAL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'analysis_results' AND column_name = 'experience_similarity') THEN
        ALTER TABLE analysis_results ADD COLUMN experience_similarity REAL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'analysis_results' AND column_name = 'education_similarity') THEN
        ALTER TABLE analysis_results ADD COLUMN education_similarity REAL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'analysis_results' AND column_name = 'ml_confidence_score') THEN
        ALTER TABLE analysis_results ADD COLUMN ml_confidence_score REAL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'analysis_results' AND column_name = 'scoring_dimensions') THEN
        ALTER TABLE analysis_results ADD COLUMN scoring_dimensions JSON;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'analysis_results' AND column_name = 'fairness_metrics') THEN
        ALTER TABLE analysis_results ADD COLUMN fairness_metrics JSON;
    END IF;
    
    -- Add missing columns that are causing database errors
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'analysis_results' AND column_name = 'processing_time') THEN
        ALTER TABLE analysis_results ADD COLUMN processing_time INTEGER;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'analysis_results' AND column_name = 'ai_provider') THEN
        ALTER TABLE analysis_results ADD COLUMN ai_provider VARCHAR(50);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'analysis_results' AND column_name = 'model_version') THEN
        ALTER TABLE analysis_results ADD COLUMN model_version VARCHAR(50);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'analysis_results' AND column_name = 'processing_flags') THEN
        ALTER TABLE analysis_results ADD COLUMN processing_flags JSON;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'analysis_results' AND column_name = 'recommendations') THEN
        ALTER TABLE analysis_results ADD COLUMN recommendations JSON DEFAULT '[]'::json;
    END IF;
END $$;

-- Add missing columns to interview_questions table
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'interview_questions' AND column_name = 'user_id') THEN
        ALTER TABLE interview_questions ADD COLUMN user_id TEXT;
    END IF;
END $$;

-- ============================================================================
-- DATA TYPE CORRECTIONS
-- ============================================================================

-- Fix any existing data type mismatches
DO $$ 
BEGIN
    -- Fix match_percentage to be REAL (not INTEGER)
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'analysis_results' AND column_name = 'match_percentage' 
               AND data_type = 'integer') THEN
        ALTER TABLE analysis_results ALTER COLUMN match_percentage TYPE REAL;
    END IF;
END $$;

-- ============================================================================
-- ADD FOREIGN KEY CONSTRAINTS (if they don't exist)
-- ============================================================================

DO $$ 
BEGIN
    -- Add resume foreign key constraint to analysis_results if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                   WHERE constraint_name = 'analysis_results_resume_id_fkey' 
                   AND table_name = 'analysis_results') THEN
        ALTER TABLE analysis_results 
        ADD CONSTRAINT analysis_results_resume_id_fkey 
        FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE;
    END IF;
    
    -- Add job_description foreign key constraint to analysis_results if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                   WHERE constraint_name = 'analysis_results_job_description_id_fkey' 
                   AND table_name = 'analysis_results') THEN
        ALTER TABLE analysis_results 
        ADD CONSTRAINT analysis_results_job_description_id_fkey 
        FOREIGN KEY (job_description_id) REFERENCES job_descriptions(id) ON DELETE CASCADE;
    END IF;
    
    -- Add resume foreign key constraint to interview_questions if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                   WHERE constraint_name = 'interview_questions_resume_id_fkey' 
                   AND table_name = 'interview_questions') THEN
        ALTER TABLE interview_questions 
        ADD CONSTRAINT interview_questions_resume_id_fkey 
        FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE;
    END IF;
    
    -- Add job_description foreign key constraint to interview_questions if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                   WHERE constraint_name = 'interview_questions_job_description_id_fkey' 
                   AND table_name = 'interview_questions') THEN
        ALTER TABLE interview_questions 
        ADD CONSTRAINT interview_questions_job_description_id_fkey 
        FOREIGN KEY (job_description_id) REFERENCES job_descriptions(id) ON DELETE CASCADE;
    END IF;
END $$;

-- ============================================================================
-- INDEXES FOR PERFORMANCE (only after columns exist)
-- ============================================================================

-- User-based queries (most common)
CREATE INDEX IF NOT EXISTS idx_resumes_user_id ON resumes(user_id);
CREATE INDEX IF NOT EXISTS idx_job_descriptions_user_id ON job_descriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_analysis_results_user_id ON analysis_results(user_id);
CREATE INDEX IF NOT EXISTS idx_interview_questions_user_id ON interview_questions(user_id);

-- Foreign key relationships
CREATE INDEX IF NOT EXISTS idx_analysis_results_resume_id ON analysis_results(resume_id);
CREATE INDEX IF NOT EXISTS idx_analysis_results_job_id ON analysis_results(job_description_id);
CREATE INDEX IF NOT EXISTS idx_interview_questions_resume_id ON interview_questions(resume_id); 
CREATE INDEX IF NOT EXISTS idx_interview_questions_job_id ON interview_questions(job_description_id);

-- Skills system indexes
CREATE INDEX IF NOT EXISTS idx_skills_normalized_name ON skills(normalized_name);
CREATE INDEX IF NOT EXISTS idx_skills_category_id ON skills(category_id);
CREATE INDEX IF NOT EXISTS idx_skill_categories_parent_id ON skill_categories(parent_id);

-- Session-based queries
CREATE INDEX IF NOT EXISTS idx_resumes_session_id ON resumes(session_id);

-- Timestamp-based queries (for cleanup and analytics)
CREATE INDEX IF NOT EXISTS idx_resumes_created_at ON resumes(created_at);
CREATE INDEX IF NOT EXISTS idx_job_descriptions_created_at ON job_descriptions(created_at);
CREATE INDEX IF NOT EXISTS idx_analysis_results_created_at ON analysis_results(created_at);

-- ============================================================================
-- INITIAL SKILL CATEGORIES
-- ============================================================================

INSERT INTO skill_categories (name, level, description) VALUES
    ('Frontend Development', 0, 'Client-side web development technologies'),
    ('Backend Development', 0, 'Server-side development and APIs'),
    ('Mobile Development', 0, 'Mobile application development'),
    ('Database Technologies', 0, 'Database systems and data management'),
    ('Cloud & DevOps', 0, 'Cloud platforms and deployment technologies'),
    ('Machine Learning & AI', 0, 'Artificial intelligence and data science'),
    ('Programming Languages', 0, 'Programming and scripting languages'),
    ('Testing & Quality Assurance', 0, 'Software testing and QA practices'),
    ('Design & UX', 0, 'User experience and interface design'),
    ('Soft Skills', 0, 'Communication and interpersonal skills')
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- CLEANUP LEGACY DATA
-- ============================================================================

-- Remove any duplicate or orphaned records
DELETE FROM analysis_results WHERE resume_id IS NOT NULL AND resume_id NOT IN (SELECT id FROM resumes);
DELETE FROM analysis_results WHERE job_description_id IS NOT NULL AND job_description_id NOT IN (SELECT id FROM job_descriptions);
DELETE FROM interview_questions WHERE resume_id IS NOT NULL AND resume_id NOT IN (SELECT id FROM resumes);
DELETE FROM interview_questions WHERE job_description_id IS NOT NULL AND job_description_id NOT IN (SELECT id FROM job_descriptions);

-- Update any NULL created_at/updated_at fields
UPDATE resumes SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL;
UPDATE resumes SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL;
UPDATE job_descriptions SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL;
UPDATE job_descriptions SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL;
UPDATE analysis_results SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL;
UPDATE analysis_results SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL;

-- ============================================================================
-- REMOVE DEPRECATED COLUMNS
-- ============================================================================

-- Remove deprecated 'created' columns (keeping only 'created_at' for consistency)
DO $$ 
BEGIN
    -- Remove 'created' column from resumes if it exists
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'resumes' AND column_name = 'created') THEN
        ALTER TABLE resumes DROP COLUMN created;
    END IF;
    
    -- Remove 'created' column from analysis_results if it exists  
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'analysis_results' AND column_name = 'created') THEN
        ALTER TABLE analysis_results DROP COLUMN created;
    END IF;
END $$;