#!/bin/bash
# ============================================================================
# RAILWAY MIGRATION DEPLOYMENT SCRIPT
# Safe migration deployment for Railway environments
# ============================================================================

set -e  # Exit on any error

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
MIGRATIONS_DIR="$PROJECT_ROOT/server/migrations"
LOG_FILE="/tmp/migration-deploy-$(date +%Y%m%d-%H%M%S).log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "$(date '+%Y-%m-%d %H:%M:%S') $1" | tee -a "$LOG_FILE"
}

# Error handling
error_exit() {
    log "${RED}ERROR: $1${NC}"
    exit 1
}

# Success message
success() {
    log "${GREEN}SUCCESS: $1${NC}"
}

# Warning message
warning() {
    log "${YELLOW}WARNING: $1${NC}"
}

# Info message
info() {
    log "${BLUE}INFO: $1${NC}"
}

# ============================================================================
# PREFLIGHT CHECKS
# ============================================================================

preflight_checks() {
    info "Running preflight checks..."
    
    # Check if DATABASE_URL is set
    if [ -z "$DATABASE_URL" ]; then
        error_exit "DATABASE_URL environment variable is not set"
    fi
    
    # Check if running in Railway environment
    if [ -n "$RAILWAY_ENVIRONMENT" ]; then
        info "Detected Railway environment: $RAILWAY_ENVIRONMENT"
    else
        warning "Not running in Railway environment - proceeding with caution"
    fi
    
    # Check if migrations directory exists
    if [ ! -d "$MIGRATIONS_DIR" ]; then
        error_exit "Migrations directory not found: $MIGRATIONS_DIR"
    fi
    
    # Check database connectivity
    info "Testing database connectivity..."
    if ! node -e "
        const { Pool } = require('pg');
        const pool = new Pool({ connectionString: process.env.DATABASE_URL });
        pool.query('SELECT 1')
            .then(() => { console.log('Database connection OK'); process.exit(0); })
            .catch(err => { console.error('Database connection failed:', err.message); process.exit(1); });
    " 2>/dev/null; then
        error_exit "Cannot connect to database"
    fi
    
    success "Preflight checks completed"
}

# ============================================================================
# ACQUIRE MIGRATION LOCK
# ============================================================================

acquire_lock() {
    info "Acquiring migration lock..."
    
    local lock_result=$(node -e "
        const { Pool } = require('pg');
        const pool = new Pool({ connectionString: process.env.DATABASE_URL });
        pool.query(
            \"SELECT acquire_migration_lock('railway_deployment', 'railway_script', 30) as acquired\"
        )
        .then(result => { 
            console.log(result.rows[0].acquired); 
            process.exit(0);
        })
        .catch(err => { 
            console.error('false'); 
            process.exit(1); 
        });
    " 2>/dev/null)
    
    if [ "$lock_result" = "true" ]; then
        success "Migration lock acquired"
        return 0
    else
        error_exit "Could not acquire migration lock - another migration may be running"
    fi
}

# ============================================================================
# RELEASE MIGRATION LOCK
# ============================================================================

release_lock() {
    info "Releasing migration lock..."
    
    node -e "
        const { Pool } = require('pg');
        const pool = new Pool({ connectionString: process.env.DATABASE_URL });
        pool.query(
            \"SELECT release_migration_lock('railway_deployment', 'railway_script') as released\"
        )
        .then(result => { 
            console.log('Lock released:', result.rows[0].released);
            process.exit(0);
        })
        .catch(err => { 
            console.error('Error releasing lock:', err.message);
            process.exit(1); 
        });
    " 2>/dev/null || warning "Could not release migration lock"
}

# ============================================================================
# RUN MIGRATIONS
# ============================================================================

run_migrations() {
    info "Running database migrations..."
    
    # Change to project root for drizzle-kit
    cd "$PROJECT_ROOT"
    
    # Run migrations using drizzle-kit
    if npm run db:migrate 2>&1 | tee -a "$LOG_FILE"; then
        success "Migrations completed successfully"
    else
        error_exit "Migration execution failed"
    fi
}

# ============================================================================
# HEALTH CHECK
# ============================================================================

health_check() {
    info "Running post-migration health check..."
    
    local health_result=$(node -e "
        const { Pool } = require('pg');
        const pool = new Pool({ connectionString: process.env.DATABASE_URL });
        pool.query('SELECT * FROM check_migration_health()')
        .then(result => { 
            const issues = result.rows.filter(row => row.status !== 'OK');
            if (issues.length === 0) {
                console.log('HEALTHY');
            } else {
                console.log('ISSUES_FOUND');
                issues.forEach(issue => {
                    console.error(\`\${issue.check_name}: \${issue.status} - \${issue.details}\`);
                });
            }
            process.exit(0);
        })
        .catch(err => { 
            console.error('HEALTH_CHECK_FAILED:', err.message); 
            process.exit(1); 
        });
    " 2>&1)
    
    if echo "$health_result" | grep -q "HEALTHY"; then
        success "Health check passed - database is in good state"
    elif echo "$health_result" | grep -q "ISSUES_FOUND"; then
        warning "Health check found issues:"
        echo "$health_result" | grep -v "ISSUES_FOUND"
        warning "Migration completed but with warnings - monitor system closely"
    else
        error_exit "Health check failed: $health_result"
    fi
}

# ============================================================================
# CLEANUP FUNCTION
# ============================================================================

cleanup() {
    info "Cleaning up..."
    release_lock
    info "Migration deployment log saved to: $LOG_FILE"
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

main() {
    info "Starting Railway migration deployment..."
    info "Log file: $LOG_FILE"
    
    # Set up cleanup on exit
    trap cleanup EXIT
    
    # Execute deployment steps
    preflight_checks
    acquire_lock
    run_migrations
    health_check
    
    success "Migration deployment completed successfully!"
    info "Summary:"
    info "- All preflight checks passed"
    info "- Migration lock acquired and released properly"
    info "- Database migrations executed successfully"
    info "- Post-migration health check passed"
}

# ============================================================================
# SCRIPT ENTRY POINT
# ============================================================================

# Check if script is being sourced or executed
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi