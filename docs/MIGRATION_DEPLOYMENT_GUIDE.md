# Migration Deployment Guide for EvalMatch

## 🚨 Critical Migration System Fixes Applied

This guide covers the deployment of migration system fixes that address the critical risks identified in the database migration analysis.

## 📋 Pre-Deployment Checklist

### ✅ Before ANY Migration Deployment:

1. **Verify Database Backups**
   ```bash
   # Check recent backups exist for both environments
   railway run --service [evalmatch-service] pg_dump --help
   railway run --service [recruitment-corner-service] pg_dump --help
   ```

2. **Confirm Environment Status**
   ```bash
   # Check both Railway deployments are healthy
   curl https://evalmatch.app/api/health
   curl https://recruitment-corner.scholavar.com/api/health
   ```

3. **Test Migration Script Locally**
   ```bash
   # Run with dry-run flag first
   npm run db:migrate:dry
   ```

## 🔧 Migration System Improvements

### What Was Fixed:

1. **✅ Drizzle Configuration**: Path mismatch resolved (`./migrations` → `./server/migrations`)
2. **✅ Migration Safety**: Added locking mechanism to prevent concurrent execution
3. **✅ Railway Optimization**: Environment-aware deployment with health checks
4. **✅ Audit Trail**: Complete migration execution logging
5. **✅ Emergency Procedures**: Rollback scripts for critical situations

### New Files Added:

- `server/migrations/012_migration_system_consolidation.sql` - Core safety improvements
- `scripts/railway-migration-deploy.sh` - Safe Railway deployment
- `scripts/emergency-rollback.sh` - Emergency procedures
- `docs/MIGRATION_DEPLOYMENT_GUIDE.md` - This guide

## 🚀 Deployment Procedures

### For Main EvalMatch App (evalmatch.app):

```bash
# 1. Deploy to origin main (triggers Railway deployment)
git push origin main

# 2. Monitor Railway build logs
railway logs --service [evalmatch-service] --follow

# 3. Verify migration completed successfully
railway run --service [evalmatch-service] "node -e \"
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT * FROM check_migration_health()')
  .then(result => console.table(result.rows))
  .catch(console.error);
\""
```

### For Recruitment Corner (recruitment-corner.scholavar.com):

```bash
# 1. Deploy to new-origin main
git push new-origin main

# 2. Monitor deployment
railway logs --service [recruitment-corner-service] --follow

# 3. Verify health
curl https://recruitment-corner.scholavar.com/api/health
```

## 🏥 Health Monitoring

### Check Migration System Health:

```sql
-- Run this query to check system health
SELECT * FROM check_migration_health();
```

Expected output:
- ✅ `schema_migrations_table`: OK
- ✅ `migration_version_conflicts`: OK  
- ✅ `foreign_key_constraints`: OK (≥5 constraints)
- ✅ `active_migration_locks`: OK

### Monitor Migration Execution:

```sql
-- View recent migration activity
SELECT * FROM migration_execution_log 
ORDER BY execution_start DESC 
LIMIT 10;
```

### Check for Issues:

```sql
-- Look for failed or stuck migrations
SELECT * FROM migration_execution_log 
WHERE status IN ('failed', 'running') 
ORDER BY execution_start DESC;
```

## 🆘 Emergency Procedures

### If Migration Fails During Deployment:

1. **Immediate Assessment**
   ```bash
   ./scripts/emergency-rollback.sh rollback
   ```

2. **Check Railway Service Status**
   ```bash
   railway status
   railway ps
   ```

3. **Review Migration Logs**
   ```bash
   railway logs --service [service-name] --tail 100
   ```

4. **If Service is Down - Quick Recovery**
   ```bash
   # Connect to database directly
   railway run --service [service-name] psql $DATABASE_URL
   
   -- Release any stuck migration locks
   DELETE FROM migration_locks;
   
   -- Mark failed migration for retry
   UPDATE migration_execution_log 
   SET status = 'failed', 
        error_message = 'Emergency intervention - requires retry'
   WHERE status = 'running' 
     AND execution_start < now() - interval '10 minutes';
   ```

### Critical Production Issue Response:

1. **Notify Team Immediately** - Use your team's incident response channel
2. **Assess Impact** - Check if users are affected
3. **Execute Rollback** - Follow emergency rollback procedures
4. **Document Everything** - Track all actions taken
5. **Post-Incident Review** - Analyze what went wrong and how to prevent it

## 🔍 Testing & Validation

### Pre-Deployment Testing:

```bash
# 1. Local migration test
npm run db:migrate:dry

# 2. Run health checks locally
node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT * FROM check_migration_health()')
  .then(result => console.table(result.rows));
"

# 3. Test migration locking
node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT acquire_migration_lock(\\'test_lock\\', \\'test_user\\', 1)')
  .then(result => console.log('Lock acquired:', result.rows[0]))
  .then(() => pool.query('SELECT release_migration_lock(\\'test_lock\\', \\'test_user\\')'))
  .then(result => console.log('Lock released:', result.rows[0]));
"
```

### Post-Deployment Validation:

```bash
# 1. Verify application health
curl -f https://evalmatch.app/api/health || echo "Health check failed"
curl -f https://recruitment-corner.scholavar.com/api/health || echo "Health check failed"

# 2. Test core functionality
curl -f https://evalmatch.app/api/test-endpoint || echo "Core functionality test failed"

# 3. Check database constraints
railway run --service [service] "node -e \"
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_type = \\'FOREIGN KEY\\'')
  .then(result => console.log('Foreign key constraints:', result.rows[0].count));
\""
```

## 📊 Risk Mitigation Summary

| Previous Risk | Status | Mitigation Applied |
|---------------|--------|--------------------|
| 🚨 Migration System Conflicts | ✅ **RESOLVED** | Consolidated on Drizzle ORM, removed conflicts |
| 🚨 Railway Deployment Fragility | ✅ **RESOLVED** | Added migration locks, environment awareness |
| ⚠️ Data Integrity Issues | ✅ **RESOLVED** | Health checks, constraint validation |
| ⚠️ No Rollback Procedures | ✅ **RESOLVED** | Emergency rollback scripts created |
| ⚠️ Missing Monitoring | ✅ **RESOLVED** | Comprehensive health check functions |

## 📞 Support & Escalation

### If You Need Help:

1. **Check this guide first** - Most common issues are covered
2. **Review migration logs** - Often contain the exact error information
3. **Test emergency procedures** - Validate rollback scripts work
4. **Document the issue** - Include logs, error messages, and steps taken

### Key Commands for Support:

```bash
# Essential debugging commands
railway logs --tail 50
railway run psql $DATABASE_URL -c "SELECT * FROM migration_execution_log ORDER BY execution_start DESC LIMIT 5;"
railway run psql $DATABASE_URL -c "SELECT * FROM check_migration_health();"
```

---

## ✅ Deployment Success Criteria

Migration deployment is considered successful when:

1. ✅ All health checks pass
2. ✅ No active migration locks remain
3. ✅ Both Railway services are healthy
4. ✅ Core application functionality works
5. ✅ Migration execution log shows "completed" status
6. ✅ Foreign key constraints are properly in place

**Remember**: The risk of NOT deploying these fixes is significantly higher than the risk of deploying them. This migration system consolidation eliminates the critical risks that could cause production outages and data corruption.