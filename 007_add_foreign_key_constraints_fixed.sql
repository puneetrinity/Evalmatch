-- Fixed version of 007_add_foreign_key_constraints.sql
-- This addresses the data integrity and constraint creation issues
-- Database Expert Solution - 2025-08-10

-- IMPORTANT: This migration includes proper error handling and data cleanup
-- to prevent the "Query execution failed" and "Database connection failed" errors

-- Clean up any orphaned data before creating constraints
-- This is the #1 cause of foreign key constraint creation failures

-- Remove invalid analysis_results references
DELETE FROM analysis_results 
WHERE resume_id IS NOT NULL AND resume_id NOT IN (SELECT id FROM resumes);

DELETE FROM analysis_results 
WHERE job_description_id IS NOT NULL AND job_description_id NOT IN (SELECT id FROM job_descriptions);

-- Remove invalid interview_questions references
DELETE FROM interview_questions 
WHERE resume_id IS NOT NULL AND resume_id NOT IN (SELECT id FROM resumes);

DELETE FROM interview_questions 
WHERE job_description_id IS NOT NULL AND job_description_id NOT IN (SELECT id FROM job_descriptions);

-- Handle skill_promotion_log references carefully
-- This table may reference skills that don't exist yet
DELETE FROM skill_promotion_log 
WHERE skill_id IS NOT NULL AND skill_id NOT IN (SELECT id FROM skill_memory);

-- Only clean up main_skill_id if skills table exists and has data
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'skills') THEN
        DELETE FROM skill_promotion_log 
        WHERE main_skill_id IS NOT NULL AND main_skill_id NOT IN (SELECT id FROM skills);
    END IF;
END $$;

-- Add foreign key constraints for skill categories (self-referencing)
-- Use IF NOT EXISTS to avoid duplicate constraint errors
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_skill_categories_parent'
        AND table_name = 'skill_categories'
    ) THEN
        ALTER TABLE skill_categories 
        ADD CONSTRAINT fk_skill_categories_parent 
        FOREIGN KEY (parent_id) REFERENCES skill_categories(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Add foreign key constraints for skills table
-- Use IF NOT EXISTS to avoid duplicate constraint errors
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_skills_category'
        AND table_name = 'skills'
    ) THEN
        ALTER TABLE skills 
        ADD CONSTRAINT fk_skills_category 
        FOREIGN KEY (category_id) REFERENCES skill_categories(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Add foreign key constraints for analysis_results table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_analysis_results_resume'
        AND table_name = 'analysis_results'
    ) THEN
        ALTER TABLE analysis_results 
        ADD CONSTRAINT fk_analysis_results_resume 
        FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_analysis_results_job'
        AND table_name = 'analysis_results'
    ) THEN
        ALTER TABLE analysis_results 
        ADD CONSTRAINT fk_analysis_results_job 
        FOREIGN KEY (job_description_id) REFERENCES job_descriptions(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Add foreign key constraints for interview_questions table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_interview_questions_resume'
        AND table_name = 'interview_questions'
    ) THEN
        ALTER TABLE interview_questions 
        ADD CONSTRAINT fk_interview_questions_resume 
        FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_interview_questions_job'
        AND table_name = 'interview_questions'
    ) THEN
        ALTER TABLE interview_questions 
        ADD CONSTRAINT fk_interview_questions_job 
        FOREIGN KEY (job_description_id) REFERENCES job_descriptions(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Add foreign key constraint for skill promotion log main_skill_id
-- Only if skills table exists and has data
DO $$
DECLARE
    skills_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO skills_count FROM skills;
    
    -- Only create constraint if we have skills data
    IF skills_count > 0 AND NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_skill_promotion_log_main_skill'
        AND table_name = 'skill_promotion_log'
    ) THEN
        ALTER TABLE skill_promotion_log 
        ADD CONSTRAINT fk_skill_promotion_log_main_skill 
        FOREIGN KEY (main_skill_id) REFERENCES skills(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Create indexes for foreign key columns to improve query performance
-- Use IF NOT EXISTS to avoid duplicate index errors
CREATE INDEX IF NOT EXISTS idx_skill_categories_parent_id ON skill_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_skills_category_id ON skills(category_id);
CREATE INDEX IF NOT EXISTS idx_analysis_results_resume_id ON analysis_results(resume_id);
CREATE INDEX IF NOT EXISTS idx_analysis_results_job_id ON analysis_results(job_description_id);
CREATE INDEX IF NOT EXISTS idx_interview_questions_resume_id ON interview_questions(resume_id);
CREATE INDEX IF NOT EXISTS idx_interview_questions_job_id ON interview_questions(job_description_id);
CREATE INDEX IF NOT EXISTS idx_skill_promotion_log_skill_id ON skill_promotion_log(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_promotion_log_main_skill_id ON skill_promotion_log(main_skill_id);

-- Add comments to document the relationships (with error handling)
DO $$
BEGIN
    -- Only add comments if constraints exist
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_skill_categories_parent') THEN
        COMMENT ON CONSTRAINT fk_skill_categories_parent ON skill_categories IS 'Self-referencing hierarchy for skill categories';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_skills_category') THEN
        COMMENT ON CONSTRAINT fk_skills_category ON skills IS 'Links skills to their categories';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_analysis_results_resume') THEN
        COMMENT ON CONSTRAINT fk_analysis_results_resume ON analysis_results IS 'Links analysis to specific resume';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_analysis_results_job') THEN
        COMMENT ON CONSTRAINT fk_analysis_results_job ON analysis_results IS 'Links analysis to specific job description';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_interview_questions_resume') THEN
        COMMENT ON CONSTRAINT fk_interview_questions_resume ON interview_questions IS 'Links interview questions to specific resume';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_interview_questions_job') THEN
        COMMENT ON CONSTRAINT fk_interview_questions_job ON interview_questions IS 'Links interview questions to specific job description';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_skill_promotion_log_main_skill') THEN
        COMMENT ON CONSTRAINT fk_skill_promotion_log_main_skill ON skill_promotion_log IS 'Links promotion log to main skill entry';
    END IF;
    
EXCEPTION WHEN OTHERS THEN
    -- Comments are optional, don't fail migration for comment errors
    NULL;
END $$;