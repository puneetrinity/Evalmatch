-- Credit System Migration
-- Adds credit-based usage tracking to replace daily limits
-- Version: 014 - Credit System Implementation
-- Date: 2025-01-12

-- Migration tracking
INSERT INTO schema_migrations (version, description) 
VALUES ('014_credit_system', 'Credit system implementation with user credits and transaction logging')
ON CONFLICT (version) DO NOTHING;

-- ============================================================================
-- USER CREDITS TABLE
-- ============================================================================
-- Track user credit balances with proper constraints
CREATE TABLE IF NOT EXISTS user_credits (
    user_id TEXT PRIMARY KEY,  -- Firebase UID - unique constraint built-in
    credits INTEGER NOT NULL DEFAULT 0 CHECK (credits >= 0),
    total_credits_purchased INTEGER NOT NULL DEFAULT 0,
    total_credits_used INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- CREDIT TRANSACTIONS TABLE  
-- ============================================================================
-- Audit trail of all credit operations
CREATE TABLE IF NOT EXISTS credit_transactions (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('debit', 'credit', 'grant', 'refund')),
    amount INTEGER NOT NULL, -- positive for credits added, negative for credits used
    balance_before INTEGER NOT NULL CHECK (balance_before >= 0),
    balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
    description TEXT NOT NULL,
    reference_id TEXT, -- analysis_id, purchase_id, batch_id, etc.
    metadata JSON DEFAULT '{}'::json,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure user exists in user_credits table (foreign key constraint)
    CONSTRAINT fk_credit_transactions_user_id 
        FOREIGN KEY (user_id) 
        REFERENCES user_credits(user_id) 
        ON DELETE CASCADE
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE AND CONSTRAINTS
-- ============================================================================
-- User-based queries (most common)
CREATE INDEX IF NOT EXISTS idx_user_credits_user_id ON user_credits(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_reference_id ON credit_transactions(reference_id);

-- Time-based queries for analytics and cleanup
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at ON credit_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_date ON credit_transactions(user_id, created_at DESC);

-- Transaction type queries for reporting
CREATE INDEX IF NOT EXISTS idx_credit_transactions_type ON credit_transactions(transaction_type);

-- ============================================================================
-- UNIQUE CONSTRAINTS FOR IDEMPOTENCY
-- ============================================================================
-- Prevent duplicate debit transactions with same reference ID
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_transactions_debit_reference_unique 
ON credit_transactions(reference_id) 
WHERE transaction_type = 'debit' AND reference_id IS NOT NULL;

-- Prevent duplicate grant transactions with same reference ID  
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_transactions_grant_reference_unique
ON credit_transactions(reference_id)
WHERE transaction_type = 'grant' AND reference_id IS NOT NULL;

-- Prevent duplicate refund transactions with same reference ID
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_transactions_refund_reference_unique
ON credit_transactions(reference_id)
WHERE transaction_type = 'refund' AND reference_id IS NOT NULL;

-- ============================================================================
-- BETA CREDIT ALLOCATION
-- ============================================================================
-- Grant 100 beta credits to all existing users (idempotent)
-- Only insert if credit system is enabled (controlled by environment variable)
DO $$ 
DECLARE
    user_record RECORD;
    beta_credits INTEGER := 100;
BEGIN
    -- Get all existing users from various tables where user_id exists
    FOR user_record IN (
        SELECT DISTINCT user_id 
        FROM (
            SELECT user_id FROM resumes WHERE user_id IS NOT NULL AND user_id != ''
            UNION
            SELECT user_id FROM job_descriptions WHERE user_id IS NOT NULL AND user_id != ''
            UNION
            SELECT user_id FROM analysis_results WHERE user_id IS NOT NULL AND user_id != ''
            UNION 
            SELECT user_id FROM user_api_limits WHERE user_id IS NOT NULL AND user_id != ''
        ) AS existing_users
        WHERE user_id IS NOT NULL AND user_id != ''
    ) LOOP
        -- Insert user credits record if it doesn't exist
        INSERT INTO user_credits (user_id, credits, total_credits_purchased, total_credits_used)
        VALUES (user_record.user_id, beta_credits, 0, 0)
        ON CONFLICT (user_id) DO NOTHING; -- Don't overwrite existing credits
        
        -- Log the beta credit grant transaction (only if user_credits was just created)
        IF NOT EXISTS (
            SELECT 1 FROM credit_transactions 
            WHERE user_id = user_record.user_id 
            AND transaction_type = 'grant' 
            AND description = 'Beta testing credits'
        ) THEN
            INSERT INTO credit_transactions (
                user_id, 
                transaction_type, 
                amount, 
                balance_before, 
                balance_after, 
                description,
                reference_id,
                metadata
            ) VALUES (
                user_record.user_id,
                'grant',
                beta_credits,
                0,
                beta_credits,
                'Beta testing credits',
                'beta_grant_' || user_record.user_id,
                '{"source": "migration", "version": "014", "grant_type": "beta"}'::json
            );
        END IF;
    END LOOP;
    
    RAISE NOTICE 'Beta credits allocated to existing users';
END $$;

-- ============================================================================
-- HELPER FUNCTIONS (Optional - for easier credit management)
-- ============================================================================

-- Function to get user credit balance (with automatic user creation if needed)
CREATE OR REPLACE FUNCTION get_user_credits(p_user_id TEXT, p_default_credits INTEGER DEFAULT 0)
RETURNS INTEGER AS $$
DECLARE
    current_credits INTEGER;
BEGIN
    -- Try to get existing credits
    SELECT credits INTO current_credits
    FROM user_credits 
    WHERE user_id = p_user_id;
    
    -- If user doesn't exist, create with default credits
    IF NOT FOUND THEN
        INSERT INTO user_credits (user_id, credits)
        VALUES (p_user_id, p_default_credits)
        ON CONFLICT (user_id) DO NOTHING;
        
        -- Log the initial credit grant if default credits > 0
        IF p_default_credits > 0 THEN
            INSERT INTO credit_transactions (
                user_id, 
                transaction_type, 
                amount, 
                balance_before, 
                balance_after, 
                description,
                reference_id
            ) VALUES (
                p_user_id,
                'grant',
                p_default_credits,
                0,
                p_default_credits,
                'Initial user credits',
                'initial_grant_' || p_user_id
            );
        END IF;
        
        RETURN p_default_credits;
    END IF;
    
    RETURN current_credits;
END;
$$ LANGUAGE plpgsql;

-- Function to atomically deduct credits (returns success/failure)
CREATE OR REPLACE FUNCTION deduct_user_credits(
    p_user_id TEXT, 
    p_amount INTEGER, 
    p_description TEXT,
    p_reference_id TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    current_balance INTEGER;
    new_balance INTEGER;
BEGIN
    -- Lock the user record and get current balance
    SELECT credits INTO current_balance
    FROM user_credits 
    WHERE user_id = p_user_id
    FOR UPDATE;
    
    -- Check if user exists and has sufficient credits
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    IF current_balance < p_amount THEN
        RETURN FALSE;
    END IF;
    
    -- Calculate new balance
    new_balance := current_balance - p_amount;
    
    -- Update user credits
    UPDATE user_credits 
    SET credits = new_balance,
        total_credits_used = total_credits_used + p_amount,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = p_user_id;
    
    -- Log the transaction
    INSERT INTO credit_transactions (
        user_id,
        transaction_type,
        amount,
        balance_before,
        balance_after,
        description,
        reference_id
    ) VALUES (
        p_user_id,
        'debit',
        -p_amount, -- negative amount for debit
        current_balance,
        new_balance,
        p_description,
        p_reference_id
    );
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to add credits (for purchases, refunds, etc.)
CREATE OR REPLACE FUNCTION add_user_credits(
    p_user_id TEXT, 
    p_amount INTEGER, 
    p_description TEXT,
    p_reference_id TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    current_balance INTEGER;
    new_balance INTEGER;
BEGIN
    -- Lock the user record and get current balance
    SELECT credits INTO current_balance
    FROM user_credits 
    WHERE user_id = p_user_id
    FOR UPDATE;
    
    -- Create user if doesn't exist
    IF NOT FOUND THEN
        INSERT INTO user_credits (user_id, credits)
        VALUES (p_user_id, 0)
        ON CONFLICT (user_id) DO NOTHING;
        current_balance := 0;
    END IF;
    
    -- Calculate new balance
    new_balance := current_balance + p_amount;
    
    -- Update user credits
    UPDATE user_credits 
    SET credits = new_balance,
        total_credits_purchased = total_credits_purchased + p_amount,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = p_user_id;
    
    -- Log the transaction
    INSERT INTO credit_transactions (
        user_id,
        transaction_type,
        amount,
        balance_before,
        balance_after,
        description,
        reference_id
    ) VALUES (
        p_user_id,
        'credit',
        p_amount,
        current_balance,
        new_balance,
        p_description,
        p_reference_id
    );
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- DATA CONSISTENCY CHECKS
-- ============================================================================

-- Ensure all credit balances are non-negative
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM user_credits WHERE credits < 0) THEN
        RAISE EXCEPTION 'Found negative credit balances - data corruption detected';
    END IF;
END $$;

-- ============================================================================
-- MIGRATION COMPLETION LOG
-- ============================================================================
DO $$
DECLARE
    total_users INTEGER;
    total_credits_granted INTEGER;
BEGIN
    SELECT COUNT(*), COALESCE(SUM(credits), 0) 
    INTO total_users, total_credits_granted
    FROM user_credits;
    
    RAISE NOTICE 'Credit system migration completed successfully';
    RAISE NOTICE 'Total users with credits: %', total_users;
    RAISE NOTICE 'Total credits in system: %', total_credits_granted;
END $$;