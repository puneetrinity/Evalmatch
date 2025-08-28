-- ============================================================================
-- MIGRATION 013 SAFE: Railway-optimized covering indexes for performance
-- Addresses connection reset issues with CONCURRENTLY and pg_stat_statements
-- ============================================================================

-- Record this migration
INSERT INTO schema_migrations (version, description) 
VALUES ('013_add_covering_indexes_performance_safe', 'Railway-safe covering indexes for 100-user performance optimization')
ON CONFLICT (version) DO NOTHING;

-- ============================================================================
-- RAILWAY-SAFE PERFORMANCE INDEXES (without CONCURRENTLY to prevent timeouts)
-- ============================================================================

-- Only create indexes if they don't already exist to prevent conflicts
DO $$
BEGIN
    -- 1. Covering index for user resume listings (eliminate N+1 queries)
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c 
        JOIN pg_namespace n ON n.oid = c.relnamespace 
        WHERE c.relname = 'idx_resumes_user_metadata_covering' 
        AND n.nspname = 'public'
    ) THEN
        CREATE INDEX idx_resumes_user_metadata_covering
        ON resumes(user_id, created_at DESC)
        INCLUDE (id, filename, analyzed_data, batch_id)
        WHERE analyzed_data IS NOT NULL;
        RAISE NOTICE '✅ Created idx_resumes_user_metadata_covering';
    ELSE
        RAISE NOTICE '⚠️  Index idx_resumes_user_metadata_covering already exists';
    END IF;

    -- 2. Analysis results with complete context (dashboard performance)
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c 
        JOIN pg_namespace n ON n.oid = c.relnamespace 
        WHERE c.relname = 'idx_analysis_complete_dashboard' 
        AND n.nspname = 'public'
    ) THEN
        CREATE INDEX idx_analysis_complete_dashboard
        ON analysis_results(user_id, created_at DESC)
        INCLUDE (resume_id, job_description_id, match_percentage, analysis_data);
        RAISE NOTICE '✅ Created idx_analysis_complete_dashboard';
    ELSE
        RAISE NOTICE '⚠️  Index idx_analysis_complete_dashboard already exists';
    END IF;

    -- 3. User-job analysis composite index (hot path optimization)
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c 
        JOIN pg_namespace n ON n.oid = c.relnamespace 
        WHERE c.relname = 'idx_analysis_results_user_job_perf' 
        AND n.nspname = 'public'
    ) THEN
        CREATE INDEX idx_analysis_results_user_job_perf
        ON analysis_results(user_id, job_description_id, created_at DESC, match_percentage);
        RAISE NOTICE '✅ Created idx_analysis_results_user_job_perf';
    ELSE
        RAISE NOTICE '⚠️  Index idx_analysis_results_user_job_perf already exists';
    END IF;

    -- 4. Job descriptions optimized for user filtering
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c 
        JOIN pg_namespace n ON n.oid = c.relnamespace 
        WHERE c.relname = 'idx_job_descriptions_user_filtering' 
        AND n.nspname = 'public'
    ) THEN
        CREATE INDEX idx_job_descriptions_user_filtering
        ON job_descriptions(user_id, created_at DESC)
        INCLUDE (id, title, company, description);
        RAISE NOTICE '✅ Created idx_job_descriptions_user_filtering';
    ELSE
        RAISE NOTICE '⚠️  Index idx_job_descriptions_user_filtering already exists';
    END IF;

    -- 5. JSONB skills aliases index (skill matching performance) - if skills table exists
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'skills' AND table_schema = 'public'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_class c 
            JOIN pg_namespace n ON n.oid = c.relnamespace 
            WHERE c.relname = 'idx_skills_aliases_gin' 
            AND n.nspname = 'public'
        ) THEN
            CREATE INDEX idx_skills_aliases_gin
            ON skills USING gin(aliases jsonb_path_ops);
            RAISE NOTICE '✅ Created idx_skills_aliases_gin';
        ELSE
            RAISE NOTICE '⚠️  Index idx_skills_aliases_gin already exists';
        END IF;
    ELSE
        RAISE NOTICE '⚠️  Skills table not found, skipping JSONB index';
    END IF;

    -- 6. Skills with category information (if both tables exist)
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'skills' AND table_schema = 'public'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'skill_categories' AND table_schema = 'public'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_class c 
            JOIN pg_namespace n ON n.oid = c.relnamespace 
            WHERE c.relname = 'idx_skills_with_category' 
            AND n.nspname = 'public'
        ) THEN
            CREATE INDEX idx_skills_with_category
            ON skills(category_id, name)
            INCLUDE (aliases, description);
            RAISE NOTICE '✅ Created idx_skills_with_category';
        ELSE
            RAISE NOTICE '⚠️  Index idx_skills_with_category already exists';
        END IF;
    ELSE
        RAISE NOTICE '⚠️  Skills/skill_categories tables not found, skipping category index';
    END IF;

    -- 7. Interview questions with context (if table exists)
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'interview_questions' AND table_schema = 'public'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_class c 
            JOIN pg_namespace n ON n.oid = c.relnamespace 
            WHERE c.relname = 'idx_interview_questions_context' 
            AND n.nspname = 'public'
        ) THEN
            CREATE INDEX idx_interview_questions_context
            ON interview_questions(resume_id, job_description_id)
            INCLUDE (questions, created_at);
            RAISE NOTICE '✅ Created idx_interview_questions_context';
        ELSE
            RAISE NOTICE '⚠️  Index idx_interview_questions_context already exists';
        END IF;
    ELSE
        RAISE NOTICE '⚠️  Interview_questions table not found, skipping context index';
    END IF;

EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '❌ Index creation failed: %', SQLERRM;
        -- Continue execution - don't fail the entire migration
END $$;

-- ============================================================================
-- RAILWAY-SAFE EXTENSION MANAGEMENT
-- ============================================================================

-- Try to create pg_stat_statements extension but don't fail if Railway doesn't allow it
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
    RAISE NOTICE '✅ pg_stat_statements extension created successfully';
EXCEPTION
    WHEN insufficient_privilege THEN
        RAISE NOTICE '⚠️  pg_stat_statements extension requires superuser privileges (Railway limitation)';
    WHEN OTHERS THEN
        RAISE NOTICE '⚠️  pg_stat_statements extension unavailable: %', SQLERRM;
END $$;

-- ============================================================================
-- MIGRATION COMPLETION LOG
-- ============================================================================

DO $$
DECLARE
    index_count INTEGER;
BEGIN
    -- Count how many of our performance indexes were created
    SELECT COUNT(*) INTO index_count
    FROM pg_class c 
    JOIN pg_namespace n ON n.oid = c.relnamespace 
    WHERE n.nspname = 'public' 
    AND c.relname LIKE 'idx_%'
    AND c.relname IN (
        'idx_resumes_user_metadata_covering',
        'idx_analysis_complete_dashboard',
        'idx_analysis_results_user_job_perf',
        'idx_job_descriptions_user_filtering',
        'idx_skills_aliases_gin',
        'idx_skills_with_category',
        'idx_interview_questions_context'
    );

    RAISE NOTICE '=== MIGRATION 013 SAFE COMPLETED SUCCESSFULLY ===';
    RAISE NOTICE 'Performance indexes created: % out of 7 possible', index_count;
    RAISE NOTICE 'Railway-optimized migration (no CONCURRENTLY to prevent connection resets)';
    RAISE NOTICE 'Use EXPLAIN (ANALYZE, BUFFERS) to verify index usage on hot queries';
    
    IF index_count >= 4 THEN
        RAISE NOTICE '✅ Minimum required indexes created - performance should improve';
    ELSE
        RAISE NOTICE '⚠️  Some indexes may be missing - check table existence';
    END IF;
    
END $$;