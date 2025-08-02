-- Add missing recommendations column to analysis_results table
-- Migration: 002_add_recommendations_column
-- Date: 2025-08-02

-- Record this migration
INSERT INTO schema_migrations (version, description) 
VALUES ('002_add_recommendations_column', 'Add recommendations column to analysis_results table')
ON CONFLICT (version) DO NOTHING;

-- Add recommendations column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'analysis_results' AND column_name = 'recommendations') THEN
        ALTER TABLE analysis_results ADD COLUMN recommendations JSON DEFAULT '[]'::json;
        
        -- Log the addition
        RAISE NOTICE 'Added recommendations column to analysis_results table';
    ELSE
        RAISE NOTICE 'Recommendations column already exists in analysis_results table';
    END IF;
END $$;

-- Update any existing analysis_results records to have empty recommendations array
UPDATE analysis_results 
SET recommendations = '[]'::json 
WHERE recommendations IS NULL;