-- Migration for enhanced features: vector embeddings, skill hierarchy, and ML scoring

-- Add embedding columns to resumes table
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS embedding JSONB;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS skills_embedding JSONB;

-- Add embedding columns to job_descriptions table  
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS embedding JSONB;
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS requirements_embedding JSONB;

-- Create skill categories table
CREATE TABLE IF NOT EXISTS skill_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  parent_id INTEGER,
  level INTEGER DEFAULT 0,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create enhanced skills table
CREATE TABLE IF NOT EXISTS skills (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  normalized_name VARCHAR(255) NOT NULL,
  category_id INTEGER,
  aliases JSONB,
  embedding JSONB,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (category_id) REFERENCES skill_categories(id)
);

-- Add enhanced scoring columns to analysis_results table
ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS semantic_similarity REAL;
ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS skills_similarity REAL;
ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS experience_similarity REAL;
ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS education_similarity REAL;
ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS ml_confidence_score REAL;
ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS scoring_dimensions JSONB;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_skills_normalized_name ON skills(normalized_name);
CREATE INDEX IF NOT EXISTS idx_skills_category_id ON skills(category_id);
CREATE INDEX IF NOT EXISTS idx_skill_categories_parent_id ON skill_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_analysis_results_semantic_similarity ON analysis_results(semantic_similarity);
CREATE INDEX IF NOT EXISTS idx_analysis_results_ml_confidence ON analysis_results(ml_confidence_score);