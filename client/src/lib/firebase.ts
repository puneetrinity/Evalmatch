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

// Firebase configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Debug logging for Firebase config with actual auth domain value
console.log('Firebase config loaded:', {
  apiKey: firebaseConfig.apiKey ? 'SET' : 'MISSING',
  authDomain: firebaseConfig.authDomain || 'MISSING',
  projectId: firebaseConfig.projectId ? 'SET' : 'MISSING',
  storageBucket: firebaseConfig.storageBucket ? 'SET' : 'MISSING',
  messagingSenderId: firebaseConfig.messagingSenderId ? 'SET' : 'MISSING',
  appId: firebaseConfig.appId ? 'SET' : 'MISSING'
});

// Validate that all required Firebase config values are present
const requiredFields = ['apiKey', 'authDomain', 'projectId', 'appId'];
const missingFields = requiredFields.filter(field => !firebaseConfig[field as keyof typeof firebaseConfig]);

if (missingFields.length > 0) {
  const error = `Firebase configuration missing required fields: ${missingFields.join(', ')}. Please ensure VITE_FIREBASE_* environment variables are set during build.`;
  console.error(error);
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
// Simpler custom parameters to avoid popup issues
googleProvider.setCustomParameters({
  prompt: 'select_account'
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
      
      return userCredential.user;
    } catch (error: any) {
      console.error('Registration error:', error);
      throw new Error(getAuthErrorMessage(error.code));
    }
  },

  // Sign in with email and password
  async signInWithEmail(email: string, password: string): Promise<User> {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      return userCredential.user;
    } catch (error: any) {
      console.error('Sign in error:', error);
      throw new Error(getAuthErrorMessage(error.code));
    }
  },

  // Sign in with Google using popup
  async signInWithGoogle(): Promise<User> {
    try {
      console.log('Attempting Google popup sign in...');
      console.log('Firebase config check:', {
        apiKey: firebaseConfig.apiKey ? 'SET' : 'MISSING',
        authDomain: firebaseConfig.authDomain,
        projectId: firebaseConfig.projectId
      });
      console.log('Current window origin:', window.location.origin);
      console.log('Google provider scopes:', googleProvider.scopes);
      
      // Check if we're on Railway deployment
      const isRailway = window.location.hostname === 'web-production-392cc.up.railway.app';
      if (isRailway) {
        console.log('Running on Railway deployment');
        console.log('Auth domain should be: ealmatch-railway.firebaseapp.com');
        console.log('Actual auth domain:', firebaseConfig.authDomain);
      }
      
      console.log('Starting Google popup sign-in...');
      
      // Small delay to ensure DOM is stable before opening popup
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const result = await signInWithPopup(auth, googleProvider);
      console.log('Google popup sign in successful:', result.user.email);
      
      return result.user;
    } catch (error: any) {
      console.error('Google popup sign in failed:', error.code, error.message);
      console.error('Full popup error:', error);
      
      // Log additional debugging info
      console.error('Debug info:', {
        origin: window.location.origin,
        authDomain: firebaseConfig.authDomain,
        errorCode: error.code,
        errorMessage: error.message,
        customData: error.customData
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
      console.log('Checking for Google redirect result...');
      
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise<null>((_, reject) => {
        setTimeout(() => reject(new Error('Redirect result timeout')), 5000);
      });
      
      const result = await Promise.race([
        getRedirectResult(auth),
        timeoutPromise
      ]);
      
      if (result && result.user) {
        console.log('Google redirect sign in successful:', result.user.email);
        return result.user;
      }
      
      console.log('No Google redirect result found');
      return null;
    } catch (error: any) {
      console.error('Google redirect result error:', error);
      // Don't throw error, just return null to allow app to continue
      return null;
    }
  },

  // Sign out
  async signOut(): Promise<void> {
    try {
      await signOut(auth);
    } catch (error: any) {
      console.error('Sign out error:', error);
      throw new Error('Failed to sign out');
    }
  },

  // Reset password
  async resetPassword(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error: any) {
      console.error('Password reset error:', error);
      throw new Error(getAuthErrorMessage(error.code));
    }
  },

  // Get current user
  getCurrentUser(): User | null {
    return auth.currentUser;
  },

  // Get auth token
  async getAuthToken(): Promise<string | null> {
    const user = auth.currentUser;
    if (user) {
      try {
        return await user.getIdToken();
      } catch (error) {
        console.error('Error getting auth token:', error);
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