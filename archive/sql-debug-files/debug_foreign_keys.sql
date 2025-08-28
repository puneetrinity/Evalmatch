-- ============================================================================
-- DEBUG SCRIPT FOR FOREIGN KEY CONSTRAINTS MIGRATION FAILURE
-- Run these queries on Railway to identify the exact constraint causing failure
-- ============================================================================

-- 1. CHECK EXISTING CONSTRAINTS
-- This will show which constraints already exist
SELECT 
    tc.table_name,
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name,
    ccu.table_name AS referenced_table_name,
    ccu.column_name AS referenced_column_name
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name IN (
        'skill_categories', 
        'skills', 
        'analysis_results', 
        'interview_questions', 
        'skill_promotion_log'
    )
ORDER BY tc.table_name, tc.constraint_name;

-- ============================================================================
-- 2. CHECK FOR ORPHANED DATA (REFERENTIAL INTEGRITY VIOLATIONS)
-- ============================================================================

-- Check skill_categories self-reference
SELECT 'skill_categories.parent_id orphans' as issue_type, COUNT(*) as orphan_count
FROM skill_categories sc1
WHERE sc1.parent_id IS NOT NULL 
    AND NOT EXISTS (
        SELECT 1 FROM skill_categories sc2 WHERE sc2.id = sc1.parent_id
    );

-- Check skills.category_id orphans
SELECT 'skills.category_id orphans' as issue_type, COUNT(*) as orphan_count
FROM skills s
WHERE s.category_id IS NOT NULL 
    AND NOT EXISTS (
        SELECT 1 FROM skill_categories sc WHERE sc.id = s.category_id
    );

-- Check analysis_results.resume_id orphans
SELECT 'analysis_results.resume_id orphans' as issue_type, COUNT(*) as orphan_count
FROM analysis_results ar
WHERE ar.resume_id IS NOT NULL 
    AND NOT EXISTS (
        SELECT 1 FROM resumes r WHERE r.id = ar.resume_id
    );

-- Check analysis_results.job_description_id orphans
SELECT 'analysis_results.job_description_id orphans' as issue_type, COUNT(*) as orphan_count
FROM analysis_results ar
WHERE ar.job_description_id IS NOT NULL 
    AND NOT EXISTS (
        SELECT 1 FROM job_descriptions jd WHERE jd.id = ar.job_description_id
    );

-- Check interview_questions.resume_id orphans
SELECT 'interview_questions.resume_id orphans' as issue_type, COUNT(*) as orphan_count
FROM interview_questions iq
WHERE iq.resume_id IS NOT NULL 
    AND NOT EXISTS (
        SELECT 1 FROM resumes r WHERE r.id = iq.resume_id
    );

-- Check interview_questions.job_description_id orphans
SELECT 'interview_questions.job_description_id orphans' as issue_type, COUNT(*) as orphan_count
FROM interview_questions iq
WHERE iq.job_description_id IS NOT NULL 
    AND NOT EXISTS (
        SELECT 1 FROM job_descriptions jd WHERE jd.id = iq.job_description_id
    );

-- Check skill_promotion_log.main_skill_id orphans (this is likely the problem)
SELECT 'skill_promotion_log.main_skill_id orphans' as issue_type, COUNT(*) as orphan_count
FROM skill_promotion_log spl
WHERE spl.main_skill_id IS NOT NULL 
    AND NOT EXISTS (
        SELECT 1 FROM skills s WHERE s.id = spl.main_skill_id
    );

-- ============================================================================
-- 3. CHECK TABLE EXISTENCE AND RECORD COUNTS
-- ============================================================================

SELECT 
    'Table Existence Check' as check_type,
    'skill_categories' as table_name,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'skill_categories') 
         THEN 'EXISTS' ELSE 'MISSING' END as status,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'skill_categories') 
         THEN (SELECT COUNT(*)::text FROM skill_categories) ELSE '0' END as record_count

UNION ALL

SELECT 
    'Table Existence Check' as check_type,
    'skills' as table_name,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'skills') 
         THEN 'EXISTS' ELSE 'MISSING' END as status,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'skills') 
         THEN (SELECT COUNT(*)::text FROM skills) ELSE '0' END as record_count

UNION ALL

SELECT 
    'Table Existence Check' as check_type,
    'resumes' as table_name,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'resumes') 
         THEN 'EXISTS' ELSE 'MISSING' END as status,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'resumes') 
         THEN (SELECT COUNT(*)::text FROM resumes) ELSE '0' END as record_count

UNION ALL

SELECT 
    'Table Existence Check' as check_type,
    'job_descriptions' as table_name,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'job_descriptions') 
         THEN 'EXISTS' ELSE 'MISSING' END as status,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'job_descriptions') 
         THEN (SELECT COUNT(*)::text FROM job_descriptions) ELSE '0' END as record_count

UNION ALL

SELECT 
    'Table Existence Check' as check_type,
    'analysis_results' as table_name,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'analysis_results') 
         THEN 'EXISTS' ELSE 'MISSING' END as status,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'analysis_results') 
         THEN (SELECT COUNT(*)::text FROM analysis_results) ELSE '0' END as record_count

UNION ALL

SELECT 
    'Table Existence Check' as check_type,
    'interview_questions' as table_name,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'interview_questions') 
         THEN 'EXISTS' ELSE 'MISSING' END as status,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'interview_questions') 
         THEN (SELECT COUNT(*)::text FROM interview_questions) ELSE '0' END as record_count

UNION ALL

SELECT 
    'Table Existence Check' as check_type,
    'skill_promotion_log' as table_name,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'skill_promotion_log') 
         THEN 'EXISTS' ELSE 'MISSING' END as status,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'skill_promotion_log') 
         THEN (SELECT COUNT(*)::text FROM skill_promotion_log) ELSE '0' END as record_count;

-- ============================================================================
-- 4. DETAILED ORPHANED RECORD INSPECTION
-- ============================================================================

-- Show actual orphaned records for detailed analysis
SELECT 'ORPHANED skill_promotion_log records' as issue_description;

SELECT 
    spl.id,
    spl.skill_id,
    spl.main_skill_id,
    spl.promotion_reason,
    spl.created_at
FROM skill_promotion_log spl
WHERE spl.main_skill_id IS NOT NULL 
    AND NOT EXISTS (
        SELECT 1 FROM skills s WHERE s.id = spl.main_skill_id
    )
LIMIT 10;

-- Show actual orphaned analysis_results records
SELECT 'ORPHANED analysis_results records' as issue_description;

SELECT 
    ar.id,
    ar.resume_id,
    ar.job_description_id,
    ar.created_at
FROM analysis_results ar
WHERE (ar.resume_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM resumes r WHERE r.id = ar.resume_id))
   OR (ar.job_description_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM job_descriptions jd WHERE jd.id = ar.job_description_id))
LIMIT 10;