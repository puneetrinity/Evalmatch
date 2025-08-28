-- Database Schema Verification and Fix
-- Comprehensive validation of all tables and columns required by the analysis workflow
-- Run date: 2025-08-02

-- ============================================================================
-- MIGRATION TRACKING TABLE (ENSURE EXISTS)
-- ============================================================================
CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    version VARCHAR(50) UNIQUE NOT NULL,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    description TEXT
);

-- Record this verification
INSERT INTO schema_migrations (version, description) 
VALUES ('comprehensive_schema_verification', 'Complete database schema verification and fixes')
ON CONFLICT (version) DO NOTHING;

-- ============================================================================
-- TABLE EXISTENCE VERIFICATION
-- ============================================================================
DO $$ 
BEGIN
    -- Check if all required tables exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
        RAISE EXCEPTION 'Critical: users table is missing!';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'resumes') THEN
        RAISE EXCEPTION 'Critical: resumes table is missing!';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'job_descriptions') THEN
        RAISE EXCEPTION 'Critical: job_descriptions table is missing!';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'analysis_results') THEN
        RAISE EXCEPTION 'Critical: analysis_results table is missing!';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'interview_questions') THEN
        RAISE EXCEPTION 'Critical: interview_questions table is missing!';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'skill_categories') THEN
        RAISE EXCEPTION 'Critical: skill_categories table is missing!';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'skills') THEN
        RAISE EXCEPTION 'Critical: skills table is missing!';
    END IF;
    
    RAISE NOTICE 'All required tables exist ✓';
END $$;

-- ============================================================================
-- RESUMES TABLE COLUMN VERIFICATION AND FIXES
-- ============================================================================
DO $$ 
BEGIN
    RAISE NOTICE 'Verifying resumes table schema...';
    
    -- Core columns that must exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'resumes' AND column_name = 'id') THEN
        RAISE EXCEPTION 'resumes.id column is missing!';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'resumes' AND column_name = 'filename') THEN
        RAISE EXCEPTION 'resumes.filename column is missing!';
    END IF;
    
    -- Add user_id if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'resumes' AND column_name = 'user_id') THEN
        ALTER TABLE resumes ADD COLUMN user_id TEXT;
        RAISE NOTICE 'Added user_id column to resumes';
    END IF;
    
    -- Add session_id if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'resumes' AND column_name = 'session_id') THEN
        ALTER TABLE resumes ADD COLUMN session_id TEXT;
        RAISE NOTICE 'Added session_id column to resumes';
    END IF;
    
    -- CRITICAL: Add batch_id if missing (required for batch analysis workflow)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'resumes' AND column_name = 'batch_id') THEN
        ALTER TABLE resumes ADD COLUMN batch_id TEXT;
        RAISE NOTICE 'Added batch_id column to resumes';
    END IF;
    
    -- Add file metadata columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'resumes' AND column_name = 'file_size') THEN
        ALTER TABLE resumes ADD COLUMN file_size INTEGER;
        RAISE NOTICE 'Added file_size column to resumes';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'resumes' AND column_name = 'file_type') THEN
        ALTER TABLE resumes ADD COLUMN file_type TEXT;
        RAISE NOTICE 'Added file_type column to resumes';
    END IF;
    
    -- Add content and analysis columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'resumes' AND column_name = 'content') THEN
        ALTER TABLE resumes ADD COLUMN content TEXT;
        RAISE NOTICE 'Added content column to resumes';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'resumes' AND column_name = 'skills') THEN
        ALTER TABLE resumes ADD COLUMN skills JSON DEFAULT '[]'::json;
        RAISE NOTICE 'Added skills column to resumes';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'resumes' AND column_name = 'experience') THEN
        ALTER TABLE resumes ADD COLUMN experience TEXT;
        RAISE NOTICE 'Added experience column to resumes';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'resumes' AND column_name = 'education') THEN
        ALTER TABLE resumes ADD COLUMN education JSON DEFAULT '[]'::json;
        RAISE NOTICE 'Added education column to resumes';
    END IF;
    
    -- Add AI/ML columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'resumes' AND column_name = 'embedding') THEN
        ALTER TABLE resumes ADD COLUMN embedding JSON;
        RAISE NOTICE 'Added embedding column to resumes';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'resumes' AND column_name = 'skills_embedding') THEN
        ALTER TABLE resumes ADD COLUMN skills_embedding JSON;
        RAISE NOTICE 'Added skills_embedding column to resumes';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'resumes' AND column_name = 'analyzed_data') THEN
        ALTER TABLE resumes ADD COLUMN analyzed_data JSON;
        RAISE NOTICE 'Added analyzed_data column to resumes';
    END IF;
    
    -- Add timestamp columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'resumes' AND column_name = 'created_at') THEN
        ALTER TABLE resumes ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        RAISE NOTICE 'Added created_at column to resumes';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'resumes' AND column_name = 'updated_at') THEN
        ALTER TABLE resumes ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        RAISE NOTICE 'Added updated_at column to resumes';
    END IF;
    
    RAISE NOTICE 'Resumes table schema verified ✓';
END $$;

-- ============================================================================
-- JOB_DESCRIPTIONS TABLE COLUMN VERIFICATION AND FIXES
-- ============================================================================
DO $$ 
BEGIN
    RAISE NOTICE 'Verifying job_descriptions table schema...';
    
    -- Add user_id if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'job_descriptions' AND column_name = 'user_id') THEN
        ALTER TABLE job_descriptions ADD COLUMN user_id TEXT;
        RAISE NOTICE 'Added user_id column to job_descriptions';
    END IF;
    
    -- Add structured data columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'job_descriptions' AND column_name = 'requirements') THEN
        ALTER TABLE job_descriptions ADD COLUMN requirements JSON DEFAULT '[]'::json;
        RAISE NOTICE 'Added requirements column to job_descriptions';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'job_descriptions' AND column_name = 'skills') THEN
        ALTER TABLE job_descriptions ADD COLUMN skills JSON DEFAULT '[]'::json;
        RAISE NOTICE 'Added skills column to job_descriptions';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'job_descriptions' AND column_name = 'experience') THEN
        ALTER TABLE job_descriptions ADD COLUMN experience TEXT;
        RAISE NOTICE 'Added experience column to job_descriptions';
    END IF;
    
    -- Add AI/ML columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'job_descriptions' AND column_name = 'embedding') THEN
        ALTER TABLE job_descriptions ADD COLUMN embedding JSON;
        RAISE NOTICE 'Added embedding column to job_descriptions';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'job_descriptions' AND column_name = 'requirements_embedding') THEN
        ALTER TABLE job_descriptions ADD COLUMN requirements_embedding JSON;
        RAISE NOTICE 'Added requirements_embedding column to job_descriptions';
    END IF;
    
    -- CRITICAL: Add analyzed_data for bias analysis storage
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'job_descriptions' AND column_name = 'analyzed_data') THEN
        ALTER TABLE job_descriptions ADD COLUMN analyzed_data JSON;
        RAISE NOTICE 'Added analyzed_data column to job_descriptions (supports bias analysis storage)';
    END IF;
    
    RAISE NOTICE 'Job descriptions table schema verified ✓';
END $$;

-- ============================================================================
-- ANALYSIS_RESULTS TABLE COLUMN VERIFICATION AND FIXES
-- ============================================================================
DO $$ 
BEGIN
    RAISE NOTICE 'Verifying analysis_results table schema...';
    
    -- Add user_id if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analysis_results' AND column_name = 'user_id') THEN
        ALTER TABLE analysis_results ADD COLUMN user_id TEXT;
        RAISE NOTICE 'Added user_id column to analysis_results';
    END IF;
    
    -- Add structured analysis columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analysis_results' AND column_name = 'matched_skills') THEN
        ALTER TABLE analysis_results ADD COLUMN matched_skills JSON DEFAULT '[]'::json;
        RAISE NOTICE 'Added matched_skills column to analysis_results';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analysis_results' AND column_name = 'missing_skills') THEN
        ALTER TABLE analysis_results ADD COLUMN missing_skills JSON DEFAULT '[]'::json;
        RAISE NOTICE 'Added missing_skills column to analysis_results';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analysis_results' AND column_name = 'candidate_strengths') THEN
        ALTER TABLE analysis_results ADD COLUMN candidate_strengths JSON DEFAULT '[]'::json;
        RAISE NOTICE 'Added candidate_strengths column to analysis_results';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analysis_results' AND column_name = 'candidate_weaknesses') THEN
        ALTER TABLE analysis_results ADD COLUMN candidate_weaknesses JSON DEFAULT '[]'::json;
        RAISE NOTICE 'Added candidate_weaknesses column to analysis_results';
    END IF;
    
    -- CRITICAL: Add recommendations column (this was causing analysis failures!)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analysis_results' AND column_name = 'recommendations') THEN
        ALTER TABLE analysis_results ADD COLUMN recommendations JSON DEFAULT '[]'::json;
        RAISE NOTICE 'Added recommendations column to analysis_results';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analysis_results' AND column_name = 'confidence_level') THEN
        ALTER TABLE analysis_results ADD COLUMN confidence_level VARCHAR(10);
        RAISE NOTICE 'Added confidence_level column to analysis_results';
    END IF;
    
    -- Add similarity scoring columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analysis_results' AND column_name = 'semantic_similarity') THEN
        ALTER TABLE analysis_results ADD COLUMN semantic_similarity REAL;
        RAISE NOTICE 'Added semantic_similarity column to analysis_results';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analysis_results' AND column_name = 'skills_similarity') THEN
        ALTER TABLE analysis_results ADD COLUMN skills_similarity REAL;
        RAISE NOTICE 'Added skills_similarity column to analysis_results';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analysis_results' AND column_name = 'experience_similarity') THEN
        ALTER TABLE analysis_results ADD COLUMN experience_similarity REAL;
        RAISE NOTICE 'Added experience_similarity column to analysis_results';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analysis_results' AND column_name = 'education_similarity') THEN
        ALTER TABLE analysis_results ADD COLUMN education_similarity REAL;
        RAISE NOTICE 'Added education_similarity column to analysis_results';
    END IF;
    
    -- Add ML confidence and scoring
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analysis_results' AND column_name = 'ml_confidence_score') THEN
        ALTER TABLE analysis_results ADD COLUMN ml_confidence_score REAL;
        RAISE NOTICE 'Added ml_confidence_score column to analysis_results';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analysis_results' AND column_name = 'scoring_dimensions') THEN
        ALTER TABLE analysis_results ADD COLUMN scoring_dimensions JSON;
        RAISE NOTICE 'Added scoring_dimensions column to analysis_results';
    END IF;
    
    -- CRITICAL: Add fairness_metrics for bias analysis
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analysis_results' AND column_name = 'fairness_metrics') THEN
        ALTER TABLE analysis_results ADD COLUMN fairness_metrics JSON;
        RAISE NOTICE 'Added fairness_metrics column to analysis_results (supports bias analysis)';
    END IF;
    
    -- Add processing metadata
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analysis_results' AND column_name = 'processing_time') THEN
        ALTER TABLE analysis_results ADD COLUMN processing_time INTEGER;
        RAISE NOTICE 'Added processing_time column to analysis_results';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analysis_results' AND column_name = 'ai_provider') THEN
        ALTER TABLE analysis_results ADD COLUMN ai_provider VARCHAR(50);
        RAISE NOTICE 'Added ai_provider column to analysis_results';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analysis_results' AND column_name = 'model_version') THEN
        ALTER TABLE analysis_results ADD COLUMN model_version VARCHAR(50);
        RAISE NOTICE 'Added model_version column to analysis_results';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analysis_results' AND column_name = 'processing_flags') THEN
        ALTER TABLE analysis_results ADD COLUMN processing_flags JSON;
        RAISE NOTICE 'Added processing_flags column to analysis_results';
    END IF;
    
    RAISE NOTICE 'Analysis results table schema verified ✓';
END $$;

-- ============================================================================
-- INTERVIEW_QUESTIONS TABLE COLUMN VERIFICATION AND FIXES
-- ============================================================================
DO $$ 
BEGIN
    RAISE NOTICE 'Verifying interview_questions table schema...';
    
    -- Add user_id if missing (this was causing foreign key issues!)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'interview_questions' AND column_name = 'user_id') THEN
        ALTER TABLE interview_questions ADD COLUMN user_id TEXT;
        RAISE NOTICE 'Added user_id column to interview_questions';
    END IF;
    
    -- Add metadata column for enhanced interview question data
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'interview_questions' AND column_name = 'metadata') THEN
        ALTER TABLE interview_questions ADD COLUMN metadata JSON;
        RAISE NOTICE 'Added metadata column to interview_questions';
    END IF;
    
    RAISE NOTICE 'Interview questions table schema verified ✓';
END $$;

-- ============================================================================
-- DATA TYPE CORRECTIONS
-- ============================================================================
DO $$ 
BEGIN
    RAISE NOTICE 'Verifying data types...';
    
    -- Fix match_percentage to be REAL (critical for analysis calculations)
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'analysis_results' AND column_name = 'match_percentage' 
               AND data_type = 'integer') THEN
        ALTER TABLE analysis_results ALTER COLUMN match_percentage TYPE REAL;
        RAISE NOTICE 'Fixed match_percentage data type from integer to real';
    END IF;
    
    -- Fix education columns to be JSON arrays, not text
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'resumes' AND column_name = 'education' 
               AND data_type = 'text') THEN
        -- Convert existing text data to JSON array format
        UPDATE resumes 
        SET education = CASE 
            WHEN education IS NULL OR education = '' THEN '[]'::json
            ELSE jsonb_build_array(education)
        END
        WHERE education IS NOT NULL;
        
        ALTER TABLE resumes ALTER COLUMN education TYPE JSON USING education::json;
        RAISE NOTICE 'Fixed education column data type from text to JSON';
    END IF;
    
    RAISE NOTICE 'Data types verified ✓';
END $$;

-- ============================================================================
-- CRITICAL INDEXES FOR BATCH ANALYSIS WORKFLOW
-- ============================================================================
DO $$ 
BEGIN
    RAISE NOTICE 'Creating critical indexes for performance...';
    
    -- CRITICAL: batch_id index for batch-based analysis
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_resumes_batch_id') THEN
        CREATE INDEX idx_resumes_batch_id ON resumes(batch_id);
        RAISE NOTICE 'Created index on resumes.batch_id';
    END IF;
    
    -- Composite indexes for common query patterns
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_resumes_user_batch') THEN
        CREATE INDEX idx_resumes_user_batch ON resumes(user_id, batch_id);
        RAISE NOTICE 'Created composite index on resumes(user_id, batch_id)';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_resumes_session_batch') THEN
        CREATE INDEX idx_resumes_session_batch ON resumes(session_id, batch_id);
        RAISE NOTICE 'Created composite index on resumes(session_id, batch_id)';
    END IF;
    
    -- User-based query indexes
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_resumes_user_id') THEN
        CREATE INDEX idx_resumes_user_id ON resumes(user_id);
        RAISE NOTICE 'Created index on resumes.user_id';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_job_descriptions_user_id') THEN
        CREATE INDEX idx_job_descriptions_user_id ON job_descriptions(user_id);
        RAISE NOTICE 'Created index on job_descriptions.user_id';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_analysis_results_user_id') THEN
        CREATE INDEX idx_analysis_results_user_id ON analysis_results(user_id);
        RAISE NOTICE 'Created index on analysis_results.user_id';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_interview_questions_user_id') THEN
        CREATE INDEX idx_interview_questions_user_id ON interview_questions(user_id);
        RAISE NOTICE 'Created index on interview_questions.user_id';
    END IF;
    
    -- Foreign key relationship indexes
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_analysis_results_resume_id') THEN
        CREATE INDEX idx_analysis_results_resume_id ON analysis_results(resume_id);
        RAISE NOTICE 'Created index on analysis_results.resume_id';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_analysis_results_job_id') THEN
        CREATE INDEX idx_analysis_results_job_id ON analysis_results(job_description_id);
        RAISE NOTICE 'Created index on analysis_results.job_description_id';
    END IF;
    
    RAISE NOTICE 'Critical indexes created ✓';
END $$;

-- ============================================================================
-- FOREIGN KEY CONSTRAINTS
-- ============================================================================
DO $$ 
BEGIN
    RAISE NOTICE 'Verifying foreign key constraints...';
    
    -- Add resume foreign key constraint to analysis_results if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                   WHERE constraint_name = 'analysis_results_resume_id_fkey' 
                   AND table_name = 'analysis_results') THEN
        ALTER TABLE analysis_results 
        ADD CONSTRAINT analysis_results_resume_id_fkey 
        FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added foreign key constraint: analysis_results.resume_id -> resumes.id';
    END IF;
    
    -- Add job_description foreign key constraint to analysis_results if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                   WHERE constraint_name = 'analysis_results_job_description_id_fkey' 
                   AND table_name = 'analysis_results') THEN
        ALTER TABLE analysis_results 
        ADD CONSTRAINT analysis_results_job_description_id_fkey 
        FOREIGN KEY (job_description_id) REFERENCES job_descriptions(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added foreign key constraint: analysis_results.job_description_id -> job_descriptions.id';
    END IF;
    
    -- Add resume foreign key constraint to interview_questions if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                   WHERE constraint_name = 'interview_questions_resume_id_fkey' 
                   AND table_name = 'interview_questions') THEN
        ALTER TABLE interview_questions 
        ADD CONSTRAINT interview_questions_resume_id_fkey 
        FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added foreign key constraint: interview_questions.resume_id -> resumes.id';
    END IF;
    
    -- Add job_description foreign key constraint to interview_questions if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                   WHERE constraint_name = 'interview_questions_job_description_id_fkey' 
                   AND table_name = 'interview_questions') THEN
        ALTER TABLE interview_questions 
        ADD CONSTRAINT interview_questions_job_description_id_fkey 
        FOREIGN KEY (job_description_id) REFERENCES job_descriptions(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added foreign key constraint: interview_questions.job_description_id -> job_descriptions.id';
    END IF;
    
    RAISE NOTICE 'Foreign key constraints verified ✓';
END $$;

-- ============================================================================
-- DATA CLEANUP AND VALIDATION
-- ============================================================================
DO $$ 
BEGIN
    RAISE NOTICE 'Cleaning up orphaned data...';
    
    -- Remove any orphaned analysis_results
    DELETE FROM analysis_results 
    WHERE resume_id IS NOT NULL 
    AND resume_id NOT IN (SELECT id FROM resumes);
    
    DELETE FROM analysis_results 
    WHERE job_description_id IS NOT NULL 
    AND job_description_id NOT IN (SELECT id FROM job_descriptions);
    
    -- Remove any orphaned interview_questions
    DELETE FROM interview_questions 
    WHERE resume_id IS NOT NULL 
    AND resume_id NOT IN (SELECT id FROM resumes);
    
    DELETE FROM interview_questions 
    WHERE job_description_id IS NOT NULL 
    AND job_description_id NOT IN (SELECT id FROM job_descriptions);
    
    -- Update any NULL created_at/updated_at fields
    UPDATE resumes SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL;
    UPDATE resumes SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL;
    UPDATE job_descriptions SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL;
    UPDATE job_descriptions SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL;
    UPDATE analysis_results SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL;
    UPDATE analysis_results SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL;
    
    -- Set default values for JSON columns that might be NULL
    UPDATE resumes SET skills = '[]'::json WHERE skills IS NULL;
    UPDATE resumes SET education = '[]'::json WHERE education IS NULL;
    UPDATE job_descriptions SET requirements = '[]'::json WHERE requirements IS NULL;
    UPDATE job_descriptions SET skills = '[]'::json WHERE skills IS NULL;
    UPDATE analysis_results SET matched_skills = '[]'::json WHERE matched_skills IS NULL;
    UPDATE analysis_results SET missing_skills = '[]'::json WHERE missing_skills IS NULL;
    UPDATE analysis_results SET candidate_strengths = '[]'::json WHERE candidate_strengths IS NULL;
    UPDATE analysis_results SET candidate_weaknesses = '[]'::json WHERE candidate_weaknesses IS NULL;
    UPDATE analysis_results SET recommendations = '[]'::json WHERE recommendations IS NULL;
    
    RAISE NOTICE 'Data cleanup completed ✓';
END $$;

-- ============================================================================
-- FINAL VERIFICATION REPORT
-- ============================================================================
DO $$ 
DECLARE
    resumes_count INTEGER;
    jobs_count INTEGER;
    analysis_count INTEGER;
    interviews_count INTEGER;
    missing_batch_ids INTEGER;
    null_recommendations INTEGER;
BEGIN
    RAISE NOTICE '=== FINAL SCHEMA VERIFICATION REPORT ===';
    
    -- Count records in each table
    SELECT COUNT(*) INTO resumes_count FROM resumes;
    SELECT COUNT(*) INTO jobs_count FROM job_descriptions;
    SELECT COUNT(*) INTO analysis_count FROM analysis_results;
    SELECT COUNT(*) INTO interviews_count FROM interview_questions;
    
    RAISE NOTICE 'Table record counts:';
    RAISE NOTICE '  - Resumes: %', resumes_count;
    RAISE NOTICE '  - Job descriptions: %', jobs_count;
    RAISE NOTICE '  - Analysis results: %', analysis_count;
    RAISE NOTICE '  - Interview questions: %', interviews_count;
    
    -- Check for potential issues
    SELECT COUNT(*) INTO missing_batch_ids 
    FROM resumes 
    WHERE batch_id IS NULL AND created_at > CURRENT_TIMESTAMP - INTERVAL '7 days';
    
    SELECT COUNT(*) INTO null_recommendations 
    FROM analysis_results 
    WHERE recommendations IS NULL;
    
    IF missing_batch_ids > 0 THEN
        RAISE WARNING '% recent resumes are missing batch_id values', missing_batch_ids;
    END IF;
    
    IF null_recommendations > 0 THEN
        RAISE WARNING '% analysis results have NULL recommendations', null_recommendations;
    END IF;
    
    RAISE NOTICE '=== SCHEMA VERIFICATION COMPLETED SUCCESSFULLY ===';
    RAISE NOTICE 'All required tables, columns, indexes, and constraints are now in place';
    RAISE NOTICE 'The database schema fully supports:';
    RAISE NOTICE '  ✓ Resume upload and batch processing';
    RAISE NOTICE '  ✓ Job description creation and bias analysis';
    RAISE NOTICE '  ✓ Automated matching and analysis';
    RAISE NOTICE '  ✓ Interview question generation';
    RAISE NOTICE '  ✓ Results display and tracking';
END $$;

-- Update table statistics for optimal query performance
ANALYZE resumes;
ANALYZE job_descriptions;
ANALYZE analysis_results;
ANALYZE interview_questions;
ANALYZE skills;
ANALYZE skill_categories;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================
SELECT 'Database schema verification and fixes completed successfully!' AS status,
       'All required tables, columns, indexes, and constraints are now properly configured' AS message;