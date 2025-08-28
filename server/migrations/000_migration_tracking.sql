-- Enhanced features migration
-- This migration ensures the core database schema is in place
-- Note: Extensions are typically pre-installed on Railway PostgreSQL

-- Create migration tracking table if it doesn't exist
CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    version VARCHAR(50) UNIQUE NOT NULL,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    description TEXT
);

-- Record this migration as applied
INSERT INTO schema_migrations (version, description) 
VALUES ('0001_add_enhanced_features', 'Enhanced features migration setup')
ON CONFLICT (version) DO NOTHING;