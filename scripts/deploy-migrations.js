#!/usr/bin/env node

/**
 * Safe migration deployment script for Railway
 * Handles both development and production environments
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const MIGRATION_LOCK_FILE = '/tmp/evalmatch-migration.lock';
const MIGRATION_DIR = path.join(__dirname, '../server/migrations');

class MigrationDeployer {
  constructor() {
    this.isProduction = process.env.NODE_ENV === 'production';
    this.isRailway = !!process.env.RAILWAY_ENVIRONMENT;
    this.dryRun = process.argv.includes('--dry-run');
  }

  async checkLock() {
    if (fs.existsSync(MIGRATION_LOCK_FILE)) {
      const lockInfo = JSON.parse(fs.readFileSync(MIGRATION_LOCK_FILE, 'utf8'));
      const lockAge = Date.now() - lockInfo.timestamp;
      
      // Lock expires after 5 minutes
      if (lockAge < 5 * 60 * 1000) {
        throw new Error(`Migration already in progress (started ${new Date(lockInfo.timestamp).toISOString()})`);
      } else {
        console.log('⚠️  Found stale migration lock, removing...');
        fs.unlinkSync(MIGRATION_LOCK_FILE);
      }
    }
  }

  async createLock() {
    const lockInfo = {
      timestamp: Date.now(),
      environment: process.env.RAILWAY_ENVIRONMENT || 'local',
      pid: process.pid
    };
    fs.writeFileSync(MIGRATION_LOCK_FILE, JSON.stringify(lockInfo, null, 2));
  }

  async removeLock() {
    if (fs.existsSync(MIGRATION_LOCK_FILE)) {
      fs.unlinkSync(MIGRATION_LOCK_FILE);
    }
  }

  async validateEnvironment() {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is required');
    }

    if (this.isProduction && !this.isRailway) {
      console.log('⚠️  Production deployment detected outside Railway');
    }

    console.log(`🔧 Environment: ${this.isProduction ? 'production' : 'development'}`);
    console.log(`🚄 Railway: ${this.isRailway ? 'yes' : 'no'}`);
    console.log(`🧪 Dry run: ${this.dryRun ? 'yes' : 'no'}`);
  }

  async runMigration() {
    return new Promise((resolve, reject) => {
      const args = ['drizzle-kit', 'migrate'];
      if (this.dryRun) {
        args.push('--dry-run');
      }

      console.log(`🚀 Running: npx ${args.join(' ')}`);
      
      const migration = spawn('npx', args, {
        stdio: 'inherit',
        cwd: path.join(__dirname, '..')
      });

      migration.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Migration failed with exit code ${code}`));
        }
      });

      migration.on('error', reject);
    });
  }

  async deploy() {
    try {
      console.log('🔍 Validating environment...');
      await this.validateEnvironment();

      console.log('🔒 Checking for migration locks...');
      await this.checkLock();

      if (!this.dryRun) {
        console.log('🔐 Creating migration lock...');
        await this.createLock();
      }

      console.log('📊 Running database migrations...');
      await this.runMigration();

      console.log('✅ Migration deployment completed successfully!');
      
    } catch (error) {
      console.error('❌ Migration deployment failed:', error.message);
      process.exit(1);
    } finally {
      if (!this.dryRun) {
        await this.removeLock();
      }
    }
  }
}

// Handle cleanup on process termination
process.on('SIGINT', async () => {
  console.log('\n🛑 Migration deployment interrupted');
  if (fs.existsSync(MIGRATION_LOCK_FILE)) {
    fs.unlinkSync(MIGRATION_LOCK_FILE);
  }
  process.exit(1);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Migration deployment terminated');
  if (fs.existsSync(MIGRATION_LOCK_FILE)) {
    fs.unlinkSync(MIGRATION_LOCK_FILE);
  }
  process.exit(1);
});

// Run the deployment
const deployer = new MigrationDeployer();
deployer.deploy();