#!/bin/bash
# ============================================================================
# EMERGENCY MIGRATION ROLLBACK SCRIPT
# For critical production issues requiring immediate database rollback
# ============================================================================

set -e

# Configuration
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Emergency procedures
emergency_rollback() {
    echo -e "${RED}EMERGENCY ROLLBACK INITIATED${NC}"
    echo "This script provides manual rollback procedures for critical migrations"
    echo
    
    echo -e "${YELLOW}STEP 1: Assess the situation${NC}"
    echo "- Check current migration status:"
    echo "  SELECT * FROM migration_execution_log ORDER BY execution_start DESC LIMIT 10;"
    echo
    echo "- Check for active locks:"
    echo "  SELECT * FROM migration_locks WHERE expires_at > now();"
    echo
    echo "- Check system health:"
    echo "  SELECT * FROM check_migration_health();"
    echo
    
    echo -e "${YELLOW}STEP 2: Emergency constraint removal (if needed)${NC}"
    echo "If foreign key constraints are causing issues:"
    echo
    cat << 'EOF'
-- Remove problematic foreign key constraints
DO $$
DECLARE
    constraint_record RECORD;
BEGIN
    -- List all foreign key constraints for review
    FOR constraint_record IN 
        SELECT table_name, constraint_name
        FROM information_schema.table_constraints 
        WHERE constraint_type = 'FOREIGN KEY'
        AND table_schema = 'public'
    LOOP
        RAISE NOTICE 'Found FK constraint: %.%', constraint_record.table_name, constraint_record.constraint_name;
        
        -- Uncomment the following line to actually drop constraints
        -- EXECUTE 'ALTER TABLE ' || constraint_record.table_name || ' DROP CONSTRAINT ' || constraint_record.constraint_name;
    END LOOP;
END $$;
EOF
    
    echo
    echo -e "${YELLOW}STEP 3: Release stuck migration locks${NC}"
    echo "-- Release all migration locks"
    echo "DELETE FROM migration_locks;"
    echo
    
    echo -e "${YELLOW}STEP 4: Mark problematic migration as failed${NC}"
    echo "-- Update migration status (replace VERSION with actual version)"
    echo "UPDATE migration_execution_log"
    echo "SET status = 'rolled_back', execution_end = now(),"
    echo "    error_message = 'Emergency rollback executed'"
    echo "WHERE migration_version = 'VERSION' AND status = 'running';"
    echo
    
    echo -e "${YELLOW}STEP 5: Application-level recovery${NC}"
    echo "1. Restart Railway services to clear any cached connections"
    echo "2. Monitor application logs for continued issues"
    echo "3. Verify key functionality works (user login, basic operations)"
    echo "4. Consider temporary feature flags to disable problematic features"
    echo
    
    echo -e "${GREEN}STEP 6: Post-incident analysis${NC}"
    echo "After the emergency is resolved:"
    echo "1. Document what went wrong and why"
    echo "2. Update migration procedures to prevent recurrence"
    echo "3. Plan proper fix implementation for next deployment"
    echo "4. Update team on lessons learned"
    echo
    
    echo -e "${RED}CRITICAL REMINDERS:${NC}"
    echo "- This is for EMERGENCY USE ONLY"
    echo "- Always notify team before executing emergency procedures"
    echo "- Document all actions taken during the incident"
    echo "- Plan proper fixes after the emergency is resolved"
}

# Database backup verification
check_backup_status() {
    echo -e "${YELLOW}BACKUP VERIFICATION CHECKLIST:${NC}"
    echo
    echo "Before proceeding with any rollback, verify:"
    echo "1. □ Recent database backup exists and is accessible"
    echo "2. □ Backup was taken before the problematic migration"
    echo "3. □ Backup can be restored quickly if needed"
    echo "4. □ Team is aware of potential data loss window"
    echo
    echo "Railway backup commands (if applicable):"
    echo "- List backups: railway run --service [service-name] pg_dump --help"
    echo "- Create immediate backup: railway run --service [service-name] pg_dump --no-owner --no-privileges [database-name] > backup.sql"
    echo
}

# Show help
show_help() {
    echo "Emergency Migration Rollback Script"
    echo
    echo "Usage: $0 [command]"
    echo
    echo "Commands:"
    echo "  rollback    Show emergency rollback procedures"
    echo "  backup      Show backup verification checklist"
    echo "  help        Show this help message"
    echo
    echo "Example:"
    echo "  $0 rollback"
    echo
}

# Main execution
case "${1:-help}" in
    "rollback")
        emergency_rollback
        ;;
    "backup")
        check_backup_status
        ;;
    "help"|"--help"|"-h")
        show_help
        ;;
    *)
        echo -e "${RED}Unknown command: $1${NC}"
        show_help
        exit 1
        ;;
esac