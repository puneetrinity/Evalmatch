-- ============================================================================
-- MIGRATION 012: MIGRATION SYSTEM CONSOLIDATION & SAFETY IMPROVEMENTS
-- Critical fix for hybrid migration system issues identified in risk analysis
-- ============================================================================

-- Record this migration
INSERT INTO schema_migrations (version, description) 
VALUES ('012_migration_system_consolidation', 'Consolidate migration system and add safety measures for Railway deployments')
ON CONFLICT (version) DO NOTHING;

-- ============================================================================
-- STEP 1: CREATE MIGRATION SAFETY MECHANISMS
-- ============================================================================

-- Create migration locks table to prevent concurrent migrations
CREATE TABLE IF NOT EXISTS migration_locks (
    id serial PRIMARY KEY,
    lock_name varchar(100) UNIQUE NOT NULL,
    locked_by varchar(100) NOT NULL,
    locked_at timestamp DEFAULT now(),
    expires_at timestamp NOT NULL,
    environment varchar(50) DEFAULT 'unknown',
    CONSTRAINT check_expires_future CHECK (expires_at > locked_at)
);

-- Create migration execution log for audit trail
CREATE TABLE IF NOT EXISTS migration_execution_log (
    id serial PRIMARY KEY,
    migration_version varchar(100) NOT NULL,
    execution_start timestamp DEFAULT now(),
    execution_end timestamp,
    status varchar(20) DEFAULT 'running', -- 'running', 'completed', 'failed', 'rolled_back'
    error_message text,
    environment varchar(50),
    executed_by varchar(100) DEFAULT 'system',
    rollback_available boolean DEFAULT false,
    backup_ref varchar(255), -- Reference to backup if created
    performance_metrics json -- Execution time, affected rows, etc.
);

-- ============================================================================
-- STEP 2: VALIDATE CURRENT MIGRATION STATE
-- ============================================================================

DO $$
DECLARE
    missing_constraints TEXT[] := '{}';
    constraint_count INTEGER;
    table_exists BOOLEAN;
BEGIN
    RAISE NOTICE 'Starting migration state validation...';
    
    -- Check for missing foreign key constraints that should exist
    -- This addresses the issues found in migration 007
    
    -- 1. Check skill_categories self-reference
    SELECT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'skill_categories' 
        AND constraint_type = 'FOREIGN KEY'
        AND constraint_name LIKE '%parent%'
    ) INTO table_exists;
    
    IF NOT table_exists THEN
        missing_constraints := array_append(missing_constraints, 'skill_categories.parent_id');
    END IF;
    
    -- 2. Check skills.category_id constraint
    SELECT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'skills' 
        AND constraint_type = 'FOREIGN KEY'
        AND constraint_name LIKE '%category%'
    ) INTO table_exists;
    
    IF NOT table_exists THEN
        missing_constraints := array_append(missing_constraints, 'skills.category_id');
    END IF;
    
    -- 3. Check analysis_results constraints
    SELECT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'analysis_results' 
        AND constraint_type = 'FOREIGN KEY'
        AND constraint_name LIKE '%resume%'
    ) INTO table_exists;
    
    IF NOT table_exists THEN
        missing_constraints := array_append(missing_constraints, 'analysis_results.resume_id');
    END IF;
    
    -- Log validation results
    IF array_length(missing_constraints, 1) > 0 THEN
        RAISE NOTICE 'Missing constraints detected: %', array_to_string(missing_constraints, ', ');
        
        INSERT INTO migration_execution_log (
            migration_version, status, error_message, environment
        ) VALUES (
            '012_validation', 'completed', 
            'Missing constraints: ' || array_to_string(missing_constraints, ', '),
            COALESCE(current_setting('app.environment', true), 'unknown')
        );
    ELSE
        RAISE NOTICE 'All expected constraints are present';
    END IF;
    
    -- Count total foreign key constraints for monitoring
    SELECT COUNT(*) INTO constraint_count
    FROM information_schema.table_constraints 
    WHERE constraint_type = 'FOREIGN KEY'
        AND table_schema = 'public';
    
    RAISE NOTICE 'Total foreign key constraints: %', constraint_count;
END $$;

-- ============================================================================
-- STEP 3: ADD RAILWAY-SPECIFIC OPTIMIZATIONS
-- ============================================================================

-- Create function to acquire migration lock (prevents concurrent migrations)
CREATE OR REPLACE FUNCTION acquire_migration_lock(
    lock_name_param varchar(100),
    locked_by_param varchar(100) DEFAULT 'migration',
    timeout_minutes integer DEFAULT 30
) RETURNS boolean AS $$
DECLARE
    lock_acquired boolean := false;
    current_env varchar(50);
BEGIN
    -- Get current environment (Railway sets this)
    current_env := COALESCE(
        current_setting('app.environment', true),
        CASE 
            WHEN current_setting('PORT', true) IS NOT NULL THEN 'railway'
            ELSE 'local'
        END
    );
    
    -- Clean up expired locks first
    DELETE FROM migration_locks 
    WHERE expires_at < now();
    
    -- Try to acquire lock
    BEGIN
        INSERT INTO migration_locks (
            lock_name, locked_by, expires_at, environment
        ) VALUES (
            lock_name_param, 
            locked_by_param, 
            now() + (timeout_minutes || ' minutes')::interval,
            current_env
        );
        lock_acquired := true;
        RAISE NOTICE 'Migration lock "%" acquired by % in % environment', 
            lock_name_param, locked_by_param, current_env;
    EXCEPTION
        WHEN unique_violation THEN
            RAISE NOTICE 'Migration lock "%" is already held', lock_name_param;
            lock_acquired := false;
    END;
    
    RETURN lock_acquired;
END;
$$ LANGUAGE plpgsql;

-- Create function to release migration lock
CREATE OR REPLACE FUNCTION release_migration_lock(
    lock_name_param varchar(100),
    locked_by_param varchar(100) DEFAULT 'migration'
) RETURNS boolean AS $$
DECLARE
    rows_deleted integer;
BEGIN
    DELETE FROM migration_locks 
    WHERE lock_name = lock_name_param 
        AND locked_by = locked_by_param;
    
    GET DIAGNOSTICS rows_deleted = ROW_COUNT;
    
    IF rows_deleted > 0 THEN
        RAISE NOTICE 'Migration lock "%" released by %', lock_name_param, locked_by_param;
        RETURN true;
    ELSE
        RAISE NOTICE 'Migration lock "%" was not held by %', lock_name_param, locked_by_param;
        RETURN false;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 4: CREATE MIGRATION HEALTH CHECK FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION check_migration_health() 
RETURNS TABLE(
    check_name text,
    status text,
    details text
) AS $$
BEGIN
    -- Check 1: Schema migrations table exists and has entries
    RETURN QUERY
    SELECT 
        'schema_migrations_table'::text,
        CASE 
            WHEN EXISTS (SELECT 1 FROM schema_migrations) THEN 'OK'
            ELSE 'ERROR'
        END::text,
        COALESCE('Count: ' || (SELECT COUNT(*) FROM schema_migrations)::text, 'Table missing')::text;
    
    -- Check 2: No conflicting migration versions
    RETURN QUERY
    SELECT 
        'migration_version_conflicts'::text,
        CASE 
            WHEN COUNT(*) = 0 THEN 'OK'
            ELSE 'WARNING'
        END::text,
        CASE 
            WHEN COUNT(*) = 0 THEN 'No conflicts detected'
            ELSE 'Found ' || COUNT(*)::text || ' potential conflicts'
        END::text
    FROM (
        SELECT version, COUNT(*) 
        FROM schema_migrations 
        GROUP BY version 
        HAVING COUNT(*) > 1
    ) conflicts;
    
    -- Check 3: Essential constraints exist
    RETURN QUERY
    SELECT 
        'foreign_key_constraints'::text,
        CASE 
            WHEN COUNT(*) >= 5 THEN 'OK'  -- Expect at least 5 FK constraints
            ELSE 'WARNING'
        END::text,
        'Found ' || COUNT(*)::text || ' foreign key constraints'::text
    FROM information_schema.table_constraints 
    WHERE constraint_type = 'FOREIGN KEY' 
        AND table_schema = 'public';
    
    -- Check 4: No active migration locks (indicating stuck migrations)
    RETURN QUERY
    SELECT 
        'active_migration_locks'::text,
        CASE 
            WHEN COUNT(*) = 0 THEN 'OK'
            ELSE 'WARNING'
        END::text,
        CASE 
            WHEN COUNT(*) = 0 THEN 'No active locks'
            ELSE COUNT(*)::text || ' active locks found'
        END::text
    FROM migration_locks 
    WHERE expires_at > now();
    
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 5: ADD MONITORING AND ALERTING
-- ============================================================================

-- Create view for migration monitoring
CREATE OR REPLACE VIEW migration_status_view AS
SELECT 
    sm.version,
    sm.description,
    sm.applied_at,
    mel.status as execution_status,
    mel.execution_start,
    mel.execution_end,
    mel.error_message,
    EXTRACT(EPOCH FROM (COALESCE(mel.execution_end, now()) - mel.execution_start)) as execution_seconds
FROM schema_migrations sm
LEFT JOIN migration_execution_log mel ON sm.version = mel.migration_version
ORDER BY sm.applied_at DESC;

-- ============================================================================
-- STEP 6: COMMIT THIS MIGRATION TO LOG
-- ============================================================================

DO $$
BEGIN
    INSERT INTO migration_execution_log (
        migration_version, 
        status, 
        environment,
        performance_metrics
    ) VALUES (
        '012_migration_system_consolidation',
        'completed',
        COALESCE(current_setting('app.environment', true), 'unknown'),
        jsonb_build_object(
            'execution_start', now(),
            'safety_features_added', true,
            'railway_optimized', true,
            'health_check_available', true
        )
    );
    
    RAISE NOTICE '=== MIGRATION 012 COMPLETED SUCCESSFULLY ===';
    RAISE NOTICE 'Migration system safety features have been added:';
    RAISE NOTICE '- Migration locks to prevent concurrent execution';
    RAISE NOTICE '- Execution logging for audit trails';
    RAISE NOTICE '- Health check functions for monitoring';
    RAISE NOTICE '- Railway-specific optimizations';
    RAISE NOTICE 'Use SELECT * FROM check_migration_health() to verify system health';
    
END $$;