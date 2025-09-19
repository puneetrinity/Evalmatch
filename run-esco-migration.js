#!/usr/bin/env node

/**
 * Simple script to run ESCO FTS migration
 * This fixes the missing FTS table causing AI analysis failures
 */

import { runESCOMigration } from './build/lib/esco-migration.js';

console.log('🔧 Starting ESCO FTS migration to fix production issues...');

try {
  await runESCOMigration();
  console.log('✅ ESCO FTS migration completed successfully!');
  console.log('🔄 Circuit breakers should now recover automatically.');
} catch (error) {
  console.error('❌ ESCO migration failed:', error.message);
  process.exit(1);
}