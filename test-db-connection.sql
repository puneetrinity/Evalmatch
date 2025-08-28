-- Simple test to verify database connection
SELECT 1 as connection_test, version() as postgres_version, now() as current_time;

-- Check if any tables already exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;