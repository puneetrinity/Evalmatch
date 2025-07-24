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
googleProvider.addScope('openid');
googleProvider.addScope('email');
googleProvider.addScope('profile');
// Set custom parameters for better UX
googleProvider.setCustomParameters({
  prompt: 'select_account',
  access_type: 'online',
  include_granted_scopes: 'true'
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

  // Sign in with Google using redirect
  async signInWithGoogle(): Promise<User> {
    try {
      console.log('Attempting Google redirect sign in...');
      console.log('Firebase config check:', {
        apiKey: firebaseConfig.apiKey ? 'SET' : 'MISSING',
        authDomain: firebaseConfig.authDomain,
        projectId: firebaseConfig.projectId
      });
      console.log('Current window origin:', window.location.origin);
      console.log('Google provider scopes:', googleProvider.scopes);
      
      await signInWithRedirect(auth, googleProvider);
      // This will redirect the page, so we never reach this point
      throw new Error('Redirecting to Google sign-in...');
    } catch (error: any) {
      console.error('Google redirect sign in failed:', error.code, error.message);
      throw new Error(getAuthErrorMessage(error.code));
    }
  },

  // Handle Google redirect result (call this on app startup)
  async handleGoogleRedirectResult(): Promise<User | null> {
    try {
      console.log('Checking for Google redirect result...');
      const result = await getRedirectResult(auth);
      
      if (result && result.user) {
        console.log('Google redirect sign in successful:', result.user.email);
        return result.user;
      }
      
      return null;
    } catch (error: any) {
      console.error('Google redirect result error:', error);
      throw new Error(getAuthErrorMessage(error.code));
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
    default:
      return 'An authentication error occurred. Please try again.';
  }
}

export default app;