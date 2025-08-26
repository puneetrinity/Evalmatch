/**
 * Authentication Hook
 * 
 * Custom React hook for Firebase authentication
 */

import { useState, useEffect } from 'react';
import { 
  User,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged 
} from 'firebase/auth';
import { auth } from '../lib/firebase';

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}

interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
}

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthState({
        user,
        loading: false,
        error: null,
      });
    }, (error) => {
      console.error('Auth state change error:', error);
      setAuthState({
        user: null,
        loading: false,
        error: error.message,
      });
    });

    return unsubscribe;
  }, []);

  const signInWithGoogle = async () => {
    setAuthState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('email');
      provider.addScope('profile');
      
      const result = await signInWithPopup(auth, provider);
      
      // User will be set automatically by onAuthStateChanged
      console.log('Google sign-in successful:', result.user.email);
    } catch (error: any) {
      console.error('Google sign-in error:', error);
      
      let errorMessage = 'Failed to sign in with Google';
      
      if (error.code === 'auth/popup-closed-by-user') {
        errorMessage = 'Sign-in cancelled';
      } else if (error.code === 'auth/popup-blocked') {
        errorMessage = 'Popup blocked by browser. Please allow popups for this site.';
      } else if (error.code === 'auth/network-request-failed') {
        errorMessage = 'Network error. Please check your connection.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setAuthState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage,
      }));
    }
  };

  const signOut = async () => {
    setAuthState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      await firebaseSignOut(auth);
      // User will be set to null automatically by onAuthStateChanged
      console.log('Sign-out successful');
    } catch (error: any) {
      console.error('Sign-out error:', error);
      setAuthState(prev => ({
        ...prev,
        loading: false,
        error: error.message || 'Failed to sign out',
      }));
    }
  };

  const getAuthToken = async (): Promise<string | null> => {
    if (!authState.user) {
      return null;
    }

    try {
      return await authState.user.getIdToken();
    } catch (error) {
      console.error('Failed to get auth token:', error);
      return null;
    }
  };

  // Convert Firebase User to our AuthUser type
  const user: AuthUser | null = authState.user ? {
    uid: authState.user.uid,
    email: authState.user.email,
    displayName: authState.user.displayName,
    photoURL: authState.user.photoURL,
    emailVerified: authState.user.emailVerified,
  } : null;

  return {
    user,
    loading: authState.loading,
    error: authState.error,
    signInWithGoogle,
    signOut,
    getAuthToken,
    isAuthenticated: !!authState.user,
  };
}