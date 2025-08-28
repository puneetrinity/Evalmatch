-- Add batch_id column to resumes table for batch-based analysis
-- Migration: 002_add_batch_id.sql

-- Add batch_id column to resumes table
ALTER TABLE resumes 
ADD COLUMN IF NOT EXISTS batch_id TEXT;

-- Create index on batch_id for faster filtering
CREATE INDEX IF NOT EXISTS idx_resumes_batch_id ON resumes(batch_id);

-- Create composite index for efficient batch + user filtering
CREATE INDEX IF NOT EXISTS idx_resumes_user_batch ON resumes(user_id, batch_id);

-- Create composite index for efficient session + batch filtering  
CREATE INDEX IF NOT EXISTS idx_resumes_session_batch ON resumes(session_id, batch_id);