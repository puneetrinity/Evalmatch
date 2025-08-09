-- Add foreign key constraints to maintain referential integrity
-- This migration adds proper relationships between tables

-- Add foreign key constraints for skill categories (self-referencing)
-- Note: We use ON DELETE CASCADE for parent categories to clean up hierarchies
ALTER TABLE skill_categories 
ADD CONSTRAINT fk_skill_categories_parent 
FOREIGN KEY (parent_id) REFERENCES skill_categories(id) ON DELETE CASCADE;

-- Add foreign key constraints for skills table
-- Note: We use ON DELETE SET NULL so skills can exist without categories
ALTER TABLE skills 
ADD CONSTRAINT fk_skills_category 
FOREIGN KEY (category_id) REFERENCES skill_categories(id) ON DELETE SET NULL;

-- Add foreign key constraints for resumes table
-- Note: user_id is text (Firebase UID) so no FK needed for users table
-- No FK for sessionId/batchId as they're external identifiers

-- Add foreign key constraints for job_descriptions table
-- Note: user_id is text (Firebase UID) so no FK needed for users table

-- Add foreign key constraints for analysis_results table
-- Note: user_id is text (Firebase UID) so no FK needed for users table
ALTER TABLE analysis_results 
ADD CONSTRAINT fk_analysis_results_resume 
FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE;

ALTER TABLE analysis_results 
ADD CONSTRAINT fk_analysis_results_job 
FOREIGN KEY (job_description_id) REFERENCES job_descriptions(id) ON DELETE CASCADE;

-- Add foreign key constraints for interview_questions table
-- Note: user_id is text (Firebase UID) so no FK needed for users table
ALTER TABLE interview_questions 
ADD CONSTRAINT fk_interview_questions_resume 
FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE;

ALTER TABLE interview_questions 
ADD CONSTRAINT fk_interview_questions_job 
FOREIGN KEY (job_description_id) REFERENCES job_descriptions(id) ON DELETE CASCADE;

-- Add foreign key constraints for skill promotion log
-- Note: skillId already has a reference defined in the schema
-- Add constraint for main_skill_id
ALTER TABLE skill_promotion_log 
ADD CONSTRAINT fk_skill_promotion_log_main_skill 
FOREIGN KEY (main_skill_id) REFERENCES skills(id) ON DELETE CASCADE;

-- Create indexes for foreign key columns to improve query performance
CREATE INDEX IF NOT EXISTS idx_skill_categories_parent_id ON skill_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_skills_category_id ON skills(category_id);
CREATE INDEX IF NOT EXISTS idx_analysis_results_resume_id ON analysis_results(resume_id);
CREATE INDEX IF NOT EXISTS idx_analysis_results_job_id ON analysis_results(job_description_id);
CREATE INDEX IF NOT EXISTS idx_interview_questions_resume_id ON interview_questions(resume_id);
CREATE INDEX IF NOT EXISTS idx_interview_questions_job_id ON interview_questions(job_description_id);
CREATE INDEX IF NOT EXISTS idx_skill_promotion_log_skill_id ON skill_promotion_log(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_promotion_log_main_skill_id ON skill_promotion_log(main_skill_id);

-- Add comments to document the relationships
COMMENT ON CONSTRAINT fk_skill_categories_parent ON skill_categories IS 'Self-referencing hierarchy for skill categories';
COMMENT ON CONSTRAINT fk_skills_category ON skills IS 'Links skills to their categories';
COMMENT ON CONSTRAINT fk_analysis_results_resume ON analysis_results IS 'Links analysis to specific resume';
COMMENT ON CONSTRAINT fk_analysis_results_job ON analysis_results IS 'Links analysis to specific job description';
COMMENT ON CONSTRAINT fk_interview_questions_resume ON interview_questions IS 'Links interview questions to specific resume';
COMMENT ON CONSTRAINT fk_interview_questions_job ON interview_questions IS 'Links interview questions to specific job description';
COMMENT ON CONSTRAINT fk_skill_promotion_log_main_skill ON skill_promotion_log IS 'Links promotion log to main skill entry';