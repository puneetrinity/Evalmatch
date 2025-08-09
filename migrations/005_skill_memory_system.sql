-- Skill Memory System Migration
-- Automated learning system for discovering and validating new skills

-- Create skill_memory table for tracking unrecognized skills
CREATE TABLE IF NOT EXISTS skill_memory (
  id SERIAL PRIMARY KEY,
  skill_text VARCHAR(255) NOT NULL UNIQUE,
  normalized_skill_text VARCHAR(255) NOT NULL,
  frequency INTEGER DEFAULT 1,
  
  -- Validation layers
  esco_validated BOOLEAN DEFAULT FALSE,
  esco_id VARCHAR(100),
  esco_category VARCHAR(100),
  
  groq_confidence REAL DEFAULT 0,
  groq_category VARCHAR(100),
  
  ml_similarity_score REAL DEFAULT 0,
  ml_similar_to VARCHAR(255), -- Most similar existing skill
  ml_category VARCHAR(100),
  
  -- Auto-approval tracking
  auto_approved BOOLEAN DEFAULT FALSE,
  auto_approval_reason VARCHAR(50), -- 'esco', 'ml_similar', 'frequency_groq', 'domain_pattern'
  auto_approval_confidence REAL DEFAULT 0,
  
  -- Metadata
  category_suggestion VARCHAR(100),
  source_contexts JSONB DEFAULT '[]'::jsonb, -- Track where skills were found
  first_seen TIMESTAMP DEFAULT NOW(),
  last_seen TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_skill_memory_normalized ON skill_memory(normalized_skill_text);
CREATE INDEX IF NOT EXISTS idx_skill_memory_frequency ON skill_memory(frequency DESC);
CREATE INDEX IF NOT EXISTS idx_skill_memory_auto_approved ON skill_memory(auto_approved);
CREATE INDEX IF NOT EXISTS idx_skill_memory_esco_validated ON skill_memory(esco_validated);
CREATE INDEX IF NOT EXISTS idx_skill_memory_ml_similarity ON skill_memory(ml_similarity_score DESC);
CREATE INDEX IF NOT EXISTS idx_skill_memory_groq_confidence ON skill_memory(groq_confidence DESC);
CREATE INDEX IF NOT EXISTS idx_skill_memory_last_seen ON skill_memory(last_seen DESC);

-- Create skill_memory_stats table for analytics
CREATE TABLE IF NOT EXISTS skill_memory_stats (
  id SERIAL PRIMARY KEY,
  date DATE DEFAULT CURRENT_DATE,
  total_skills_discovered INTEGER DEFAULT 0,
  esco_validated_count INTEGER DEFAULT 0,
  auto_approved_count INTEGER DEFAULT 0,
  high_frequency_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create unique constraint for daily stats
CREATE UNIQUE INDEX IF NOT EXISTS idx_skill_memory_stats_date ON skill_memory_stats(date);

-- Create skill_promotion_log table for tracking auto-approvals
CREATE TABLE IF NOT EXISTS skill_promotion_log (
  id SERIAL PRIMARY KEY,
  skill_id INTEGER REFERENCES skill_memory(id),
  main_skill_id INTEGER, -- Reference to skills table when promoted
  promotion_reason VARCHAR(50) NOT NULL,
  promotion_confidence REAL NOT NULL,
  promotion_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for promotion log
CREATE INDEX IF NOT EXISTS idx_skill_promotion_log_skill_id ON skill_promotion_log(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_promotion_log_created_at ON skill_promotion_log(created_at DESC);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_skill_memory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER skill_memory_updated_at 
  BEFORE UPDATE ON skill_memory 
  FOR EACH ROW 
  EXECUTE FUNCTION update_skill_memory_updated_at();

-- Insert initial stats record for today
INSERT INTO skill_memory_stats (date, total_skills_discovered, esco_validated_count, auto_approved_count, high_frequency_count)
VALUES (CURRENT_DATE, 0, 0, 0, 0)
ON CONFLICT (date) DO NOTHING;

-- Add comments for documentation
COMMENT ON TABLE skill_memory IS 'Tracks discovered skills that are not in the main dictionary for automated learning';
COMMENT ON COLUMN skill_memory.frequency IS 'Number of times this skill has been encountered';
COMMENT ON COLUMN skill_memory.esco_validated IS 'Whether ESCO API recognizes this skill';
COMMENT ON COLUMN skill_memory.groq_confidence IS 'Groq LLM confidence that this is a valid skill (0-1)';
COMMENT ON COLUMN skill_memory.ml_similarity_score IS 'Highest similarity score to existing skills via ML model';
COMMENT ON COLUMN skill_memory.auto_approved IS 'Whether this skill has been automatically approved for main dictionary';
COMMENT ON COLUMN skill_memory.source_contexts IS 'JSON array of contexts where this skill was found (resume/job_description)';

COMMENT ON TABLE skill_memory_stats IS 'Daily statistics for skill discovery and auto-approval rates';
COMMENT ON TABLE skill_promotion_log IS 'Audit log of skills automatically promoted to main dictionary';