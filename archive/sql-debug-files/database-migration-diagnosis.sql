-- ============================================================================
-- DATABASE MIGRATION DIAGNOSIS SCRIPT
-- For investigating 007_add_foreign_key_constraints.sql failure
-- Run date: 2025-08-10
-- ============================================================================

-- Step 1: Check if all referenced tables exist
\echo '=== TABLE EXISTENCE CHECK ==='
SELECT 
    table_name,
    CASE 
        WHEN table_name IS NOT NULL THEN '✅ EXISTS'
        ELSE '❌ MISSING'
    END as status
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
    'skill_categories', 'skills', 'resumes', 'job_descriptions', 
    'analysis_results', 'interview_questions', 'skill_promotion_log'
)
ORDER BY table_name;

-- Step 2: Check specific column existence for foreign key references
\echo ''
\echo '=== FOREIGN KEY COLUMN EXISTENCE CHECK ==='
SELECT 
    t.table_name,
    t.column_name,
    t.data_type,
    CASE 
        WHEN t.column_name IS NOT NULL THEN '✅ EXISTS'
        ELSE '❌ MISSING'
    END as status
FROM information_schema.columns t
WHERE t.table_schema = 'public'
AND (
    (t.table_name = 'skill_categories' AND t.column_name = 'parent_id') OR
    (t.table_name = 'skills' AND t.column_name IN ('id', 'category_id')) OR
    (t.table_name = 'analysis_results' AND t.column_name IN ('resume_id', 'job_description_id')) OR
    (t.table_name = 'interview_questions' AND t.column_name IN ('resume_id', 'job_description_id')) OR
    (t.table_name = 'skill_promotion_log' AND t.column_name IN ('main_skill_id', 'skill_id')) OR
    (t.table_name = 'resumes' AND t.column_name = 'id') OR
    (t.table_name = 'job_descriptions' AND t.column_name = 'id')
)
ORDER BY t.table_name, t.column_name;

-- Step 3: Check existing foreign key constraints
\echo ''
\echo '=== EXISTING FOREIGN KEY CONSTRAINTS ==='
SELECT 
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    tc.constraint_type
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

-- Step 4: Check for data integrity issues that could prevent FK creation
\echo ''
\echo '=== DATA INTEGRITY CHECKS ==='

-- Check for invalid category_id references in skills table
SELECT 
    'skills.category_id -> skill_categories.id' as reference_check,
    COUNT(*) as invalid_references
FROM skills s
LEFT JOIN skill_categories sc ON s.category_id = sc.id
WHERE s.category_id IS NOT NULL AND sc.id IS NULL;

-- Check for invalid resume_id references in analysis_results table
SELECT 
    'analysis_results.resume_id -> resumes.id' as reference_check,
    COUNT(*) as invalid_references
FROM analysis_results ar
LEFT JOIN resumes r ON ar.resume_id = r.id
WHERE ar.resume_id IS NOT NULL AND r.id IS NULL;

-- Check for invalid job_description_id references in analysis_results table
SELECT 
    'analysis_results.job_description_id -> job_descriptions.id' as reference_check,
    COUNT(*) as invalid_references
FROM analysis_results ar
LEFT JOIN job_descriptions jd ON ar.job_description_id = jd.id
WHERE ar.job_description_id IS NOT NULL AND jd.id IS NULL;

-- Check for invalid resume_id references in interview_questions table
SELECT 
    'interview_questions.resume_id -> resumes.id' as reference_check,
    COUNT(*) as invalid_references
FROM interview_questions iq
LEFT JOIN resumes r ON iq.resume_id = r.id
WHERE iq.resume_id IS NOT NULL AND r.id IS NULL;

-- Check for invalid job_description_id references in interview_questions table
SELECT 
    'interview_questions.job_description_id -> job_descriptions.id' as reference_check,
    COUNT(*) as invalid_references
FROM interview_questions iq
LEFT JOIN job_descriptions jd ON iq.job_description_id = jd.id
WHERE iq.job_description_id IS NOT NULL AND jd.id IS NULL;

-- Step 5: Check for NULL foreign key values
\echo ''
\echo '=== NULL FOREIGN KEY VALUE COUNTS ==='
SELECT 
    'skill_categories.parent_id' as column_name,
    COUNT(*) FILTER (WHERE parent_id IS NULL) as null_count,
    COUNT(*) as total_count
FROM skill_categories
UNION ALL
SELECT 
    'skills.category_id' as column_name,
    COUNT(*) FILTER (WHERE category_id IS NULL) as null_count,
    COUNT(*) as total_count
FROM skills
UNION ALL
SELECT 
    'analysis_results.resume_id' as column_name,
    COUNT(*) FILTER (WHERE resume_id IS NULL) as null_count,
    COUNT(*) as total_count
FROM analysis_results
UNION ALL
SELECT 
    'analysis_results.job_description_id' as column_name,
    COUNT(*) FILTER (WHERE job_description_id IS NULL) as null_count,
    COUNT(*) as total_count
FROM analysis_results
UNION ALL
SELECT 
    'interview_questions.resume_id' as column_name,
    COUNT(*) FILTER (WHERE resume_id IS NULL) as null_count,
    COUNT(*) as total_count
FROM interview_questions
UNION ALL
SELECT 
    'interview_questions.job_description_id' as column_name,
    COUNT(*) FILTER (WHERE job_description_id IS NULL) as null_count,
    COUNT(*) as total_count
FROM interview_questions;

-- Step 6: Check current database connection and permissions
\echo ''
\echo '=== DATABASE CONNECTION INFO ==='
SELECT 
    current_database() as database_name,
    current_user as username,
    version() as postgres_version,
    current_timestamp as current_time;

-- Step 7: Check table record counts
\echo ''
\echo '=== TABLE RECORD COUNTS ==='
SELECT 
    'skill_categories' as table_name, COUNT(*) as record_count FROM skill_categories
UNION ALL
SELECT 
    'skills' as table_name, COUNT(*) as record_count FROM skills
UNION ALL
SELECT 
    'resumes' as table_name, COUNT(*) as record_count FROM resumes
UNION ALL
SELECT 
    'job_descriptions' as table_name, COUNT(*) as record_count FROM job_descriptions
UNION ALL
SELECT 
    'analysis_results' as table_name, COUNT(*) as record_count FROM analysis_results
UNION ALL
SELECT 
    'interview_questions' as table_name, COUNT(*) as record_count FROM interview_questions
UNION ALL
SELECT 
    'skill_promotion_log' as table_name, COUNT(*) as record_count FROM skill_promotion_log
ORDER BY table_name;

-- Step 8: Check schema migrations status
\echo ''
\echo '=== MIGRATION STATUS ==='
SELECT 
    version,
    description,
    applied_at
FROM schema_migrations
ORDER BY applied_at DESC
LIMIT 10;

-- Step 9: Test individual foreign key constraint creation
\echo ''
\echo '=== TESTING INDIVIDUAL CONSTRAINT CREATION ==='

-- Try to create each constraint individually to see which one fails
\echo 'Testing skill_categories self-reference constraint...'
DO $$
BEGIN
    -- Check if constraint already exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_skill_categories_parent'
        AND table_name = 'skill_categories'
    ) THEN
        BEGIN
            ALTER TABLE skill_categories 
            ADD CONSTRAINT fk_skill_categories_parent_test
            FOREIGN KEY (parent_id) REFERENCES skill_categories(id) ON DELETE CASCADE;
            
            -- If successful, drop the test constraint
            ALTER TABLE skill_categories DROP CONSTRAINT fk_skill_categories_parent_test;
            RAISE NOTICE '✅ skill_categories self-reference constraint can be created successfully';
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE '❌ skill_categories self-reference constraint failed: %', SQLERRM;
        END;
    ELSE
        RAISE NOTICE '✅ skill_categories self-reference constraint already exists';
    END IF;
END $$;

\echo 'Testing skills -> skill_categories constraint...'
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_skills_category'
        AND table_name = 'skills'
    ) THEN
        BEGIN
            ALTER TABLE skills 
            ADD CONSTRAINT fk_skills_category_test
            FOREIGN KEY (category_id) REFERENCES skill_categories(id) ON DELETE SET NULL;
            
            ALTER TABLE skills DROP CONSTRAINT fk_skills_category_test;
            RAISE NOTICE '✅ skills -> skill_categories constraint can be created successfully';
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE '❌ skills -> skill_categories constraint failed: %', SQLERRM;
        END;
    ELSE
        RAISE NOTICE '✅ skills -> skill_categories constraint already exists';
    END IF;
END $$;

\echo 'Testing analysis_results -> resumes constraint...'
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_analysis_results_resume'
        AND table_name = 'analysis_results'
    ) THEN
        BEGIN
            ALTER TABLE analysis_results 
            ADD CONSTRAINT fk_analysis_results_resume_test
            FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE;
            
            ALTER TABLE analysis_results DROP CONSTRAINT fk_analysis_results_resume_test;
            RAISE NOTICE '✅ analysis_results -> resumes constraint can be created successfully';
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE '❌ analysis_results -> resumes constraint failed: %', SQLERRM;
        END;
    ELSE
        RAISE NOTICE '✅ analysis_results -> resumes constraint already exists';
    END IF;
END $$;

\echo 'Testing analysis_results -> job_descriptions constraint...'
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_analysis_results_job'
        AND table_name = 'analysis_results'
    ) THEN
        BEGIN
            ALTER TABLE analysis_results 
            ADD CONSTRAINT fk_analysis_results_job_test
            FOREIGN KEY (job_description_id) REFERENCES job_descriptions(id) ON DELETE CASCADE;
            
            ALTER TABLE analysis_results DROP CONSTRAINT fk_analysis_results_job_test;
            RAISE NOTICE '✅ analysis_results -> job_descriptions constraint can be created successfully';
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE '❌ analysis_results -> job_descriptions constraint failed: %', SQLERRM;
        END;
    ELSE
        RAISE NOTICE '✅ analysis_results -> job_descriptions constraint already exists';
    END IF;
END $$;

\echo ''
\echo '=== DIAGNOSIS COMPLETE ==='
\echo 'Review the output above to identify the specific cause of the foreign key constraint failure.'
\echo 'Common issues:'
\echo '1. Referenced tables do not exist'
\echo '2. Referenced columns do not exist or have wrong data types'
\echo '3. Data integrity violations (orphaned records)'
\echo '4. Permissions issues'
\echo '5. Existing constraint conflicts'