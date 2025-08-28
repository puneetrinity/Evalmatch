-- Fix analysis_results table - Add missing columns from schema.ts
-- This migration adds all the missing columns that are causing database errors

-- Add missing columns to analysis_results table
DO $$ 
BEGIN
    -- Add processing_time column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'analysis_results' AND column_name = 'processing_time') THEN
        ALTER TABLE analysis_results ADD COLUMN processing_time INTEGER;
        RAISE NOTICE 'Added processing_time column to analysis_results';
    END IF;
    
    -- Add ai_provider column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'analysis_results' AND column_name = 'ai_provider') THEN
        ALTER TABLE analysis_results ADD COLUMN ai_provider VARCHAR(50);
        RAISE NOTICE 'Added ai_provider column to analysis_results';
    END IF;
    
    -- Add model_version column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'analysis_results' AND column_name = 'model_version') THEN
        ALTER TABLE analysis_results ADD COLUMN model_version VARCHAR(50);
        RAISE NOTICE 'Added model_version column to analysis_results';
    END IF;
    
    -- Add processing_flags column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'analysis_results' AND column_name = 'processing_flags') THEN
        ALTER TABLE analysis_results ADD COLUMN processing_flags JSON;
        RAISE NOTICE 'Added processing_flags column to analysis_results';
    END IF;
    
    -- Add recommendations column if it doesn't exist (this was missing from the original schema)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'analysis_results' AND column_name = 'recommendations') THEN
        ALTER TABLE analysis_results ADD COLUMN recommendations JSON DEFAULT '[]'::json;
        RAISE NOTICE 'Added recommendations column to analysis_results';
    END IF;
    
    RAISE NOTICE 'Analysis results schema fix completed successfully';
END $$;