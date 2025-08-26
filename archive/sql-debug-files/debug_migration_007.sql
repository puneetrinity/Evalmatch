-- Debug script to identify why migration 007 is failing
-- Run this on Railway database console to see the exact issue

-- 1. Check if tables exist
SELECT 'Tables Check' as check_type;
SELECT table_name, table_type 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('skill_categories', 'skills', 'analysis_results', 'interview_questions', 'resumes', 'job_descriptions', 'skill_promotion_log')
ORDER BY table_name;

-- 2. Check existing constraints
SELECT 'Existing Constraints' as check_type;
SELECT 
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
ORDER BY tc.table_name, tc.constraint_name;

-- 3. Check for orphaned data that would prevent foreign key creation

-- Check skill_categories self-reference
SELECT 'Orphaned skill_categories.parent_id' as check_type;
SELECT COUNT(*) as orphaned_count
FROM skill_categories sc1
LEFT JOIN skill_categories sc2 ON sc1.parent_id = sc2.id
WHERE sc1.parent_id IS NOT NULL AND sc2.id IS NULL;

-- Show orphaned skill_categories if any
SELECT 'Sample orphaned skill_categories' as check_type;
SELECT sc1.id, sc1.parent_id, sc1.name
FROM skill_categories sc1
LEFT JOIN skill_categories sc2 ON sc1.parent_id = sc2.id
WHERE sc1.parent_id IS NOT NULL AND sc2.id IS NULL
LIMIT 10;

-- Check skills.category_id
SELECT 'Orphaned skills.category_id' as check_type;
SELECT COUNT(*) as orphaned_count
FROM skills s
LEFT JOIN skill_categories sc ON s.category_id = sc.id
WHERE s.category_id IS NOT NULL AND sc.id IS NULL;

-- Show orphaned skills if any
SELECT 'Sample orphaned skills' as check_type;
SELECT s.id, s.category_id, s.name
FROM skills s
LEFT JOIN skill_categories sc ON s.category_id = sc.id
WHERE s.category_id IS NOT NULL AND sc.id IS NULL
LIMIT 10;

-- Check analysis_results.resume_id
SELECT 'Orphaned analysis_results.resume_id' as check_type;
SELECT COUNT(*) as orphaned_count
FROM analysis_results ar
LEFT JOIN resumes r ON ar.resume_id = r.id
WHERE ar.resume_id IS NOT NULL AND r.id IS NULL;

-- Check analysis_results.job_description_id
SELECT 'Orphaned analysis_results.job_description_id' as check_type;
SELECT COUNT(*) as orphaned_count
FROM analysis_results ar
LEFT JOIN job_descriptions jd ON ar.job_description_id = jd.id
WHERE ar.job_description_id IS NOT NULL AND jd.id IS NULL;

-- Check interview_questions.resume_id
SELECT 'Orphaned interview_questions.resume_id' as check_type;
SELECT COUNT(*) as orphaned_count
FROM interview_questions iq
LEFT JOIN resumes r ON iq.resume_id = r.id
WHERE iq.resume_id IS NOT NULL AND r.id IS NULL;

-- Check interview_questions.job_description_id
SELECT 'Orphaned interview_questions.job_description_id' as check_type;
SELECT COUNT(*) as orphaned_count
FROM interview_questions iq
LEFT JOIN job_descriptions jd ON iq.job_description_id = jd.id
WHERE iq.job_description_id IS NOT NULL AND jd.id IS NULL;

-- Check skill_promotion_log.main_skill_id
SELECT 'Orphaned skill_promotion_log.main_skill_id' as check_type;
SELECT COUNT(*) as orphaned_count
FROM skill_promotion_log spl
LEFT JOIN skills s ON spl.main_skill_id = s.id
WHERE spl.main_skill_id IS NOT NULL AND s.id IS NULL;

-- Show sample orphaned skill_promotion_log if any
SELECT 'Sample orphaned skill_promotion_log' as check_type;
SELECT spl.id, spl.main_skill_id, spl.skill_id
FROM skill_promotion_log spl
LEFT JOIN skills s ON spl.main_skill_id = s.id
WHERE spl.main_skill_id IS NOT NULL AND s.id IS NULL
LIMIT 10;

-- 4. Try adding each constraint individually to see which one fails
SELECT 'Testing constraint creation' as check_type;
SELECT 'Run each ALTER TABLE statement from migration 007 individually to identify the failing constraint' as instruction;