-- Migration: Add missing analysis column to analysis_results table
-- Date: 2025-08-08
-- Description: Adds the analysis JSON column that stores comprehensive analysis data

-- Add analysis column to analysis_results table
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'analysis_results' AND column_name = 'analysis') THEN
        ALTER TABLE analysis_results ADD COLUMN analysis JSON NOT NULL DEFAULT '{}'::json;
    END IF;
END $$;

-- Record this migration
INSERT INTO schema_migrations (version, description) 
VALUES ('004_add_analysis_column', 'Add missing analysis column to analysis_results table')
ON CONFLICT (version) DO NOTHING;