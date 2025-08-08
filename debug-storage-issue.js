#!/usr/bin/env node

/**
 * Debug Storage Issue Script
 * Systematically diagnose the "Cannot read properties of undefined (reading 'getJobDescriptionById')" error
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('=== STORAGE ISSUE DIAGNOSTIC ===\n');

// 1. Check if storage initialization is properly called in server startup
console.log('1. CHECKING SERVER INITIALIZATION FLOW...');

const serverIndexPath = path.join(__dirname, 'server/index.ts');
if (fs.existsSync(serverIndexPath)) {
    const serverContent = fs.readFileSync(serverIndexPath, 'utf8');
    
    const hasStorageInit = serverContent.includes('initializeAppStorage');
    const hasStorageImport = serverContent.includes('./storage');
    const hasAwaitInit = serverContent.includes('await initializeAppStorage()');
    
    console.log(`  ✅ Storage import: ${hasStorageImport}`);
    console.log(`  ✅ Storage init call: ${hasStorageInit}`);
    console.log(`  ✅ Awaited initialization: ${hasAwaitInit}`);
} else {
    console.log('  ❌ server/index.ts not found');
}

// 2. Check if getStorage() is called properly in analysis routes
console.log('\n2. CHECKING ANALYSIS ROUTE USAGE...');

const analysisRoutePath = path.join(__dirname, 'server/routes/analysis.ts');
if (fs.existsSync(analysisRoutePath)) {
    const analysisContent = fs.readFileSync(analysisRoutePath, 'utf8');
    
    const hasGetStorageImport = analysisContent.includes('getStorage');
    const hasGetStorageCall = analysisContent.includes('getStorage()');
    const hasServiceCreation = analysisContent.includes('createAnalysisService(storage)');
    
    console.log(`  ✅ getStorage import: ${hasGetStorageImport}`);
    console.log(`  ✅ getStorage() calls: ${hasGetStorageCall}`);
    console.log(`  ✅ Service creation: ${hasServiceCreation}`);
    
    // Count how many times getStorage is called
    const getStorageMatches = analysisContent.match(/getStorage\(\)/g);
    console.log(`  📊 getStorage() call count: ${getStorageMatches ? getStorageMatches.length : 0}`);
} else {
    console.log('  ❌ server/routes/analysis.ts not found');
}

// 3. Check storage interface completeness
console.log('\n3. CHECKING STORAGE INTERFACE...');

const storagePath = path.join(__dirname, 'server/storage.ts');
if (fs.existsSync(storagePath)) {
    const storageContent = fs.readFileSync(storagePath, 'utf8');
    
    const hasInterface = storageContent.includes('export interface IStorage');
    const hasGetJobDescriptionById = storageContent.includes('getJobDescriptionById');
    const hasMemStorageImpl = storageContent.includes('class MemStorage implements IStorage');
    
    console.log(`  ✅ IStorage interface: ${hasInterface}`);
    console.log(`  ✅ getJobDescriptionById method: ${hasGetJobDescriptionById}`);
    console.log(`  ✅ MemStorage implementation: ${hasMemStorageImpl}`);
} else {
    console.log('  ❌ server/storage.ts not found');
}

// 4. Check if DatabaseStorage implements the interface correctly
console.log('\n4. CHECKING DATABASE STORAGE IMPLEMENTATION...');

const dbStoragePath = path.join(__dirname, 'server/database-storage.ts');
if (fs.existsSync(dbStoragePath)) {
    const dbStorageContent = fs.readFileSync(dbStoragePath, 'utf8');
    
    const implementsInterface = dbStorageContent.includes('implements IStorage');
    const hasGetJobDescriptionById = dbStorageContent.includes('async getJobDescriptionById');
    const hasCorrectSignature = dbStorageContent.includes('getJobDescriptionById(id: number, userId: string)');
    
    console.log(`  ✅ Implements IStorage: ${implementsInterface}`);
    console.log(`  ✅ Has getJobDescriptionById: ${hasGetJobDescriptionById}`);
    console.log(`  ✅ Correct method signature: ${hasCorrectSignature}`);
} else {
    console.log('  ❌ server/database-storage.ts not found');
}

// 5. Check HybridStorage implementation
console.log('\n5. CHECKING HYBRID STORAGE IMPLEMENTATION...');

const hybridStoragePath = path.join(__dirname, 'server/hybrid-storage.ts');
if (fs.existsSync(hybridStoragePath)) {
    const hybridStorageContent = fs.readFileSync(hybridStoragePath, 'utf8');
    
    const implementsInterface = hybridStorageContent.includes('implements IStorage');
    const hasGetJobDescriptionById = hybridStorageContent.includes('async getJobDescriptionById');
    const hasExecuteWithFallback = hybridStorageContent.includes('executeWithFallback');
    
    console.log(`  ✅ Implements IStorage: ${implementsInterface}`);
    console.log(`  ✅ Has getJobDescriptionById: ${hasGetJobDescriptionById}`);
    console.log(`  ✅ Uses executeWithFallback: ${hasExecuteWithFallback}`);
} else {
    console.log('  ❌ server/hybrid-storage.ts not found');
}

// 6. Check storage switcher logic
console.log('\n6. CHECKING STORAGE SWITCHER...');

const storageSwitcherPath = path.join(__dirname, 'server/storage-switcher.ts');
if (fs.existsSync(storageSwitcherPath)) {
    const switcherContent = fs.readFileSync(storageSwitcherPath, 'utf8');
    
    const hasInitFunction = switcherContent.includes('export async function initializeStorage');
    const hasDatabaseCheck = switcherContent.includes('DATABASE_URL');
    const hasProductionCheck = switcherContent.includes('NODE_ENV === \'production\'');
    
    console.log(`  ✅ Has initializeStorage function: ${hasInitFunction}`);
    console.log(`  ✅ Checks DATABASE_URL: ${hasDatabaseCheck}`);
    console.log(`  ✅ Checks production mode: ${hasProductionCheck}`);
} else {
    console.log('  ❌ server/storage-switcher.ts not found');
}

// 7. Check environment variables for Redis and Database
console.log('\n7. CHECKING ENVIRONMENT VARIABLES...');

const hasRedisUrl = !!process.env.REDIS_URL;
const hasDatabaseUrl = !!process.env.DATABASE_URL;
const nodeEnv = process.env.NODE_ENV || 'development';

console.log(`  📊 NODE_ENV: ${nodeEnv}`);
console.log(`  📊 DATABASE_URL configured: ${hasDatabaseUrl}`);
console.log(`  📊 REDIS_URL configured: ${hasRedisUrl}`);

if (process.env.DATABASE_URL) {
    const url = process.env.DATABASE_URL;
    const isPostgres = url.startsWith('postgres://') || url.startsWith('postgresql://');
    console.log(`  📊 Database type: ${isPostgres ? 'PostgreSQL' : 'Unknown'}`);
}

// 8. Look for common timing issues
console.log('\n8. CHECKING FOR TIMING ISSUES...');

console.log('  🔍 Checking for race conditions in initialization...');

const serverContent = fs.existsSync(serverIndexPath) ? fs.readFileSync(serverIndexPath, 'utf8') : '';
const hasAsyncInit = serverContent.includes('(async () => {');
const hasAwaitPattern = serverContent.includes('await initializeAppStorage()');
const hasRouteRegistration = serverContent.includes('registerRoutes(app)');

console.log(`  ✅ Async initialization wrapper: ${hasAsyncInit}`);
console.log(`  ✅ Awaits storage init: ${hasAwaitPattern}`);
console.log(`  ✅ Routes registered after init: ${hasRouteRegistration}`);

// Check order of operations
if (serverContent) {
    const initIndex = serverContent.indexOf('initializeAppStorage');
    const routesIndex = serverContent.indexOf('registerRoutes');
    const initBeforeRoutes = initIndex > 0 && routesIndex > 0 && initIndex < routesIndex;
    console.log(`  ✅ Storage initialized before routes: ${initBeforeRoutes}`);
}

// 9. Check for error handling in storage initialization
console.log('\n9. CHECKING ERROR HANDLING...');

const hasStorageErrorHandling = serverContent.includes('Storage system initialization failed');
const hasProcessExit = serverContent.includes('process.exit(1)');

console.log(`  ✅ Storage error handling: ${hasStorageErrorHandling}`);
console.log(`  ✅ Process exit on failure: ${hasProcessExit}`);

console.log('\n=== DIAGNOSTIC SUMMARY ===');
console.log('If storage is undefined, the most likely causes are:');
console.log('1. Storage initialization failed silently');
console.log('2. getStorage() called before initializeAppStorage() completes');
console.log('3. Race condition between route registration and storage init');
console.log('4. Database connection failure causing fallback issues');
console.log('5. Import/export issues between modules');

console.log('\n🔧 RECOMMENDED DEBUGGING STEPS:');
console.log('1. Add console.log in getStorage() to see if it\'s called too early');
console.log('2. Add console.log in initializeAppStorage() to confirm completion');  
console.log('3. Check server logs for database connection errors');
console.log('4. Verify environment variables are loaded before storage init');
console.log('5. Test with memory storage only (disable DATABASE_URL temporarily)');

console.log('\n✅ Diagnostic complete');