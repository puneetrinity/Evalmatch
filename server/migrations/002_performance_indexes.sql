-- Performance Optimization Indexes Migration v2.0.1
-- Adds critical indexes for improved query performance
-- Run date: 2025-08-01
-- Based on analysis of N+1 query patterns and performance bottlenecks

-- ============================================================================
-- MIGRATION TRACKING
-- ============================================================================
INSERT INTO schema_migrations (version, description) 
VALUES ('002_performance_indexes', 'Performance optimization indexes for critical queries')
ON CONFLICT (version) DO NOTHING;

-- ============================================================================
-- CRITICAL PERFORMANCE INDEXES
-- ============================================================================

-- Index for user-based resume queries (most common access pattern)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_resumes_user_session 
ON resumes(user_id, session_id) 
WHERE user_id IS NOT NULL;

-- Index for analysis results by job and user (common in analysis workflows)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analysis_results_job_user 
ON analysis_results(job_description_id, user_id) 
WHERE user_id IS NOT NULL;

-- Index for job descriptions by user and creation date (listing/filtering)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_descriptions_user_created 
ON job_descriptions(user_id, created_at DESC) 
WHERE user_id IS NOT NULL;

-- Index for resume content searches (text operations)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_resumes_content 
ON resumes USING gin(to_tsvector('english', content)) 
WHERE content IS NOT NULL;

-- Index for analysis results by resume (N+1 query optimization)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analysis_results_resume 
ON analysis_results(resume_id, created_at DESC);

-- Index for interview questions by resume and job (common lookup)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_interview_questions_resume_job 
ON interview_questions(resume_id, job_description_id);

-- ============================================================================
-- ADDITIONAL PERFORMANCE INDEXES
-- ============================================================================

-- Index for skills lookups (semantic matching)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_skills_normalized_name 
ON skills(normalized_name);

-- Index for skill categories hierarchy traversal
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_skill_categories_parent 
ON skill_categories(parent_id, level);

-- Index for recent analysis results (dashboard queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analysis_results_recent 
ON analysis_results(created_at DESC) 
WHERE created_at > (CURRENT_TIMESTAMP - INTERVAL '30 days');

-- ============================================================================
-- FOREIGN KEY INDEXES (for join performance)
-- ============================================================================

-- Add missing columns to analysis_results if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'analysis_results' AND column_name = 'user_id') THEN
        ALTER TABLE analysis_results ADD COLUMN user_id TEXT;
    END IF;
END $$;

-- Add missing columns to job_descriptions if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'job_descriptions' AND column_name = 'user_id') THEN
        ALTER TABLE job_descriptions ADD COLUMN user_id TEXT;
    END IF;
END $$;

-- Foreign key indexes for better join performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analysis_results_resume_fk 
ON analysis_results(resume_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analysis_results_job_fk 
ON analysis_results(job_description_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_interview_questions_resume_fk 
ON interview_questions(resume_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_interview_questions_job_fk 
ON interview_questions(job_description_id);

-- ============================================================================
-- QUERY OPTIMIZATION STATISTICS
-- ============================================================================

-- Update table statistics for query planner optimization
ANALYZE resumes;
ANALYZE job_descriptions;
ANALYZE analysis_results;
ANALYZE interview_questions;
ANALYZE skills;
ANALYZE skill_categories;

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON INDEX idx_resumes_user_session IS 'Optimizes user resume listings and session-based queries';
COMMENT ON INDEX idx_analysis_results_job_user IS 'Optimizes analysis result retrieval by job and user';
COMMENT ON INDEX idx_job_descriptions_user_created IS 'Optimizes job listing queries with creation date sorting';
COMMENT ON INDEX idx_resumes_content IS 'Enables fast full-text search on resume content';
COMMENT ON INDEX idx_analysis_results_recent IS 'Optimizes dashboard queries for recent analysis results';