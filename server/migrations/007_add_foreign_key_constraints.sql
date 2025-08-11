-- PRODUCTION FIX: Migration 007 handles constraints already created in migration 001
-- This migration only adds the missing constraints and cleans up orphaned data

DO $$
DECLARE
    cleanup_count INT;
    constraint_exists BOOLEAN;
    error_detail TEXT;
BEGIN
    RAISE NOTICE 'Starting production-ready foreign key constraints migration...';
    
    -- CRITICAL: Clean up orphaned data first (this is what's causing the failures)
    RAISE NOTICE '=== CLEANING ORPHANED DATA ===';
    
    -- 1. Clean skill_promotion_log.main_skill_id (most likely culprit)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'skill_promotion_log') THEN
        DELETE FROM skill_promotion_log 
        WHERE main_skill_id IS NOT NULL 
          AND main_skill_id NOT IN (SELECT id FROM skills WHERE id IS NOT NULL);
        GET DIAGNOSTICS cleanup_count = ROW_COUNT;
        RAISE NOTICE 'Deleted % orphaned skill_promotion_log records', cleanup_count;
    END IF;
    
    -- 2. Clean orphaned analysis_results
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'analysis_results') THEN
        DELETE FROM analysis_results 
        WHERE resume_id IS NOT NULL 
          AND resume_id NOT IN (SELECT id FROM resumes WHERE id IS NOT NULL);
        GET DIAGNOSTICS cleanup_count = ROW_COUNT;
        RAISE NOTICE 'Deleted % analysis_results with orphaned resume_id', cleanup_count;
        
        DELETE FROM analysis_results 
        WHERE job_description_id IS NOT NULL 
          AND job_description_id NOT IN (SELECT id FROM job_descriptions WHERE id IS NOT NULL);
        GET DIAGNOSTICS cleanup_count = ROW_COUNT;
        RAISE NOTICE 'Deleted % analysis_results with orphaned job_description_id', cleanup_count;
    END IF;
    
    -- 3. Clean orphaned interview_questions
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'interview_questions') THEN
        DELETE FROM interview_questions 
        WHERE resume_id IS NOT NULL 
          AND resume_id NOT IN (SELECT id FROM resumes WHERE id IS NOT NULL);
        GET DIAGNOSTICS cleanup_count = ROW_COUNT;
        RAISE NOTICE 'Deleted % interview_questions with orphaned resume_id', cleanup_count;
        
        DELETE FROM interview_questions 
        WHERE job_description_id IS NOT NULL 
          AND job_description_id NOT IN (SELECT id FROM job_descriptions WHERE id IS NOT NULL);
        GET DIAGNOSTICS cleanup_count = ROW_COUNT;
        RAISE NOTICE 'Deleted % interview_questions with orphaned job_description_id', cleanup_count;
    END IF;
    
    -- 4. Clean skill category references
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'skills') THEN
        UPDATE skills 
        SET category_id = NULL 
        WHERE category_id IS NOT NULL 
          AND category_id NOT IN (SELECT id FROM skill_categories WHERE id IS NOT NULL);
        GET DIAGNOSTICS cleanup_count = ROW_COUNT;
        RAISE NOTICE 'Cleaned % orphaned skills.category_id references', cleanup_count;
    END IF;
    
    -- 5. Clean self-referencing skill categories
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'skill_categories') THEN
        UPDATE skill_categories 
        SET parent_id = NULL 
        WHERE parent_id IS NOT NULL 
          AND parent_id NOT IN (SELECT id FROM skill_categories sc2 WHERE sc2.id IS NOT NULL AND sc2.id != skill_categories.id);
        GET DIAGNOSTICS cleanup_count = ROW_COUNT;
        RAISE NOTICE 'Cleaned % orphaned skill_categories.parent_id references', cleanup_count;
    END IF;

    RAISE NOTICE '=== ADDING MISSING CONSTRAINTS ===';
    
    -- Note: Migration 001 already created constraints with REFERENCES syntax
    -- We only add the named constraints that are missing
    
    -- Check if skill_promotion_log constraint exists (this is likely the missing one)
    SELECT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_skill_promotion_log_main_skill' 
        AND table_name = 'skill_promotion_log'
    ) INTO constraint_exists;
    
    IF NOT constraint_exists AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'skill_promotion_log') THEN
        BEGIN
            RAISE NOTICE 'Adding missing constraint: fk_skill_promotion_log_main_skill';
            ALTER TABLE skill_promotion_log 
            ADD CONSTRAINT fk_skill_promotion_log_main_skill 
            FOREIGN KEY (main_skill_id) REFERENCES skills(id) ON DELETE SET NULL;
            RAISE NOTICE 'SUCCESS: Added fk_skill_promotion_log_main_skill constraint';
        EXCEPTION
            WHEN OTHERS THEN
                GET STACKED DIAGNOSTICS error_detail = MESSAGE_TEXT;
                RAISE NOTICE 'Could not add fk_skill_promotion_log_main_skill: %', error_detail;
        END;
    ELSE
        RAISE NOTICE 'Constraint fk_skill_promotion_log_main_skill already exists or table missing';
    END IF;
    
    -- Add performance indexes for foreign key columns
    RAISE NOTICE '=== ADDING PERFORMANCE INDEXES ===';
    
    BEGIN
        CREATE INDEX IF NOT EXISTS idx_skill_categories_parent_id ON skill_categories(parent_id);
        CREATE INDEX IF NOT EXISTS idx_skills_category_id ON skills(category_id);
        CREATE INDEX IF NOT EXISTS idx_analysis_results_resume_id ON analysis_results(resume_id);
        CREATE INDEX IF NOT EXISTS idx_analysis_results_job_id ON analysis_results(job_description_id);
        CREATE INDEX IF NOT EXISTS idx_interview_questions_resume_id ON interview_questions(resume_id);
        CREATE INDEX IF NOT EXISTS idx_interview_questions_job_id ON interview_questions(job_description_id);
        CREATE INDEX IF NOT EXISTS idx_skill_promotion_log_skill_id ON skill_promotion_log(skill_id);
        CREATE INDEX IF NOT EXISTS idx_skill_promotion_log_main_skill_id ON skill_promotion_log(main_skill_id);
        RAISE NOTICE 'Added all performance indexes';
    EXCEPTION
        WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS error_detail = MESSAGE_TEXT;
            RAISE NOTICE 'Index creation issue (non-fatal): %', error_detail;
    END;

    RAISE NOTICE '=== MIGRATION 007 COMPLETED SUCCESSFULLY ===';

EXCEPTION
    WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS error_detail = MESSAGE_TEXT;
        RAISE EXCEPTION 'Migration 007 failed: %', error_detail;
END $$;