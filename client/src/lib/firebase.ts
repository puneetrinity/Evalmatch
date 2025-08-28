/**
 * Firebase Configuration and Setup
 * 
 * This file initializes Firebase app and provides authentication services
 */

import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  sendPasswordResetEmail,
  updateProfile
} from 'firebase/auth';
import { authLogger } from './auth-logger';

// Firebase configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Log Firebase config validation in development only
authLogger.debug('Firebase config validation', {
  success: true,
  operation: 'config_load'
});

// Validate that all required Firebase config values are present
const requiredFields = ['apiKey', 'authDomain', 'projectId', 'appId'];
const missingFields = requiredFields.filter(field => !firebaseConfig[field as keyof typeof firebaseConfig]);

if (missingFields.length > 0) {
  const error = `Firebase configuration missing required fields: ${missingFields.join(', ')}. Please ensure VITE_FIREBASE_* environment variables are set during build.`;
  authLogger.error('Firebase configuration invalid', new Error(error), {
    operation: 'config_validation'
  });
  throw new Error(error);
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);

// Google Auth Provider
const googleProvider = new GoogleAuthProvider();
// Add required scopes
googleProvider.addScope('email');
googleProvider.addScope('profile');
// Custom parameters to fix popup issues (from StackOverflow solutions)
googleProvider.setCustomParameters({
  prompt: 'select_account',
  display: 'popup'  // Explicitly set display mode for popup
});

// Authentication functions
export const authService = {
  // Register with email and password
  async registerWithEmail(email: string, password: string, displayName?: string): Promise<User> {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      // Update profile with display name if provided
      if (displayName) {
        await updateProfile(userCredential.user, { displayName });
      }
      
      authLogger.success('User registration successful', {
        operation: 'register',
        uid: userCredential.user.uid,
        email: userCredential.user.email || undefined,
        provider: 'email'
      });
      
      return userCredential.user;
    } catch (error: any) {
      authLogger.error('Registration failed', error, {
        operation: 'register',
        email: email,
        provider: 'email',
        errorCode: error.code
      });
      throw new Error(getAuthErrorMessage(error.code));
    }
  },

  // Sign in with email and password
  async signInWithEmail(email: string, password: string): Promise<User> {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      authLogger.success('Email sign-in successful', {
        operation: 'signin',
        uid: userCredential.user.uid,
        email: userCredential.user.email || undefined,
        provider: 'email'
      });
      
      return userCredential.user;
    } catch (error: any) {
      authLogger.error('Email sign-in failed', error, {
        operation: 'signin',
        email: email,
        provider: 'email',
        errorCode: error.code
      });
      throw new Error(getAuthErrorMessage(error.code));
    }
  },

  // Sign in with Google using popup
  async signInWithGoogle(): Promise<User> {
    try {
      authLogger.debug('Starting Google popup sign-in', {
        operation: 'google_signin',
        provider: 'google'
      });
      
      // Small delay to ensure DOM is stable before opening popup
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const result = await signInWithPopup(auth, googleProvider);
      
      authLogger.success('Google sign-in successful', {
        operation: 'google_signin',
        uid: result.user.uid,
        email: result.user.email || undefined,
        provider: 'google'
      });
      
      return result.user;
    } catch (error: any) {
      authLogger.error('Google sign-in failed', error, {
        operation: 'google_signin',
        provider: 'google',
        errorCode: error.code
      });
      
      // Provide clear error messages and ask user to retry
      if (error.code === 'auth/operation-not-allowed') {
        throw new Error('Google sign-in is not enabled. Please use email/password login or contact support.');
      }
      
      if (error.code === 'auth/popup-closed-by-user') {
        throw new Error('Google sign-in was cancelled. Please click "Continue with Google" again and complete the sign-in process.');
      }
      
      if (error.code === 'auth/popup-blocked') {
        throw new Error('Pop-up was blocked by your browser. Please allow pop-ups for this site and try again.');
      }
      
      if (error.code === 'auth/cancelled-popup-request') {
        throw new Error('Google sign-in was cancelled. Please try again.');
      }
      
      if (error.code === 'auth/unauthorized-domain') {
        throw new Error('This domain is not authorized for Google sign-in. Please contact support.');
      }
      
      // Generic error with retry instruction
      throw new Error(`Google sign-in failed: ${getAuthErrorMessage(error.code)}. Please try again.`);
    }
  },

  // Handle Google redirect result (call this on app startup)
  async handleGoogleRedirectResult(): Promise<User | null> {
    try {
      authLogger.debug('Checking for Google redirect result', {
        operation: 'google_redirect'
      });
      
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise<null>((_, reject) => {
        setTimeout(() => reject(new Error('Redirect result timeout')), 5000);
      });
      
      const result = await Promise.race([
        getRedirectResult(auth),
        timeoutPromise
      ]);
      
      if (result && result.user) {
        authLogger.success('Google redirect sign-in successful', {
          operation: 'google_redirect',
          uid: result.user.uid,
          email: result.user.email || undefined,
          provider: 'google'
        });
        return result.user;
      }
      
      authLogger.debug('No Google redirect result found', {
        operation: 'google_redirect'
      });
      return null;
    } catch (error: any) {
      authLogger.error('Google redirect result error', error, {
        operation: 'google_redirect',
        errorCode: error.code
      });
      // Don't throw error, just return null to allow app to continue
      return null;
    }
  },

  // Sign out
  async signOut(): Promise<void> {
    try {
      await signOut(auth);
      authLogger.debug('User signed out successfully', {
        operation: 'signout'
      });
    } catch (error: any) {
      authLogger.error('Sign out failed', error, {
        operation: 'signout',
        errorCode: error.code
      });
      throw new Error('Failed to sign out');
    }
  },

  // Reset password
  async resetPassword(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(auth, email);
      authLogger.debug('Password reset email sent', {
        operation: 'password_reset',
        email: email
      });
    } catch (error: any) {
      authLogger.error('Password reset failed', error, {
        operation: 'password_reset',
        email: email,
        errorCode: error.code
      });
      throw new Error(getAuthErrorMessage(error.code));
    }
  },

  // Get current user
  getCurrentUser(): User | null {
    return auth.currentUser;
  },

  // Get auth token with retry mechanism
  async getAuthToken(forceRefresh = false): Promise<string | null> {
    // Wait for auth to be ready if currentUser is null
    if (!auth.currentUser) {
      authLogger.debug('Waiting for auth state to be ready', {
        operation: 'get_token'
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Auth token timeout'));
          }, 5000);
          
          const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
              clearTimeout(timeout);
              unsubscribe();
              resolve();
            }
          });
        });
      } catch (error: any) {
        authLogger.error('Auth state timeout', error, {
          operation: 'get_token'
        });
        return null;
      }
    }

    const user = auth.currentUser;
    if (user) {
      try {
        const token = await user.getIdToken(forceRefresh);
        authLogger.debug('Auth token retrieved successfully', {
          operation: 'get_token',
          uid: user.uid,
          success: true
        });
        return token;
      } catch (error: any) {
        authLogger.error('Failed to get auth token', error, {
          operation: 'get_token',
          uid: user.uid,
          errorCode: error.code
        });
        return null;
      }
    }
    return null;
  },

  // Listen to auth state changes
  onAuthStateChanged: (callback: (user: User | null) => void) => {
    return onAuthStateChanged(auth, callback);
  }
};

// Helper function to convert Firebase auth error codes to user-friendly messages
function getAuthErrorMessage(errorCode: string): string {
  switch (errorCode) {
    case 'auth/user-not-found':
      return 'No user found with this email address.';
    case 'auth/wrong-password':
      return 'Incorrect password.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    case 'auth/invalid-email':
      return 'Invalid email address.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please try again later.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in was cancelled. Please try again.';
    case 'auth/cancelled-popup-request':
      return 'Google sign-in was cancelled. Please try again.';
    case 'auth/popup-blocked':
      return 'Pop-up was blocked by your browser. Please allow pop-ups and try again.';
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with the same email but different sign-in credentials.';
    case 'auth/credential-already-in-use':
      return 'This credential is already associated with a different user account.';
    case 'auth/operation-not-allowed':
      return 'This sign-in method is not enabled. Please contact support.';
    default:
      return 'An authentication error occurred. Please try again.';
  }
}

export default app;