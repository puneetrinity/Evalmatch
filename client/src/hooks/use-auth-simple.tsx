/**
 * Simplified Authentication Hook
 * Uses the AuthManager to provide race-condition-free auth state
 */

import React, { useState, useEffect, ReactNode } from 'react';
import { User } from 'firebase/auth';
import { authManager, AuthState } from '@/lib/auth-manager';
import { authLogger } from '@/lib/auth-logger';

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
      } catch (error: any) {
        authLogger.error('Failed to get auth token', error, {
          operation: 'get_token',
          errorCode: error.code
        });
        return null;
      }
    }
  };
}

/**
 * Higher-order component for protected routes
 * Simplified navigation logic with better UX
 */
interface RequireAuthProps {
  children: ReactNode;
  fallback?: ReactNode;
  redirectTo?: string;
}

export function RequireAuth({ children, fallback, redirectTo = '/auth' }: RequireAuthProps) {
  const { user, loading, isAuthenticated } = useAuth();

  // Enhanced loading state with fade-in animation
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50/50 backdrop-blur-sm">
        <div className="text-center animate-fade-in">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-sm text-gray-600 animate-pulse">Loading your session...</p>
        </div>
      </div>
    );
  }

  // Redirect to auth if not authenticated
  if (!isAuthenticated) {
    // Preserve current path for redirect after authentication
    const currentPath = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '';
    const encodedRedirect = encodeURIComponent(currentPath);
    const authUrl = `${redirectTo}${currentPath !== '/' ? `?redirect=${encodedRedirect}` : ''}`;
    
    // Use client-side navigation instead of hard redirect
    React.useEffect(() => {
      // Small delay to prevent flash of unauthenticated content
      const timer = setTimeout(() => {
        window.location.replace(authUrl);
      }, 100);
      
      return () => clearTimeout(timer);
    }, [authUrl]);

    // Show fallback or default unauthorized UI while redirecting
    return fallback || (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md mx-auto px-6">
          <div className="mb-6">
            <svg className="mx-auto h-16 w-16 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} 
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Authentication Required</h2>
          <p className="text-gray-600 mb-6">
            You need to be signed in to access this page. You'll be redirected to the login page in a moment.
          </p>
          <div className="flex items-center justify-center text-sm text-gray-500">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary mr-2"></div>
            Redirecting to login...
          </div>
        </div>
      </div>
    );
  }

  // Authenticated - render children with smooth transition
  return (
    <div className="animate-fade-in">
      {children}
    </div>
  );
}