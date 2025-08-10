-- Performance Optimization Migration v2.1.0
-- This migration adds critical performance indexes identified in the improvement plan
-- Addresses N+1 queries and 3x slower database operations
-- Run date: 2025-08-06

-- Record this migration
INSERT INTO schema_migrations (version, description) 
VALUES ('002_performance_indexes', 'Performance optimization indexes for 3x faster queries')
ON CONFLICT (version) DO NOTHING;

-- ============================================================================
-- COMPOSITE INDEXES FOR COMMON QUERY PATTERNS
-- ============================================================================

-- CRITICAL: Composite index for analysis results queries
-- Optimizes: "Get all analysis results for a user and job"
CREATE INDEX IF NOT EXISTS idx_analysis_results_composite 
ON analysis_results(user_id, job_description_id, created_at DESC);

-- CRITICAL: Composite index for resume filtering
-- Optimizes: "Get resumes by user with batch/session filtering"
CREATE INDEX IF NOT EXISTS idx_resumes_batch_session 
ON resumes(user_id, batch_id, session_id) 
WHERE batch_id IS NOT NULL OR session_id IS NOT NULL;

-- CRITICAL: Composite index for resume-job analysis lookups
-- Optimizes: "Check if analysis exists for resume-job pair"
CREATE INDEX IF NOT EXISTS idx_analysis_results_resume_job
ON analysis_results(resume_id, job_description_id);

-- CRITICAL: Index for resume metadata queries
-- Optimizes: "List resumes with metadata without full table scan"
CREATE INDEX IF NOT EXISTS idx_resumes_user_metadata
ON resumes(user_id, id, filename, created_at);

-- ============================================================================
-- PERFORMANCE INDEXES FOR SORTING AND FILTERING
-- ============================================================================

-- Optimize match percentage queries (top candidates)
CREATE INDEX IF NOT EXISTS idx_analysis_results_match_percentage
ON analysis_results(job_description_id, match_percentage DESC)
WHERE match_percentage > 0;

-- Optimize recent activity queries
CREATE INDEX IF NOT EXISTS idx_resumes_user_recent
ON resumes(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_descriptions_user_recent
ON job_descriptions(user_id, created_at DESC);

-- Optimize batch processing queries
CREATE INDEX IF NOT EXISTS idx_resumes_batch_created
ON resumes(batch_id, created_at DESC)
WHERE batch_id IS NOT NULL;

-- ============================================================================
-- PARTIAL INDEXES FOR COMMON FILTERS
-- ============================================================================

-- Optimize queries for analyzed resumes only
CREATE INDEX IF NOT EXISTS idx_resumes_analyzed
ON resumes(user_id, created_at DESC)
WHERE analyzed_data IS NOT NULL;

-- Optimize queries for unprocessed items
CREATE INDEX IF NOT EXISTS idx_resumes_unprocessed
ON resumes(user_id, created_at DESC)
WHERE analyzed_data IS NULL;

-- ============================================================================
-- JSON INDEXES FOR SKILL QUERIES
-- ============================================================================

-- GIN index for skill aliases JSON queries (commented - requires jsonb_path_ops operator class)
-- CREATE INDEX IF NOT EXISTS idx_skills_aliases_gin
-- ON skills USING gin(aliases jsonb_path_ops);

-- GIN index for interview questions JSON queries (commented - requires jsonb_path_ops operator class)  
-- CREATE INDEX IF NOT EXISTS idx_interview_questions_gin
-- ON interview_questions USING gin(questions jsonb_path_ops);

-- ============================================================================
-- ANALYZE TABLES FOR QUERY PLANNER
-- ============================================================================

-- Update statistics for query planner optimization
ANALYZE resumes;
ANALYZE job_descriptions;
ANALYZE analysis_results;
ANALYZE interview_questions;
ANALYZE skills;
ANALYZE skill_categories;

-- ============================================================================
-- PERFORMANCE MONITORING
-- ============================================================================

-- Note: Extensions and system settings require superuser privileges
-- These would be configured at the Railway PostgreSQL service level
-- 
-- CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
-- ALTER SYSTEM SET log_min_duration_statement = 1000;
-- SELECT pg_reload_conf();