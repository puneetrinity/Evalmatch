#!/usr/bin/env node

/**
 * Test script for Mautic webhook with credit granting functionality
 * This tests the complete flow including Firebase UID lookup and credit rewards
 */

import crypto from 'crypto';

const SECRET = "fc8543b4d85a9eaca7239ef7f21b70deaf5a39881e05da037b9b25c7062ebbe9";

// Test payload with Firebase UID and tags for credit rewards
const TEST_PAYLOAD = {
  event: 'contact.identified',
  timestamp: new Date().toISOString(),
  contact: {
    id: '123',
    email: 'test@example.com',
    firstname: 'Test',
    lastname: 'User',
    tags: ['newsletter_subscriber', 'premium_interest'], // Should trigger 5 + 5 = 10 credits
    firebase_uid: 'test-firebase-uid-123', // Firebase UID for user lookup
    evalmatch_user_id: 'test-firebase-uid-123',
    fields: {
      firebase_uid: 'test-firebase-uid-123',
      evalmatch_user_id: 'test-firebase-uid-123',
      customFields: {
        firebase_uid: 'test-firebase-uid-123'
      }
    }
  }
};

const payload = JSON.stringify(TEST_PAYLOAD);

// Generate base64-encoded HMAC-SHA256 signature (Mautic format)
const signature = crypto
  .createHmac('sha256', SECRET)
  .update(payload)
  .digest('base64');

console.log('🧪 Testing Mautic webhook with credit granting...');
console.log('📊 Payload:', JSON.stringify(TEST_PAYLOAD, null, 2));
console.log('🔐 Signature:', signature);
console.log('');

console.log('Expected behavior:');
console.log('✅ Should validate signature successfully');
console.log('🔍 Should lookup user by Firebase UID: test-firebase-uid-123');
console.log('💰 Should grant credits for tags:');
console.log('   - newsletter_subscriber: 5 credits');
console.log('   - premium_interest: 5 credits');
console.log('   - Total: 10 credits');
console.log('🔗 Should link Mautic contact ID to user if not already linked');
console.log('📝 Should log all operations with detailed context');
console.log('');

// This would be the curl command to test
console.log('🚀 Test command (when server is running):');
console.log(`curl -X POST https://evalmatch.app/api/webhooks/mautic \\
  -H "Content-Type: application/json" \\
  -H "Webhook-Signature: ${signature}" \\
  -d '${payload}' \\
  -v`);

console.log('');
console.log('📋 Check server logs for:');
console.log('  - "Processing tag-based reward" messages');
console.log('  - "Tag-based reward granted successfully" confirmations');
console.log('  - Credit service operations');
console.log('  - User lookup by Firebase UID');