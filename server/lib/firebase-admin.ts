/**
 * Firebase Admin SDK Configuration
 * 
 * Handles server-side Firebase authentication verification
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { logger } from './logger';
import { serverAuthLogger } from './auth-logger';

// Initialize Firebase Admin SDK
let adminApp;

try {
  // Check if Firebase Admin is already initialized
  if (getApps().length === 0) {
    // Initialize with service account key or default credentials
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      // Parse service account key from environment variable
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      adminApp = initializeApp({
        credential: cert(serviceAccount),
        projectId: process.env.FIREBASE_PROJECT_ID,
      });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      // Use service account file path
      adminApp = initializeApp({
        credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS),
        projectId: process.env.FIREBASE_PROJECT_ID,
      });
    } else {
      // Use default credentials (for Google Cloud environments)
      adminApp = initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID,
      });
    }
    
    serverAuthLogger.info('Firebase Admin SDK initialized successfully', {
      operation: 'admin_init',
      success: true
    });
  } else {
    adminApp = getApps()[0];
    serverAuthLogger.debug('Firebase Admin SDK already initialized', {
      operation: 'admin_init',
      success: true
    });
  }
} catch (error) {
  serverAuthLogger.error('Failed to initialize Firebase Admin SDK', error, {
    operation: 'admin_init'
  });
  adminApp = null;
}

// Get Firebase Auth instance
export const adminAuth = adminApp ? getAuth(adminApp) : null;

// Verify Firebase ID token
export async function verifyFirebaseToken(idToken: string): Promise<{
  uid: string;
  email?: string;
  emailVerified?: boolean;
  displayName?: string;
  photoURL?: string;
} | null> {
  if (!adminAuth) {
    serverAuthLogger.error('Firebase Admin Auth not initialized', undefined, {
      operation: 'verify_token'
    });
    return null;
  }

  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    
    serverAuthLogger.debug('Firebase token verified successfully', {
      operation: 'verify_token',
      uid: decodedToken.uid,
      email: decodedToken.email || undefined,
      success: true
    });

    return {
      uid: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified,
      displayName: decodedToken.name,
      photoURL: decodedToken.picture,
    };
  } catch (error) {
    serverAuthLogger.error('Firebase token verification failed', error, {
      operation: 'verify_token',
      errorCode: error.code
    });
    return null;
  }
}

// Get user by UID
export async function getFirebaseUser(uid: string) {
  if (!adminAuth) {
    serverAuthLogger.error('Firebase Admin Auth not initialized', undefined, {
      operation: 'get_user'
    });
    return null;
  }

  try {
    const userRecord = await adminAuth.getUser(uid);
    return {
      uid: userRecord.uid,
      email: userRecord.email,
      emailVerified: userRecord.emailVerified,
      displayName: userRecord.displayName,
      photoURL: userRecord.photoURL,
      disabled: userRecord.disabled,
      metadata: {
        creationTime: userRecord.metadata.creationTime,
        lastSignInTime: userRecord.metadata.lastSignInTime,
      },
    };
  } catch (error) {
    serverAuthLogger.error('Failed to get Firebase user', error, {
      operation: 'get_user',
      uid: uid,
      errorCode: error.code
    });
    return null;
  }
}

// Verify Firebase configuration for debug endpoint
export async function verifyFirebaseConfig(): Promise<{ status: string; projectId?: string; error?: string }> {
  try {
    if (!adminAuth) {
      return {
        status: 'not_initialized',
        error: 'Firebase Admin SDK not initialized'
      };
    }

    // Test basic Firebase functionality
    await adminAuth.listUsers(1); // Try to list just 1 user as a connection test
    
    return {
      status: 'connected',
      projectId: process.env.FIREBASE_PROJECT_ID || 'unknown'
    };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown Firebase error'
    };
  }
}

export default adminApp;