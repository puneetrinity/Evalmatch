#!/usr/bin/env node

/**
 * Railway Environment Variable Injection Script
 * 
 * This script ensures that VITE_ prefixed environment variables
 * are available during the Vite build process on Railway.
 * 
 * Railway has environment variables available at runtime but not
 * necessarily during build time for client-side code.
 */

import fs from 'fs';
import path from 'path';

const VITE_ENV_VARS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN', 
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID'
];

console.log('🔧 Injecting environment variables for Vite build...');

// Check which variables are available
const envStatus = {};
let missingVars = [];

VITE_ENV_VARS.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    envStatus[varName] = 'SET';
    // Export the variable for the current process and child processes
    process.env[varName] = value;
  } else {
    envStatus[varName] = 'MISSING';
    missingVars.push(varName);
  }
});

console.log('Environment variable status:', envStatus);

if (missingVars.length > 0) {
  console.warn(`⚠️  Missing environment variables: ${missingVars.join(', ')}`);
  console.warn('🔍 This may cause Firebase authentication to fail in the client.');
  console.warn('📋 Ensure these variables are set in Railway dashboard.');
} else {
  console.log('✅ All Firebase environment variables are available for build.');
}

// Create a .env.local file for Vite to pick up during build
const envContent = VITE_ENV_VARS
  .filter(varName => process.env[varName])
  .map(varName => `${varName}=${process.env[varName]}`)
  .join('\n');

if (envContent) {
  const envFilePath = path.join(process.cwd(), '.env.local');
  fs.writeFileSync(envFilePath, envContent);
  console.log(`📝 Created .env.local with ${VITE_ENV_VARS.filter(v => process.env[v]).length} variables`);
} else {
  console.warn('⚠️  No environment variables to inject!');
}

console.log('✅ Environment injection complete.');