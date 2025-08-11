-- Quick Database State Check
-- Check current migration status and table existence

-- 1. Check if migration tracking table exists and what migrations have been applied
\echo '=== MIGRATION STATUS ==='
SELECT 
    version,
    description,
    applied_at
FROM schema_migrations
WHERE version LIKE '%007%' OR version LIKE '%foreign%' OR version LIKE '%constraint%'
ORDER BY applied_at DESC;

-- 2. Check if the problematic tables exist
\echo '=== TABLE EXISTENCE ==='
SELECT 
    schemaname,
    tablename,
    tableowner
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('skills', 'skill_categories', 'skill_promotion_log', 'resumes', 'job_descriptions', 'analysis_results', 'interview_questions')
ORDER BY tablename;

-- 3. Check if the foreign key constraints from 007 migration already exist
\echo '=== FOREIGN KEY CONSTRAINTS FROM 007 MIGRATION ==='
SELECT 
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS references_table,
    ccu.column_name AS references_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu 
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
AND tc.table_schema = 'public'
AND (
    tc.constraint_name LIKE '%fk_skill%' OR
    tc.constraint_name LIKE '%fk_analysis%' OR 
    tc.constraint_name LIKE '%fk_interview%' OR
    tc.constraint_name LIKE '%promotion%'
)
ORDER BY tc.table_name, tc.constraint_name;

-- 4. Check basic table structure for key columns
\echo '=== KEY COLUMN VERIFICATION ==='
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
AND (
    (table_name = 'skills' AND column_name IN ('id', 'category_id')) OR
    (table_name = 'skill_categories' AND column_name IN ('id', 'parent_id')) OR
    (table_name = 'skill_promotion_log' AND column_name IN ('skill_id', 'main_skill_id')) OR
    (table_name = 'analysis_results' AND column_name IN ('resume_id', 'job_description_id')) OR
    (table_name = 'interview_questions' AND column_name IN ('resume_id', 'job_description_id'))
)
ORDER BY table_name, column_name;

-- 5. Quick data integrity check
\echo '=== DATA INTEGRITY QUICK CHECK ==='
-- Check if skill_promotion_log has invalid references to skills table
SELECT 
    'skill_promotion_log referencing skills' as check_name,
    COUNT(*) as total_records,
    COUNT(*) FILTER (WHERE main_skill_id IS NOT NULL) as records_with_main_skill_id
FROM skill_promotion_log;

-- Check record counts
SELECT 
    'skills' as table_name, COUNT(*) as record_count FROM skills
UNION ALL
SELECT 
    'skill_categories' as table_name, COUNT(*) as record_count FROM skill_categories
UNION ALL 
SELECT
    'skill_promotion_log' as table_name, COUNT(*) as record_count FROM skill_promotion_log;