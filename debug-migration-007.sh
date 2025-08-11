#!/bin/bash

# ============================================================================
# DEBUG SCRIPT FOR MIGRATION 007 FAILURE
# Database Expert Diagnostic Tool
# ============================================================================

echo "🔍 Database Migration 007 Debug Script"
echo "======================================"
echo "Date: $(date)"
echo "Environment: ${NODE_ENV:-development}"
echo ""

# Check if DATABASE_URL is available
if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL environment variable is not set"
    echo "   This is likely the root cause of 'Database connection failed in production environment'"
    echo ""
    echo "   To fix this:"
    echo "   1. Set DATABASE_URL in your Railway environment variables"
    echo "   2. Ensure the PostgreSQL service is running and accessible"
    echo "   3. Verify the connection string format: postgresql://user:password@host:port/database"
    echo ""
    exit 1
else
    echo "✅ DATABASE_URL is configured"
    echo "   Length: ${#DATABASE_URL} characters"
    echo "   Starts with: $(echo $DATABASE_URL | cut -c1-20)..."
    echo ""
fi

# Check if we can connect to the database
echo "🔗 Testing database connectivity..."

# Try using psql if available
if command -v psql >/dev/null 2>&1; then
    echo "   Using psql to test connection..."
    if psql "$DATABASE_URL" -c "SELECT 1;" >/dev/null 2>&1; then
        echo "✅ Direct database connection successful"
        
        # Check table existence
        echo ""
        echo "🏗️  Checking table existence..."
        tables_query="SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('skills', 'skill_categories', 'skill_promotion_log', 'resumes', 'job_descriptions', 'analysis_results', 'interview_questions') ORDER BY table_name;"
        
        psql "$DATABASE_URL" -c "$tables_query"
        
        # Check migration status
        echo ""
        echo "📊 Checking migration status..."
        migration_query="SELECT version, description, applied_at FROM schema_migrations WHERE version LIKE '%007%' OR version LIKE '%foreign%' OR version LIKE '%constraint%' ORDER BY applied_at DESC;"
        
        psql "$DATABASE_URL" -c "$migration_query" || echo "⚠️  schema_migrations table may not exist yet"
        
        # Check for orphaned data
        echo ""
        echo "🧹 Checking for data integrity issues..."
        integrity_query="
        -- Check for orphaned analysis_results
        SELECT 'analysis_results with invalid resume_id' as issue, COUNT(*) as count
        FROM analysis_results ar
        LEFT JOIN resumes r ON ar.resume_id = r.id
        WHERE ar.resume_id IS NOT NULL AND r.id IS NULL
        UNION ALL
        SELECT 'analysis_results with invalid job_description_id' as issue, COUNT(*) as count
        FROM analysis_results ar
        LEFT JOIN job_descriptions jd ON ar.job_description_id = jd.id
        WHERE ar.job_description_id IS NOT NULL AND jd.id IS NULL
        UNION ALL
        SELECT 'interview_questions with invalid resume_id' as issue, COUNT(*) as count
        FROM interview_questions iq
        LEFT JOIN resumes r ON iq.resume_id = r.id
        WHERE iq.resume_id IS NOT NULL AND r.id IS NULL
        UNION ALL
        SELECT 'interview_questions with invalid job_description_id' as issue, COUNT(*) as count
        FROM interview_questions iq
        LEFT JOIN job_descriptions jd ON iq.job_description_id = jd.id
        WHERE iq.job_description_id IS NOT NULL AND jd.id IS NULL;
        "
        
        psql "$DATABASE_URL" -c "$integrity_query"
        
    else
        echo "❌ Database connection failed"
        echo "   This confirms the 'Database connection failed in production environment' error"
        echo ""
        echo "   Possible causes:"
        echo "   1. PostgreSQL service is down"
        echo "   2. Network connectivity issues"
        echo "   3. Invalid DATABASE_URL format"
        echo "   4. Authentication failure"
        echo "   5. Database doesn't exist"
        echo ""
        
        # Try to parse the DATABASE_URL
        echo "   Parsing DATABASE_URL..."
        if [[ $DATABASE_URL =~ postgresql://([^:]+):([^@]+)@([^:]+):([0-9]+)/(.+) ]]; then
            echo "   User: ${BASH_REMATCH[1]}"
            echo "   Host: ${BASH_REMATCH[3]}"
            echo "   Port: ${BASH_REMATCH[4]}"
            echo "   Database: ${BASH_REMATCH[5]}"
            
            # Test host connectivity
            echo ""
            echo "   Testing host connectivity..."
            if command -v nc >/dev/null 2>&1; then
                if nc -z "${BASH_REMATCH[3]}" "${BASH_REMATCH[4]}"; then
                    echo "   ✅ Host ${BASH_REMATCH[3]}:${BASH_REMATCH[4]} is reachable"
                else
                    echo "   ❌ Host ${BASH_REMATCH[3]}:${BASH_REMATCH[4]} is not reachable"
                    echo "      This indicates a network or service issue"
                fi
            fi
        else
            echo "   ❌ DATABASE_URL format appears invalid"
            echo "      Expected format: postgresql://user:password@host:port/database"
        fi
        
        exit 1
    fi
else
    echo "   psql not available, cannot test direct database connection"
    echo "   The Node.js application will attempt to connect using the database module"
fi

echo ""
echo "📋 Summary and Recommendations:"
echo "==============================="

# Check if migration files exist
echo ""
echo "📁 Checking migration file locations..."
migration_paths=(
    "./server/migrations/007_add_foreign_key_constraints.sql"
    "./build/migrations/007_add_foreign_key_constraints.sql" 
    "./dist/migrations/007_add_foreign_key_constraints.sql"
    "./migrations/007_add_foreign_key_constraints.sql"
)

for path in "${migration_paths[@]}"; do
    if [ -f "$path" ]; then
        echo "   ✅ Found: $path"
        file_size=$(stat -f%z "$path" 2>/dev/null || stat -c%s "$path" 2>/dev/null)
        echo "      Size: $file_size bytes"
    else
        echo "   ❌ Missing: $path"
    fi
done

echo ""
echo "🔧 Recommended Actions:"
echo "======================"
echo "1. If database connection is failing:"
echo "   - Verify Railway PostgreSQL service is running"
echo "   - Check DATABASE_URL environment variable is correct"
echo "   - Restart the database service if needed"
echo ""
echo "2. If database connection works but migration fails:"
echo "   - Run the diagnostic query script: ./database-migration-diagnosis.sql"
echo "   - Use the fixed migration script: ./fix-migration-007.sql"
echo "   - Check for orphaned data in foreign key tables"
echo ""
echo "3. For immediate fix:"
echo "   - Use the corrected migration file: ./007_add_foreign_key_constraints_fixed.sql"
echo "   - This includes proper error handling and data cleanup"
echo ""
echo "4. Railway-specific recommendations:"
echo "   - Check Railway dashboard for PostgreSQL service health"
echo "   - Verify environment variables are properly set"
echo "   - Check deployment logs for detailed error messages"
echo ""

# Check Node.js environment
if command -v node >/dev/null 2>&1; then
    echo "Node.js version: $(node --version)"
    echo "npm version: $(npm --version)"
else
    echo "❌ Node.js not available"
fi

echo ""
echo "Debug script completed at $(date)"