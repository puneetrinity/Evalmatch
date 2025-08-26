-- ============================================================================
-- FIXED VERSION: Add foreign key constraints to maintain referential integrity
-- This migration safely adds proper relationships between tables
-- Handles existing constraints and orphaned data
-- ============================================================================

-- Record this migration
INSERT INTO schema_migrations (version, description) 
VALUES ('007_add_foreign_key_constraints', 'Add foreign key constraints with proper cleanup and error handling')
ON CONFLICT (version) DO NOTHING;

-- ============================================================================
-- STEP 1: CLEANUP ORPHANED DATA BEFORE ADDING CONSTRAINTS
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Starting orphaned data cleanup...';

    -- Clean up orphaned skill_categories.parent_id references
    UPDATE skill_categories 
    SET parent_id = NULL 
    WHERE parent_id IS NOT NULL 
        AND NOT EXISTS (
            SELECT 1 FROM skill_categories sc2 WHERE sc2.id = parent_id
        );
    
    GET DIAGNOSTICS FOUND := ROW_COUNT;
    RAISE NOTICE 'Cleaned % orphaned skill_categories.parent_id references', FOUND;

    -- Clean up orphaned skills.category_id references  
    UPDATE skills 
    SET category_id = NULL 
    WHERE category_id IS NOT NULL 
        AND NOT EXISTS (
            SELECT 1 FROM skill_categories sc WHERE sc.id = category_id
        );
    
    GET DIAGNOSTICS FOUND := ROW_COUNT;
    RAISE NOTICE 'Cleaned % orphaned skills.category_id references', FOUND;

    -- Delete orphaned analysis_results records
    DELETE FROM analysis_results 
    WHERE (resume_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM resumes r WHERE r.id = resume_id))
       OR (job_description_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM job_descriptions jd WHERE jd.id = job_description_id));
    
    GET DIAGNOSTICS FOUND := ROW_COUNT;
    RAISE NOTICE 'Deleted % orphaned analysis_results records', FOUND;

    -- Delete orphaned interview_questions records
    DELETE FROM interview_questions 
    WHERE (resume_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM resumes r WHERE r.id = resume_id))
       OR (job_description_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM job_descriptions jd WHERE jd.id = job_description_id));
    
    GET DIAGNOSTICS FOUND := ROW_COUNT;
    RAISE NOTICE 'Deleted % orphaned interview_questions records', FOUND;

    -- Clean up orphaned skill_promotion_log.main_skill_id references
    -- Set to NULL instead of deleting (preserve audit log)
    UPDATE skill_promotion_log 
    SET main_skill_id = NULL 
    WHERE main_skill_id IS NOT NULL 
        AND NOT EXISTS (
            SELECT 1 FROM skills s WHERE s.id = main_skill_id
        );
    
    GET DIAGNOSTICS FOUND := ROW_COUNT;
    RAISE NOTICE 'Cleaned % orphaned skill_promotion_log.main_skill_id references', FOUND;

    RAISE NOTICE 'Orphaned data cleanup completed successfully';

EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed during orphaned data cleanup: %', SQLERRM;
END $$;

-- ============================================================================
-- STEP 2: ADD FOREIGN KEY CONSTRAINTS (ONLY IF NOT EXISTS)
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Adding foreign key constraints...';

    -- 1. Add self-referencing constraint for skill_categories
    -- Check if constraint already exists (from migration 001)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'skill_categories' 
            AND constraint_type = 'FOREIGN KEY'
            AND constraint_name LIKE '%parent%'
    ) THEN
        ALTER TABLE skill_categories 
        ADD CONSTRAINT fk_skill_categories_parent 
        FOREIGN KEY (parent_id) REFERENCES skill_categories(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added constraint: fk_skill_categories_parent';
    ELSE
        RAISE NOTICE 'Constraint fk_skill_categories_parent already exists, skipping';
    END IF;

    -- 2. Add skills.category_id constraint
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'skills' 
            AND constraint_type = 'FOREIGN KEY'
            AND constraint_name LIKE '%category%'
    ) THEN
        ALTER TABLE skills 
        ADD CONSTRAINT fk_skills_category 
        FOREIGN KEY (category_id) REFERENCES skill_categories(id) ON DELETE SET NULL;
        RAISE NOTICE 'Added constraint: fk_skills_category';
    ELSE
        RAISE NOTICE 'Constraint fk_skills_category already exists, skipping';
    END IF;

    -- 3. Add analysis_results.resume_id constraint
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'analysis_results' 
            AND constraint_type = 'FOREIGN KEY'
            AND constraint_name LIKE '%resume%'
    ) THEN
        ALTER TABLE analysis_results 
        ADD CONSTRAINT fk_analysis_results_resume 
        FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added constraint: fk_analysis_results_resume';
    ELSE
        RAISE NOTICE 'Constraint fk_analysis_results_resume already exists, skipping';
    END IF;

    -- 4. Add analysis_results.job_description_id constraint
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'analysis_results' 
            AND constraint_type = 'FOREIGN KEY'
            AND constraint_name LIKE '%job%'
    ) THEN
        ALTER TABLE analysis_results 
        ADD CONSTRAINT fk_analysis_results_job 
        FOREIGN KEY (job_description_id) REFERENCES job_descriptions(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added constraint: fk_analysis_results_job';
    ELSE
        RAISE NOTICE 'Constraint fk_analysis_results_job already exists, skipping';
    END IF;

    -- 5. Add interview_questions.resume_id constraint
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'interview_questions' 
            AND constraint_type = 'FOREIGN KEY'
            AND constraint_name LIKE '%resume%'
    ) THEN
        ALTER TABLE interview_questions 
        ADD CONSTRAINT fk_interview_questions_resume 
        FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added constraint: fk_interview_questions_resume';
    ELSE
        RAISE NOTICE 'Constraint fk_interview_questions_resume already exists, skipping';
    END IF;

    -- 6. Add interview_questions.job_description_id constraint
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'interview_questions' 
            AND constraint_type = 'FOREIGN KEY'
            AND constraint_name LIKE '%job%'
    ) THEN
        ALTER TABLE interview_questions 
        ADD CONSTRAINT fk_interview_questions_job 
        FOREIGN KEY (job_description_id) REFERENCES job_descriptions(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added constraint: fk_interview_questions_job';
    ELSE
        RAISE NOTICE 'Constraint fk_interview_questions_job already exists, skipping';
    END IF;

    -- 7. Add skill_promotion_log.main_skill_id constraint
    -- This is the most likely problematic one
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'skill_promotion_log') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE table_name = 'skill_promotion_log' 
                AND constraint_type = 'FOREIGN KEY'
                AND constraint_name LIKE '%main_skill%'
        ) THEN
            ALTER TABLE skill_promotion_log 
            ADD CONSTRAINT fk_skill_promotion_log_main_skill 
            FOREIGN KEY (main_skill_id) REFERENCES skills(id) ON DELETE SET NULL;
            RAISE NOTICE 'Added constraint: fk_skill_promotion_log_main_skill';
        ELSE
            RAISE NOTICE 'Constraint fk_skill_promotion_log_main_skill already exists, skipping';
        END IF;
    ELSE
        RAISE NOTICE 'Table skill_promotion_log does not exist, skipping main_skill_id constraint';
    END IF;

    RAISE NOTICE 'Foreign key constraints added successfully';

EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed during foreign key constraint creation: %', SQLERRM;
END $$;

-- ============================================================================
-- STEP 3: CREATE INDEXES FOR FOREIGN KEY COLUMNS (PERFORMANCE)
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Creating performance indexes for foreign key columns...';

    -- Create indexes only if they don't exist
    CREATE INDEX IF NOT EXISTS idx_skill_categories_parent_id ON skill_categories(parent_id);
    CREATE INDEX IF NOT EXISTS idx_skills_category_id ON skills(category_id);
    CREATE INDEX IF NOT EXISTS idx_analysis_results_resume_id ON analysis_results(resume_id);
    CREATE INDEX IF NOT EXISTS idx_analysis_results_job_id ON analysis_results(job_description_id);
    CREATE INDEX IF NOT EXISTS idx_interview_questions_resume_id ON interview_questions(resume_id);
    CREATE INDEX IF NOT EXISTS idx_interview_questions_job_id ON interview_questions(job_description_id);
    
    -- Index for skill_promotion_log only if table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'skill_promotion_log') THEN
        CREATE INDEX IF NOT EXISTS idx_skill_promotion_log_skill_id ON skill_promotion_log(skill_id);
        CREATE INDEX IF NOT EXISTS idx_skill_promotion_log_main_skill_id ON skill_promotion_log(main_skill_id);
    END IF;

    RAISE NOTICE 'Performance indexes created successfully';

EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Some indexes may not have been created: %', SQLERRM;
        -- Don't fail migration for index creation errors
END $$;

-- ============================================================================
-- STEP 4: ADD COMMENTS TO DOCUMENT THE RELATIONSHIPS (OPTIONAL)
-- ============================================================================

DO $$
BEGIN
    -- Add comments for documentation (PostgreSQL specific)
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'skill_categories' AND constraint_name = 'fk_skill_categories_parent'
    ) THEN
        COMMENT ON CONSTRAINT fk_skill_categories_parent ON skill_categories IS 'Self-referencing hierarchy for skill categories';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'skills' AND constraint_name = 'fk_skills_category'
    ) THEN
        COMMENT ON CONSTRAINT fk_skills_category ON skills IS 'Links skills to their categories';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'analysis_results' AND constraint_name = 'fk_analysis_results_resume'
    ) THEN
        COMMENT ON CONSTRAINT fk_analysis_results_resume ON analysis_results IS 'Links analysis to specific resume';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'analysis_results' AND constraint_name = 'fk_analysis_results_job'
    ) THEN
        COMMENT ON CONSTRAINT fk_analysis_results_job ON analysis_results IS 'Links analysis to specific job description';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'interview_questions' AND constraint_name = 'fk_interview_questions_resume'
    ) THEN
        COMMENT ON CONSTRAINT fk_interview_questions_resume ON interview_questions IS 'Links interview questions to specific resume';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'interview_questions' AND constraint_name = 'fk_interview_questions_job'
    ) THEN
        COMMENT ON CONSTRAINT fk_interview_questions_job ON interview_questions IS 'Links interview questions to specific job description';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'skill_promotion_log' AND constraint_name = 'fk_skill_promotion_log_main_skill'
    ) THEN
        COMMENT ON CONSTRAINT fk_skill_promotion_log_main_skill ON skill_promotion_log IS 'Links promotion log to main skill entry';
    END IF;

    RAISE NOTICE 'Constraint comments added successfully';

EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Some comments may not have been added: %', SQLERRM;
        -- Comments are optional, don't fail migration
END $$;

-- ============================================================================
-- FINAL VERIFICATION
-- ============================================================================

DO $$
DECLARE
    constraint_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO constraint_count
    FROM information_schema.table_constraints 
    WHERE constraint_type = 'FOREIGN KEY'
        AND table_name IN (
            'skill_categories', 'skills', 'analysis_results', 
            'interview_questions', 'skill_promotion_log'
        );
    
    RAISE NOTICE 'Migration completed successfully. Total foreign key constraints: %', constraint_count;
END $$;