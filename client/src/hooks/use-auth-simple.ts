/**
 * Simplified Authentication Hook
 * Uses the AuthManager to provide race-condition-free auth state
 */

import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { authManager, AuthState } from '@/lib/auth-manager';

interface UseAuthReturn {
  // State
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  
  // Actions
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  getAuthToken: (forceRefresh?: boolean) => Promise<string | null>;
}

export function useAuth(): UseAuthReturn {
  // Initialize with current auth manager state
  const [authState, setAuthState] = useState<AuthState>(() => authManager.getState());

  useEffect(() => {
    // Subscribe to auth state changes
    const unsubscribe = authManager.subscribe((newState) => {
      setAuthState(newState);
    });

    return unsubscribe;
  }, []);

  return {
    // State
    user: authState.user,
    loading: authState.loading,
    isAuthenticated: authState.user !== null && authState.initialized,
    
    // Actions (wrapped for error handling)
    signIn: async (email: string, password: string) => {
      try {
        await authManager.signInWithEmail(email, password);
      } catch (error) {
        throw error; // Re-throw for component error handling
      }
    },
    
    signUp: async (email: string, password: string, displayName?: string) => {
      try {
        await authManager.registerWithEmail(email, password, displayName);
      } catch (error) {
        throw error;
      }
    },
    
    signInWithGoogle: async () => {
      try {
        await authManager.signInWithGoogle();
      } catch (error) {
        throw error;
      }
    },
    
    signOut: async () => {
      try {
        await authManager.signOut();
      } catch (error) {
        throw error;
      }
    },
    
    resetPassword: async (email: string) => {
      try {
        await authManager.resetPassword(email);
      } catch (error) {
        throw error;
      }
    },
    
    getAuthToken: async (forceRefresh = false) => {
      try {
        return await authManager.getAuthToken(forceRefresh);
      } catch (error) {
        console.error('Failed to get auth token:', error);
        return null;
      }
    }
  };
}

/**
 * Higher-order component for protected routes
 */
import React, { ReactNode } from 'react';

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
    return fallback || (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Authentication Required</h2>
          <p className="text-gray-600 mb-4">Please log in to access this content.</p>
          <button
            onClick={() => window.location.href = '/auth'}
            className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/90"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}