-- Consolidated Database Migration v1.0.0
-- This migration consolidates all scattered fixes and creates the authoritative schema
-- Run date: 2025-01-30

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
-- CORE TABLES
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
    user_id TEXT, -- Firebase UID
    session_id TEXT,
    filename TEXT NOT NULL,
    file_size INTEGER,
    file_type TEXT,
    content TEXT,
    skills JSON DEFAULT '[]'::json,
    experience TEXT,
    education TEXT,
    embedding JSON, -- Vector embeddings for semantic search
    skills_embedding JSON, -- Skill-specific embeddings
    analyzed_data JSON, -- Complete AI analysis results
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Job descriptions table (comprehensive with all fields)
CREATE TABLE IF NOT EXISTS job_descriptions (
    id SERIAL PRIMARY KEY,
    user_id TEXT, -- Firebase UID 
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    requirements JSON DEFAULT '[]'::json,
    skills JSON DEFAULT '[]'::json,
    experience TEXT,
    embedding JSON, -- Vector embeddings for semantic search
    requirements_embedding JSON, -- Requirements-specific embeddings
    analyzed_data JSON, -- Complete AI analysis results
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
-- ANALYSIS AND MATCHING SYSTEM
-- ============================================================================

-- Analysis results with enhanced scoring
CREATE TABLE IF NOT EXISTS analysis_results (
    id SERIAL PRIMARY KEY,
    user_id TEXT, -- Firebase UID
    resume_id INTEGER REFERENCES resumes(id) ON DELETE CASCADE,
    job_description_id INTEGER REFERENCES job_descriptions(id) ON DELETE CASCADE,
    
    -- Core matching results
    match_percentage REAL NOT NULL,
    matched_skills JSON DEFAULT '[]'::json, -- [{"skill": "JavaScript", "matchPercentage": 95}]
    missing_skills JSON DEFAULT '[]'::json, -- ["Python", "Docker"]
    candidate_strengths JSON DEFAULT '[]'::json,
    candidate_weaknesses JSON DEFAULT '[]'::json,
    confidence_level VARCHAR(10) CHECK (confidence_level IN ('low', 'medium', 'high')),
    
    -- Enhanced scoring dimensions
    semantic_similarity REAL,
    skills_similarity REAL,
    experience_similarity REAL,
    education_similarity REAL,
    
    -- ML-based scoring breakdown
    ml_confidence_score REAL,
    scoring_dimensions JSON, -- {"skills": 0.45, "experience": 0.25, ...}
    
    -- Fairness and bias metrics
    fairness_metrics JSON, -- {"biasConfidenceScore": 85, "potentialBiasAreas": [...]}
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Interview questions table
CREATE TABLE IF NOT EXISTS interview_questions (
    id SERIAL PRIMARY KEY,
    user_id TEXT, -- Firebase UID
    resume_id INTEGER REFERENCES resumes(id) ON DELETE CASCADE,
    job_description_id INTEGER REFERENCES job_descriptions(id) ON DELETE CASCADE,
    questions JSON DEFAULT '[]'::json, -- Array of question objects
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
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
-- DATA TYPE CORRECTIONS
-- ============================================================================

-- Fix any existing data type mismatches
DO $$ 
BEGIN
    -- Fix user_id columns to be TEXT for Firebase UIDs
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'job_descriptions' AND column_name = 'user_id' 
               AND data_type != 'text') THEN
        ALTER TABLE job_descriptions ALTER COLUMN user_id TYPE TEXT;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'analysis_results' AND column_name = 'user_id' 
               AND data_type != 'text') THEN
        ALTER TABLE analysis_results ALTER COLUMN user_id TYPE TEXT;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'interview_questions' AND column_name = 'user_id' 
               AND data_type != 'text') THEN
        ALTER TABLE interview_questions ALTER COLUMN user_id TYPE TEXT;
    END IF;
    
    -- Fix match_percentage to be REAL (not INTEGER)
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'analysis_results' AND column_name = 'match_percentage' 
               AND data_type = 'integer') THEN
        ALTER TABLE analysis_results ALTER COLUMN match_percentage TYPE REAL;
    END IF;
END $$;

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
DELETE FROM analysis_results WHERE resume_id NOT IN (SELECT id FROM resumes);
DELETE FROM analysis_results WHERE job_description_id NOT IN (SELECT id FROM job_descriptions);
DELETE FROM interview_questions WHERE resume_id NOT IN (SELECT id FROM resumes);
DELETE FROM interview_questions WHERE job_description_id NOT IN (SELECT id FROM job_descriptions);

-- Update any NULL created_at/updated_at fields
UPDATE resumes SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL;
UPDATE resumes SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL;
UPDATE job_descriptions SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL;
UPDATE job_descriptions SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL;
UPDATE analysis_results SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL;
UPDATE analysis_results SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL;