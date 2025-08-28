-- Fixed version of migration 007: Add foreign key constraints with proper error handling
-- This migration safely adds foreign key constraints while handling existing constraints and orphaned data

DO $$
BEGIN
    -- Enable detailed logging
    RAISE NOTICE 'Starting foreign key constraints migration with data cleanup...';
    
    -- 1. Clean up orphaned data first before adding constraints
    
    -- Clean orphaned skill_categories.parent_id (self-referencing)
    RAISE NOTICE 'Cleaning orphaned skill_categories.parent_id references...';
    UPDATE skill_categories 
    SET parent_id = NULL 
    WHERE parent_id IS NOT NULL 
      AND parent_id NOT IN (SELECT id FROM skill_categories WHERE id IS NOT NULL);
    GET DIAGNOSTICS cleanup_count = ROW_COUNT;
    RAISE NOTICE 'Cleaned % orphaned skill_categories.parent_id references', cleanup_count;
    
    -- Clean orphaned skills.category_id
    RAISE NOTICE 'Cleaning orphaned skills.category_id references...';
    UPDATE skills 
    SET category_id = NULL 
    WHERE category_id IS NOT NULL 
      AND category_id NOT IN (SELECT id FROM skill_categories WHERE id IS NOT NULL);
    GET DIAGNOSTICS cleanup_count = ROW_COUNT;
    RAISE NOTICE 'Cleaned % orphaned skills.category_id references', cleanup_count;
    
    -- Clean orphaned analysis_results records
    RAISE NOTICE 'Cleaning orphaned analysis_results records...';
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
    
    -- Clean orphaned interview_questions records
    RAISE NOTICE 'Cleaning orphaned interview_questions records...';
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
    
    -- Clean orphaned skill_promotion_log records
    RAISE NOTICE 'Cleaning orphaned skill_promotion_log records...';
    UPDATE skill_promotion_log 
    SET main_skill_id = NULL 
    WHERE main_skill_id IS NOT NULL 
      AND main_skill_id NOT IN (SELECT id FROM skills WHERE id IS NOT NULL);
    GET DIAGNOSTICS cleanup_count = ROW_COUNT;
    RAISE NOTICE 'Cleaned % orphaned skill_promotion_log.main_skill_id references', cleanup_count;

    -- 2. Now add foreign key constraints (only if they don't already exist)
    
    -- Add self-referencing constraint for skill_categories
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_skill_categories_parent' 
        AND table_name = 'skill_categories'
    ) THEN
        RAISE NOTICE 'Adding foreign key constraint: fk_skill_categories_parent';
        ALTER TABLE skill_categories 
        ADD CONSTRAINT fk_skill_categories_parent 
        FOREIGN KEY (parent_id) REFERENCES skill_categories(id) ON DELETE CASCADE;
    ELSE
        RAISE NOTICE 'Foreign key constraint fk_skill_categories_parent already exists, skipping';
    END IF;
    
    -- Add constraint for skills.category_id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_skills_category' 
        AND table_name = 'skills'
    ) THEN
        RAISE NOTICE 'Adding foreign key constraint: fk_skills_category';
        ALTER TABLE skills 
        ADD CONSTRAINT fk_skills_category 
        FOREIGN KEY (category_id) REFERENCES skill_categories(id) ON DELETE SET NULL;
    ELSE
        RAISE NOTICE 'Foreign key constraint fk_skills_category already exists, skipping';
    END IF;
    
    -- Add constraint for analysis_results.resume_id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_analysis_results_resume' 
        AND table_name = 'analysis_results'
    ) THEN
        RAISE NOTICE 'Adding foreign key constraint: fk_analysis_results_resume';
        ALTER TABLE analysis_results 
        ADD CONSTRAINT fk_analysis_results_resume 
        FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE;
    ELSE
        RAISE NOTICE 'Foreign key constraint fk_analysis_results_resume already exists, skipping';
    END IF;
    
    -- Add constraint for analysis_results.job_description_id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_analysis_results_job' 
        AND table_name = 'analysis_results'
    ) THEN
        RAISE NOTICE 'Adding foreign key constraint: fk_analysis_results_job';
        ALTER TABLE analysis_results 
        ADD CONSTRAINT fk_analysis_results_job 
        FOREIGN KEY (job_description_id) REFERENCES job_descriptions(id) ON DELETE CASCADE;
    ELSE
        RAISE NOTICE 'Foreign key constraint fk_analysis_results_job already exists, skipping';
    END IF;
    
    -- Add constraint for interview_questions.resume_id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_interview_questions_resume' 
        AND table_name = 'interview_questions'
    ) THEN
        RAISE NOTICE 'Adding foreign key constraint: fk_interview_questions_resume';
        ALTER TABLE interview_questions 
        ADD CONSTRAINT fk_interview_questions_resume 
        FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE;
    ELSE
        RAISE NOTICE 'Foreign key constraint fk_interview_questions_resume already exists, skipping';
    END IF;
    
    -- Add constraint for interview_questions.job_description_id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_interview_questions_job' 
        AND table_name = 'interview_questions'
    ) THEN
        RAISE NOTICE 'Adding foreign key constraint: fk_interview_questions_job';
        ALTER TABLE interview_questions 
        ADD CONSTRAINT fk_interview_questions_job 
        FOREIGN KEY (job_description_id) REFERENCES job_descriptions(id) ON DELETE CASCADE;
    ELSE
        RAISE NOTICE 'Foreign key constraint fk_interview_questions_job already exists, skipping';
    END IF;
    
    -- Add constraint for skill_promotion_log.main_skill_id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_skill_promotion_log_main_skill' 
        AND table_name = 'skill_promotion_log'
    ) THEN
        RAISE NOTICE 'Adding foreign key constraint: fk_skill_promotion_log_main_skill';
        ALTER TABLE skill_promotion_log 
        ADD CONSTRAINT fk_skill_promotion_log_main_skill 
        FOREIGN KEY (main_skill_id) REFERENCES skills(id) ON DELETE CASCADE;
    ELSE
        RAISE NOTICE 'Foreign key constraint fk_skill_promotion_log_main_skill already exists, skipping';
    END IF;

    -- 3. Create indexes for foreign key columns to improve query performance
    
    -- Create index for skill_categories.parent_id if not exists
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_skill_categories_parent_id') THEN
        RAISE NOTICE 'Creating index: idx_skill_categories_parent_id';
        CREATE INDEX idx_skill_categories_parent_id ON skill_categories(parent_id);
    END IF;
    
    -- Create index for skills.category_id if not exists
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_skills_category_id') THEN
        RAISE NOTICE 'Creating index: idx_skills_category_id';
        CREATE INDEX idx_skills_category_id ON skills(category_id);
    END IF;
    
    -- Create index for analysis_results.resume_id if not exists
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_analysis_results_resume_id') THEN
        RAISE NOTICE 'Creating index: idx_analysis_results_resume_id';
        CREATE INDEX idx_analysis_results_resume_id ON analysis_results(resume_id);
    END IF;
    
    -- Create index for analysis_results.job_description_id if not exists
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_analysis_results_job_id') THEN
        RAISE NOTICE 'Creating index: idx_analysis_results_job_id';
        CREATE INDEX idx_analysis_results_job_id ON analysis_results(job_description_id);
    END IF;
    
    -- Create index for interview_questions.resume_id if not exists
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_interview_questions_resume_id') THEN
        RAISE NOTICE 'Creating index: idx_interview_questions_resume_id';
        CREATE INDEX idx_interview_questions_resume_id ON interview_questions(resume_id);
    END IF;
    
    -- Create index for interview_questions.job_description_id if not exists
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_interview_questions_job_id') THEN
        RAISE NOTICE 'Creating index: idx_interview_questions_job_id';
        CREATE INDEX idx_interview_questions_job_id ON interview_questions(job_description_id);
    END IF;
    
    -- Create index for skill_promotion_log.skill_id if not exists
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_skill_promotion_log_skill_id') THEN
        RAISE NOTICE 'Creating index: idx_skill_promotion_log_skill_id';
        CREATE INDEX idx_skill_promotion_log_skill_id ON skill_promotion_log(skill_id);
    END IF;
    
    -- Create index for skill_promotion_log.main_skill_id if not exists
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_skill_promotion_log_main_skill_id') THEN
        RAISE NOTICE 'Creating index: idx_skill_promotion_log_main_skill_id';
        CREATE INDEX idx_skill_promotion_log_main_skill_id ON skill_promotion_log(main_skill_id);
    END IF;

    -- 4. Add comments to document the relationships (if supported)
    BEGIN
        COMMENT ON CONSTRAINT fk_skill_categories_parent ON skill_categories IS 'Self-referencing hierarchy for skill categories';
        COMMENT ON CONSTRAINT fk_skills_category ON skills IS 'Links skills to their categories';
        COMMENT ON CONSTRAINT fk_analysis_results_resume ON analysis_results IS 'Links analysis to specific resume';
        COMMENT ON CONSTRAINT fk_analysis_results_job ON analysis_results IS 'Links analysis to specific job description';
        COMMENT ON CONSTRAINT fk_interview_questions_resume ON interview_questions IS 'Links interview questions to specific resume';
        COMMENT ON CONSTRAINT fk_interview_questions_job ON interview_questions IS 'Links interview questions to specific job description';
        COMMENT ON CONSTRAINT fk_skill_promotion_log_main_skill ON skill_promotion_log IS 'Links promotion log to main skill entry';
        RAISE NOTICE 'Added constraint documentation comments';
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Could not add constraint comments (not supported in this PostgreSQL version)';
    END;

    RAISE NOTICE 'Foreign key constraints migration completed successfully';

EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Foreign key constraints migration failed: %', SQLERRM;
        
DECLARE
    cleanup_count INT;
END $$;