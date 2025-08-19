-- Migration: Add token usage system for Firebase API tokens
-- Date: 2025-08-19
-- Description: Creates tables for user API token limits and usage tracking

-- Create user API limits table
CREATE TABLE IF NOT EXISTS user_api_limits (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE, -- Firebase UID
    tier TEXT NOT NULL DEFAULT 'testing',
    max_calls INTEGER NOT NULL DEFAULT 200,
    used_calls INTEGER NOT NULL DEFAULT 0,
    reset_period TEXT NOT NULL DEFAULT 'monthly', -- 'monthly', 'yearly', 'never'
    last_reset TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_tier CHECK (tier IN ('testing', 'basic', 'premium', 'enterprise')),
    CONSTRAINT valid_reset_period CHECK (reset_period IN ('monthly', 'yearly', 'never')),
    CONSTRAINT non_negative_calls CHECK (used_calls >= 0 AND max_calls >= 0)
);

-- Create API call logs table for detailed tracking
CREATE TABLE IF NOT EXISTS api_call_logs (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL, -- Firebase UID
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL,
    status_code INTEGER,
    processing_time INTEGER, -- milliseconds
    request_size INTEGER, -- bytes
    response_size INTEGER, -- bytes
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- Indexing for performance
    INDEX idx_api_calls_user_date (user_id, created_at),
    INDEX idx_api_calls_endpoint (endpoint),
    INDEX idx_api_calls_status (status_code)
);

-- Create user tokens table for tracking generated tokens
CREATE TABLE IF NOT EXISTS user_tokens (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL, -- Firebase UID
    token_id TEXT NOT NULL UNIQUE, -- Generated token identifier
    token_name TEXT, -- User-provided token name
    expires_at TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    last_used_at TIMESTAMP,
    total_requests INTEGER DEFAULT 0,
    
    -- Foreign key to user_api_limits
    CONSTRAINT fk_user_tokens_user_id 
        FOREIGN KEY (user_id) REFERENCES user_api_limits(user_id) 
        ON DELETE CASCADE,
    
    -- Indexing
    INDEX idx_user_tokens_user_id (user_id),
    INDEX idx_user_tokens_token_id (token_id),
    INDEX idx_user_tokens_active (is_active)
);

-- Create usage statistics table for analytics
CREATE TABLE IF NOT EXISTS usage_statistics (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    total_users INTEGER DEFAULT 0,
    total_api_calls INTEGER DEFAULT 0,
    unique_active_users INTEGER DEFAULT 0,
    average_calls_per_user DECIMAL(10,2) DEFAULT 0,
    tier_distribution JSON DEFAULT '{}', -- {"testing": 100, "basic": 50, etc}
    top_endpoints JSON DEFAULT '[]', -- [{"endpoint": "/analyze", "count": 1000}, ...]
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- Unique constraint on date
    UNIQUE (date)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_api_limits_user_id ON user_api_limits(user_id);
CREATE INDEX IF NOT EXISTS idx_user_api_limits_tier ON user_api_limits(tier);
CREATE INDEX IF NOT EXISTS idx_api_call_logs_created_at ON api_call_logs(created_at);

-- Add trigger to update updated_at on user_api_limits
CREATE OR REPLACE FUNCTION update_user_api_limits_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_user_api_limits_updated_at
    BEFORE UPDATE ON user_api_limits
    FOR EACH ROW
    EXECUTE FUNCTION update_user_api_limits_updated_at();

-- Add function to reset usage based on reset_period
CREATE OR REPLACE FUNCTION reset_user_usage_if_needed()
RETURNS VOID AS $$
DECLARE
    user_record RECORD;
    should_reset BOOLEAN;
BEGIN
    FOR user_record IN 
        SELECT * FROM user_api_limits 
        WHERE reset_period != 'never'
    LOOP
        should_reset := false;
        
        -- Check if reset is needed based on period
        IF user_record.reset_period = 'monthly' THEN
            should_reset := (
                EXTRACT(MONTH FROM user_record.last_reset) != EXTRACT(MONTH FROM NOW()) OR
                EXTRACT(YEAR FROM user_record.last_reset) != EXTRACT(YEAR FROM NOW())
            );
        ELSIF user_record.reset_period = 'yearly' THEN
            should_reset := EXTRACT(YEAR FROM user_record.last_reset) != EXTRACT(YEAR FROM NOW());
        END IF;
        
        -- Reset if needed
        IF should_reset THEN
            UPDATE user_api_limits 
            SET used_calls = 0, last_reset = NOW() 
            WHERE id = user_record.id;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Record this migration
INSERT INTO schema_migrations (version, description) 
VALUES ('011_token_usage_system', 'Add token usage system for Firebase API tokens')
ON CONFLICT (version) DO NOTHING;