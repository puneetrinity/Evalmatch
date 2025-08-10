-- ============================================================================
-- SKILL MEMORY SYSTEM MIGRATION
-- Version: 005_skill_memory_system
-- Description: Automated learning system for discovering and validating new skills
-- Date: 2025-08-10
-- ============================================================================

-- Record this migration first (for tracking)
INSERT INTO schema_migrations (version, description) 
VALUES ('005_skill_memory_system', 'Create skill memory system tables for automated skill learning')
ON CONFLICT (version) DO NOTHING;

-- Use transaction block for atomicity (rollback on any error)
DO $$
BEGIN
    -- Check PostgreSQL version compatibility
    IF (SELECT current_setting('server_version_num')::int < 100000) THEN
        RAISE EXCEPTION 'PostgreSQL version 10.0+ required for JSONB support';
    END IF;

    -- Create skill_memory table for tracking unrecognized skills
    -- Using JSON instead of JSONB for broader compatibility
    CREATE TABLE IF NOT EXISTS skill_memory (
        id SERIAL PRIMARY KEY,
        skill_text VARCHAR(255) NOT NULL,
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
        
        -- Metadata - Use JSON for maximum compatibility
        category_suggestion VARCHAR(100),
        source_contexts JSON DEFAULT '[]'::json, -- Track where skills were found
        first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Add unique constraint only if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'skill_memory' 
        AND constraint_type = 'UNIQUE' 
        AND constraint_name = 'skill_memory_skill_text_key'
    ) THEN
        ALTER TABLE skill_memory ADD CONSTRAINT skill_memory_skill_text_unique UNIQUE (skill_text);
    END IF;

    -- Create skill_memory_stats table for analytics
    CREATE TABLE IF NOT EXISTS skill_memory_stats (
        id SERIAL PRIMARY KEY,
        date DATE DEFAULT CURRENT_DATE,
        total_skills_discovered INTEGER DEFAULT 0,
        esco_validated_count INTEGER DEFAULT 0,
        auto_approved_count INTEGER DEFAULT 0,
        high_frequency_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Create skill_promotion_log table for tracking auto-approvals
    -- Remove foreign key constraint to skills table (may not exist yet)
    CREATE TABLE IF NOT EXISTS skill_promotion_log (
        id SERIAL PRIMARY KEY,
        skill_id INTEGER, -- Will reference skill_memory(id) but without FK constraint for now
        main_skill_id INTEGER, -- Reference to skills table when promoted (no FK constraint)
        promotion_reason VARCHAR(50) NOT NULL,
        promotion_confidence REAL NOT NULL,
        promotion_data JSON DEFAULT '{}'::json, -- Use JSON for compatibility
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Add foreign key constraint to skill_memory only if skill_memory table was created
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'skill_memory') THEN
        -- Check if constraint already exists before adding
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE table_name = 'skill_promotion_log' 
            AND constraint_type = 'FOREIGN KEY' 
            AND constraint_name LIKE '%skill_id%'
        ) THEN
            ALTER TABLE skill_promotion_log 
            ADD CONSTRAINT fk_skill_promotion_log_skill_id 
            FOREIGN KEY (skill_id) REFERENCES skill_memory(id) ON DELETE CASCADE;
        END IF;
    END IF;

    RAISE NOTICE 'Skill memory system tables created successfully';

EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to create skill memory tables: %', SQLERRM;
END $$;

-- Create performance indexes (outside transaction for better error isolation)
DO $$
BEGIN
    -- Create indexes for skill_memory table
    CREATE INDEX IF NOT EXISTS idx_skill_memory_normalized ON skill_memory(normalized_skill_text);
    CREATE INDEX IF NOT EXISTS idx_skill_memory_frequency ON skill_memory(frequency DESC);
    CREATE INDEX IF NOT EXISTS idx_skill_memory_auto_approved ON skill_memory(auto_approved);
    CREATE INDEX IF NOT EXISTS idx_skill_memory_esco_validated ON skill_memory(esco_validated);
    CREATE INDEX IF NOT EXISTS idx_skill_memory_ml_similarity ON skill_memory(ml_similarity_score DESC);
    CREATE INDEX IF NOT EXISTS idx_skill_memory_groq_confidence ON skill_memory(groq_confidence DESC);
    CREATE INDEX IF NOT EXISTS idx_skill_memory_last_seen ON skill_memory(last_seen DESC);
    
    -- Create unique constraint for daily stats
    CREATE UNIQUE INDEX IF NOT EXISTS idx_skill_memory_stats_date ON skill_memory_stats(date);
    
    -- Create indexes for promotion log
    CREATE INDEX IF NOT EXISTS idx_skill_promotion_log_skill_id ON skill_promotion_log(skill_id);
    CREATE INDEX IF NOT EXISTS idx_skill_promotion_log_created_at ON skill_promotion_log(created_at DESC);

    RAISE NOTICE 'Skill memory system indexes created successfully';

EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Some indexes may not have been created: %', SQLERRM;
        -- Don't fail migration for index creation errors
END $$;

-- Create trigger function and trigger (with error handling)
DO $$
BEGIN
    -- Create or replace the trigger function with better error handling
    CREATE OR REPLACE FUNCTION update_skill_memory_updated_at()
    RETURNS TRIGGER AS $func$
    BEGIN
        -- Ensure NEW record exists
        IF NEW IS NULL THEN
            RETURN OLD;
        END IF;
        
        -- Update timestamp
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;

    -- Drop trigger if it exists (prevent duplicate trigger error)
    DROP TRIGGER IF EXISTS skill_memory_updated_at ON skill_memory;
    
    -- Create trigger with PostgreSQL version compatibility
    IF (SELECT current_setting('server_version_num')::int >= 110000) THEN
        -- PostgreSQL 11+ syntax
        CREATE TRIGGER skill_memory_updated_at 
            BEFORE UPDATE ON skill_memory 
            FOR EACH ROW 
            EXECUTE FUNCTION update_skill_memory_updated_at();
    ELSE
        -- PostgreSQL 10 and earlier syntax
        CREATE TRIGGER skill_memory_updated_at 
            BEFORE UPDATE ON skill_memory 
            FOR EACH ROW 
            EXECUTE PROCEDURE update_skill_memory_updated_at();
    END IF;

    RAISE NOTICE 'Skill memory system triggers created successfully';

EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Trigger creation failed: %', SQLERRM;
        -- Don't fail migration for trigger creation errors
END $$;

-- Insert initial data with error handling
DO $$
BEGIN
    -- Insert initial stats record for today
    INSERT INTO skill_memory_stats (date, total_skills_discovered, esco_validated_count, auto_approved_count, high_frequency_count)
    VALUES (CURRENT_DATE, 0, 0, 0, 0)
    ON CONFLICT (date) DO NOTHING;

    RAISE NOTICE 'Initial skill memory stats record created';

EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Failed to insert initial stats: %', SQLERRM;
        -- Don't fail migration for initial data insertion
END $$;

-- Add table and column comments (optional, won't fail migration)
DO $$
BEGIN
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

    RAISE NOTICE 'Table comments added successfully';

EXCEPTION
    WHEN OTHERS THEN
        -- Comments are optional, don't fail migration
        RAISE WARNING 'Some comments may not have been added: %', SQLERRM;
END $$;