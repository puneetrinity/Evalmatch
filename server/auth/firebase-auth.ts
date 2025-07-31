/**
 * Firebase Authentication System
 * 
 * Unified, robust Firebase Admin SDK implementation with proper error handling,
 * graceful degradation, and comprehensive debugging capabilities.
 */

import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { config } from '../config/unified-config';
import { logger } from '../config/logger';

// Firebase Admin instances
let adminApp: App | null = null;
let adminAuth: Auth | null = null;

// Authentication status
interface AuthStatus {
  initialized: boolean;
  projectId: string | null;
  error: string | null;
  lastVerification: Date | null;
  totalTokensVerified: number;
  failedVerifications: number;
}

const authStatus: AuthStatus = {
  initialized: false,
  projectId: null,
  error: null,
  lastVerification: null,
  totalTokensVerified: 0,
  failedVerifications: 0,
};

/**
 * Initialize Firebase Admin SDK with comprehensive error handling
 */
export async function initializeFirebaseAuth(): Promise<void> {
  try {
    logger.info('🔐 Initializing Firebase Admin SDK...');

    // Check if already initialized
    if (getApps().length > 0) {
      adminApp = getApps()[0];
      adminAuth = getAuth(adminApp);
      authStatus.initialized = true;
      authStatus.projectId = config.firebase.projectId;
      logger.info('✅ Firebase Admin SDK already initialized');
      return;
    }

    // Validate configuration
    if (!config.firebase.configured) {
      const error = 'Firebase not configured - missing FIREBASE_PROJECT_ID or FIREBASE_SERVICE_ACCOUNT_KEY';
      authStatus.error = error;
      
      if (config.env === 'production') {
        logger.error(`❌ ${error}`);
        throw new Error(error);
      } else {
        logger.warn(`⚠️  ${error} - Firebase auth will be disabled in development`);
        return;
      }
    }

    // Parse service account credentials
    let credentials;
    try {
      credentials = JSON.parse(config.firebase.serviceAccountKey!);
    } catch (e) {
      const error = 'Invalid FIREBASE_SERVICE_ACCOUNT_KEY - not valid JSON';
      authStatus.error = error;
      throw new Error(error);
    }

    // Initialize Firebase Admin
    adminApp = initializeApp({
      credential: cert(credentials),
      projectId: config.firebase.projectId!,
    });

    // Get Auth instance
    adminAuth = getAuth(adminApp);

    // Test the connection
    await testFirebaseConnection();

    authStatus.initialized = true;
    authStatus.projectId = config.firebase.projectId;
    authStatus.error = null;

    logger.info('✅ Firebase Admin SDK initialized successfully', {
      projectId: config.firebase.projectId,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown Firebase initialization error';
    authStatus.error = errorMessage;
    logger.error('❌ Firebase Admin SDK initialization failed:', error);

    if (config.env === 'production') {
      throw error;
    } else {
      logger.warn('⚠️  Continuing without Firebase auth in development mode');
    }
  }
}

/**
 * Test Firebase connection
 */
async function testFirebaseConnection(): Promise<void> {
  if (!adminAuth) {
    throw new Error('Firebase Auth not initialized');
  }

  try {
    // Try to list users (limit 1) as a connection test
    await adminAuth.listUsers(1);
    logger.debug('✅ Firebase connection test passed');
  } catch (error) {
    logger.error('❌ Firebase connection test failed:', error);
    throw new Error(`Firebase connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Verify Firebase ID token with comprehensive error handling
 */
export async function verifyFirebaseToken(idToken: string): Promise<{
  uid: string;
  email?: string;
  emailVerified?: boolean;
  displayName?: string;
  photoURL?: string;
} | null> {
  if (!adminAuth || !authStatus.initialized) {
    logger.warn('Firebase Auth not initialized - token verification failed');
    return null;
  }

  try {
    authStatus.totalTokensVerified++;
    
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    
    authStatus.lastVerification = new Date();
    
    logger.debug('✅ Firebase token verified successfully', {
      uid: decodedToken.uid,
      email: decodedToken.email,
    });

    return {
      uid: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified,
      displayName: decodedToken.name,
      photoURL: decodedToken.picture,
    };

  } catch (error) {
    authStatus.failedVerifications++;
    
    // Log different error types with appropriate levels
    if (error.code === 'auth/id-token-expired') {
      logger.debug('Token expired (normal occurrence):', { uid: 'unknown' });
    } else if (error.code === 'auth/id-token-revoked') {
      logger.warn('Token revoked:', { error: error.message });
    } else if (error.code === 'auth/invalid-id-token') {
      logger.warn('Invalid token format:', { error: error.message });
    } else {
      logger.error('Token verification failed:', error);
    }

    return null;
  }
}

/**
 * Get Firebase user by UID
 */
export async function getFirebaseUser(uid: string) {
  if (!adminAuth || !authStatus.initialized) {
    logger.warn('Firebase Auth not initialized - user lookup failed');
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
    logger.error('Failed to get Firebase user:', error);
    return null;
  }
}

/**
 * Check if Firebase Auth is available
 */
export function isFirebaseAuthAvailable(): boolean {
  return authStatus.initialized && adminAuth !== null;
}

/**
 * Get Firebase authentication status for debugging
 */
export function getFirebaseAuthStatus(): AuthStatus & {
  verificationSuccessRate: number;
  uptime: number;
} {
  return {
    ...authStatus,
    verificationSuccessRate: authStatus.totalTokensVerified > 0
      ? Math.round((authStatus.totalTokensVerified - authStatus.failedVerifications) / authStatus.totalTokensVerified * 100)
      : 0,
    uptime: authStatus.lastVerification
      ? Math.floor((Date.now() - authStatus.lastVerification.getTime()) / 1000)
      : 0,
  };
}

/**
 * Comprehensive Firebase configuration verification for debugging
 */
export async function verifyFirebaseConfiguration(): Promise<{
  status: 'success' | 'error' | 'not_configured';
  details: {
    projectId?: string;
    serviceAccountConfigured: boolean;
    connectionTest: boolean;
    clientConfigured: boolean;
  };
  error?: string;
}> {
  try {
    // Check basic configuration
    if (!config.firebase.configured) {
      return {
        status: 'not_configured',
        details: {
          serviceAccountConfigured: false,
          connectionTest: false,
          clientConfigured: !!config.firebase.clientConfig.apiKey,
        },
        error: 'Firebase project ID or service account key not configured',
      };
    }

    // Check if initialized
    if (!adminAuth) {
      return {
        status: 'error',
        details: {
          projectId: config.firebase.projectId!,
          serviceAccountConfigured: true,
          connectionTest: false,
          clientConfigured: !!config.firebase.clientConfig.apiKey,
        },
        error: 'Firebase Admin SDK not initialized',
      };
    }

    // Test connection
    const connectionTest = await testFirebaseConnection().then(() => true).catch(() => false);

    return {
      status: connectionTest ? 'success' : 'error',
      details: {
        projectId: config.firebase.projectId!,
        serviceAccountConfigured: true,
        connectionTest,
        clientConfigured: !!config.firebase.clientConfig.apiKey,
      },
      error: connectionTest ? undefined : 'Connection test failed',
    };

  } catch (error) {
    return {
      status: 'error',
      details: {
        projectId: config.firebase.projectId || undefined,
        serviceAccountConfigured: !!config.firebase.serviceAccountKey,
        connectionTest: false,
        clientConfigured: !!config.firebase.clientConfig.apiKey,
      },
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Export auth instances for advanced usage
export { adminApp, adminAuth };