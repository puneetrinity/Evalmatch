-- Run this in Railway database console to see EXACTLY what's failing
-- This will tell us the specific error message

DO $$
DECLARE
    error_msg TEXT;
BEGIN
    -- Test each constraint individually to find the exact failure
    
    -- Test 1: skill_categories self-reference
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'fk_skill_categories_parent' 
            AND table_name = 'skill_categories'
        ) THEN
            RAISE NOTICE 'Testing skill_categories constraint...';
            ALTER TABLE skill_categories 
            ADD CONSTRAINT fk_skill_categories_parent 
            FOREIGN KEY (parent_id) REFERENCES skill_categories(id) ON DELETE CASCADE;
            RAISE NOTICE 'SUCCESS: fk_skill_categories_parent added';
            
            -- Remove it for next test
            ALTER TABLE skill_categories DROP CONSTRAINT fk_skill_categories_parent;
        END IF;
    EXCEPTION
        WHEN OTHERS THEN
            error_msg := SQLERRM;
            RAISE NOTICE 'FAILED: skill_categories constraint - %', error_msg;
    END;
    
    -- Test 2: skills.category_id
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'fk_skills_category' 
            AND table_name = 'skills'
        ) THEN
            RAISE NOTICE 'Testing skills.category_id constraint...';
            ALTER TABLE skills 
            ADD CONSTRAINT fk_skills_category 
            FOREIGN KEY (category_id) REFERENCES skill_categories(id) ON DELETE SET NULL;
            RAISE NOTICE 'SUCCESS: fk_skills_category added';
            
            -- Remove it for next test
            ALTER TABLE skills DROP CONSTRAINT fk_skills_category;
        END IF;
    EXCEPTION
        WHEN OTHERS THEN
            error_msg := SQLERRM;
            RAISE NOTICE 'FAILED: skills.category_id constraint - %', error_msg;
    END;
    
    -- Test 3: analysis_results.resume_id
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'fk_analysis_results_resume' 
            AND table_name = 'analysis_results'
        ) THEN
            RAISE NOTICE 'Testing analysis_results.resume_id constraint...';
            ALTER TABLE analysis_results 
            ADD CONSTRAINT fk_analysis_results_resume 
            FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE;
            RAISE NOTICE 'SUCCESS: fk_analysis_results_resume added';
            
            -- Remove it for next test
            ALTER TABLE analysis_results DROP CONSTRAINT fk_analysis_results_resume;
        END IF;
    EXCEPTION
        WHEN OTHERS THEN
            error_msg := SQLERRM;
            RAISE NOTICE 'FAILED: analysis_results.resume_id constraint - %', error_msg;
    END;
    
    -- Test 4: analysis_results.job_description_id
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'fk_analysis_results_job' 
            AND table_name = 'analysis_results'
        ) THEN
            RAISE NOTICE 'Testing analysis_results.job_description_id constraint...';
            ALTER TABLE analysis_results 
            ADD CONSTRAINT fk_analysis_results_job 
            FOREIGN KEY (job_description_id) REFERENCES job_descriptions(id) ON DELETE CASCADE;
            RAISE NOTICE 'SUCCESS: fk_analysis_results_job added';
            
            -- Remove it for next test
            ALTER TABLE analysis_results DROP CONSTRAINT fk_analysis_results_job;
        END IF;
    EXCEPTION
        WHEN OTHERS THEN
            error_msg := SQLERRM;
            RAISE NOTICE 'FAILED: analysis_results.job_description_id constraint - %', error_msg;
    END;
    
    -- Test 5: interview_questions.resume_id
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'fk_interview_questions_resume' 
            AND table_name = 'interview_questions'
        ) THEN
            RAISE NOTICE 'Testing interview_questions.resume_id constraint...';
            ALTER TABLE interview_questions 
            ADD CONSTRAINT fk_interview_questions_resume 
            FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE;
            RAISE NOTICE 'SUCCESS: fk_interview_questions_resume added';
            
            -- Remove it for next test
            ALTER TABLE interview_questions DROP CONSTRAINT fk_interview_questions_resume;
        END IF;
    EXCEPTION
        WHEN OTHERS THEN
            error_msg := SQLERRM;
            RAISE NOTICE 'FAILED: interview_questions.resume_id constraint - %', error_msg;
    END;
    
    -- Test 6: interview_questions.job_description_id
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'fk_interview_questions_job' 
            AND table_name = 'interview_questions'
        ) THEN
            RAISE NOTICE 'Testing interview_questions.job_description_id constraint...';
            ALTER TABLE interview_questions 
            ADD CONSTRAINT fk_interview_questions_job 
            FOREIGN KEY (job_description_id) REFERENCES job_descriptions(id) ON DELETE CASCADE;
            RAISE NOTICE 'SUCCESS: fk_interview_questions_job added';
            
            -- Remove it for next test
            ALTER TABLE interview_questions DROP CONSTRAINT fk_interview_questions_job;
        END IF;
    EXCEPTION
        WHEN OTHERS THEN
            error_msg := SQLERRM;
            RAISE NOTICE 'FAILED: interview_questions.job_description_id constraint - %', error_msg;
    END;
    
    -- Test 7: skill_promotion_log.main_skill_id
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'fk_skill_promotion_log_main_skill' 
            AND table_name = 'skill_promotion_log'
        ) THEN
            RAISE NOTICE 'Testing skill_promotion_log.main_skill_id constraint...';
            ALTER TABLE skill_promotion_log 
            ADD CONSTRAINT fk_skill_promotion_log_main_skill 
            FOREIGN KEY (main_skill_id) REFERENCES skills(id) ON DELETE CASCADE;
            RAISE NOTICE 'SUCCESS: fk_skill_promotion_log_main_skill added';
            
            -- Remove it for next test
            ALTER TABLE skill_promotion_log DROP CONSTRAINT fk_skill_promotion_log_main_skill;
        END IF;
    EXCEPTION
        WHEN OTHERS THEN
            error_msg := SQLERRM;
            RAISE NOTICE 'FAILED: skill_promotion_log.main_skill_id constraint - %', error_msg;
    END;

END $$;