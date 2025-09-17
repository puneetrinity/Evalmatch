#!/usr/bin/env node

/**
 * Admin script to manually grant credits to a user
 * Usage: node grant-credits.js <email> <amount>
 */

const email = process.argv[2] || 'hello@airevolabs.co.in';
const amount = parseInt(process.argv[3]) || 100;

async function grantCredits() {
  try {
    console.log(`Granting ${amount} credits to ${email}...`);
    
    // First, get Firebase Admin SDK initialized
    const admin = require('firebase-admin');
    
    // Initialize with service account
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
    
    if (!serviceAccount.project_id) {
      console.error('Error: FIREBASE_SERVICE_ACCOUNT_KEY not found in environment');
      console.log('Please run with: FIREBASE_SERVICE_ACCOUNT_KEY=\'{...}\' node grant-credits.js');
      process.exit(1);
    }
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    
    // Get user by email
    const userRecord = await admin.auth().getUserByEmail(email);
    console.log(`Found user: ${userRecord.uid} (${userRecord.email})`);
    
    // Now grant credits using the credit service
    const { creditService } = require('./build/services/credit-service.js');
    
    const result = await creditService.grantBetaCredits(userRecord.uid, amount);
    
    if (result.success) {
      console.log(`✅ Successfully granted ${amount} credits!`);
      console.log(`New balance: ${result.credits} credits`);
    } else {
      console.error(`❌ Failed to grant credits: ${result.error}`);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
  
  process.exit(0);
}

grantCredits();