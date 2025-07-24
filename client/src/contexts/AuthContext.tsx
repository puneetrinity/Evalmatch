/**
 * Authentication Context
 * 
 * Provides authentication state and methods throughout the app
 */

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User } from 'firebase/auth';
import { authService } from '@/lib/firebase';

interface AuthContextType {
  // User state
  user: User | null;
  loading: boolean;
  
  // Authentication methods
  signIn: (email: string, password: string) => Promise<User>;
  signUp: (email: string, password: string, displayName?: string) => Promise<User>;
  signInWithGoogle: () => Promise<User>;
  signInWithGoogleRedirect: () => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  
  // Utility methods
  getAuthToken: () => Promise<string | null>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Handle Google redirect result on app startup
    const handleRedirectResult = async () => {
      try {
        await authService.handleGoogleRedirectResult();
      } catch (error) {
        console.error('Error handling Google redirect result:', error);
      }
    };
    
    handleRedirectResult();

    const unsubscribe = authService.onAuthStateChanged((user) => {
      setUser(user);
      setLoading(false);
      
      // Log authentication state changes for debugging
      if (user) {
        console.log('User signed in:', { uid: user.uid, email: user.email, displayName: user.displayName });
      } else {
        console.log('User signed out');
      }
    });

    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string): Promise<User> => {
    setLoading(true);
    try {
      const user = await authService.signInWithEmail(email, password);
      return user;
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string, displayName?: string): Promise<User> => {
    setLoading(true);
    try {
      const user = await authService.registerWithEmail(email, password, displayName);
      return user;
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = async (): Promise<User> => {
    setLoading(true);
    try {
      const user = await authService.signInWithGoogle();
      return user;
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogleRedirect = async (): Promise<void> => {
    setLoading(true);
    try {
      await authService.signInWithGoogleRedirect();
      // Don't set loading to false here because we'll redirect
    } catch (error) {
      setLoading(false);
      throw error;
    }
  };

  const signOut = async (): Promise<void> => {
    setLoading(true);
    try {
      await authService.signOut();
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (email: string): Promise<void> => {
    await authService.resetPassword(email);
  };

  const getAuthToken = async (): Promise<string | null> => {
    return await authService.getAuthToken();
  };

  const value: AuthContextType = {
    user,
    loading,
    signIn,
    signUp,
    signInWithGoogle,
    signInWithGoogleRedirect,
    signOut,
    resetPassword,
    getAuthToken,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook to use the auth context
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Higher-order component for protected routes
interface RequireAuthProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export function RequireAuth({ children, fallback }: RequireAuthProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return fallback || <div>Please sign in to access this page.</div>;
  }

  return <>{children}</>;
}

export default AuthContext;