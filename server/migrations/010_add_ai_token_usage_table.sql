-- Migration: Add AI Token Usage Tracking Table
-- Description: Create table to track token consumption across AI providers (OpenAI, Anthropic, Groq)
-- Author: AI Token Tracking System
-- Date: 2024

-- Create AI token usage logs table
CREATE TABLE IF NOT EXISTS ai_token_usage_logs (
    id SERIAL PRIMARY KEY,
    user_id TEXT NULL, -- Firebase UID, nullable for system calls
    provider VARCHAR(20) NOT NULL CHECK (provider IN ('openai', 'anthropic', 'groq')),
    model VARCHAR(100) NOT NULL,
    operation VARCHAR(50) NOT NULL CHECK (operation IN (
        'resume_analysis', 
        'job_analysis', 
        'match_analysis', 
        'bias_analysis', 
        'interview_questions', 
        'interview_script'
    )),
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    estimated_cost REAL NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    analysis_id TEXT NULL, -- Optional link to specific analysis
    request_id TEXT NULL, -- For correlating with API call logs
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_ai_token_usage_logs_user_id ON ai_token_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_token_usage_logs_provider ON ai_token_usage_logs(provider);
CREATE INDEX IF NOT EXISTS idx_ai_token_usage_logs_operation ON ai_token_usage_logs(operation);
CREATE INDEX IF NOT EXISTS idx_ai_token_usage_logs_created_at ON ai_token_usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_token_usage_logs_user_date ON ai_token_usage_logs(user_id, created_at);

-- Add foreign key reference to user_api_limits if user_id is present
-- Note: This is a soft foreign key since user_id can be NULL for system operations

-- Create a view for easy aggregation queries
CREATE OR REPLACE VIEW ai_token_usage_summary AS
SELECT 
    provider,
    operation,
    COUNT(*) as call_count,
    SUM(input_tokens) as total_input_tokens,
    SUM(output_tokens) as total_output_tokens,
    SUM(total_tokens) as total_tokens,
    SUM(estimated_cost) as total_cost,
    AVG(input_tokens) as avg_input_tokens,
    AVG(output_tokens) as avg_output_tokens,
    AVG(total_tokens) as avg_total_tokens,
    AVG(estimated_cost) as avg_cost,
    DATE(created_at) as usage_date
FROM ai_token_usage_logs
GROUP BY provider, operation, DATE(created_at)
ORDER BY usage_date DESC, provider, operation;

-- Create a view for user-specific usage
CREATE OR REPLACE VIEW user_ai_token_usage AS
SELECT 
    user_id,
    provider,
    operation,
    COUNT(*) as call_count,
    SUM(input_tokens) as total_input_tokens,
    SUM(output_tokens) as total_output_tokens,
    SUM(total_tokens) as total_tokens,
    SUM(estimated_cost) as total_cost,
    DATE(created_at) as usage_date
FROM ai_token_usage_logs
WHERE user_id IS NOT NULL
GROUP BY user_id, provider, operation, DATE(created_at)
ORDER BY usage_date DESC, user_id, provider, operation;

-- Insert a test record to verify the table structure
INSERT INTO ai_token_usage_logs (
    user_id, provider, model, operation, 
    input_tokens, output_tokens, total_tokens, 
    estimated_cost, currency, request_id
) VALUES (
    'test-user-migration', 'openai', 'gpt-4o', 'resume_analysis', 
    100, 50, 150, 0.002, 'USD', 'migration-test-' || EXTRACT(EPOCH FROM NOW())
);

-- Clean up test record
DELETE FROM ai_token_usage_logs WHERE user_id = 'test-user-migration';