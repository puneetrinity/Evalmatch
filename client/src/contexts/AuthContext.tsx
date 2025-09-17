/**
 * Authentication Context
 * 
 * Provides authentication state and methods throughout the app
 */

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User } from 'firebase/auth';
import { authService } from '@/lib/firebase';
import { authLogger } from '@/lib/auth-logger';

interface AuthContextType {
  // User state
  user: User | null;
  loading: boolean;
  
  // Authentication methods
  signIn: (email: string, password: string) => Promise<User>;
  signUp: (email: string, password: string, displayName?: string) => Promise<User>;
  signInWithGoogle: () => Promise<User>;
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
  const [lastProcessedUser, setLastProcessedUser] = useState<string | null>(null);

  // Track login and grant credits to new users
  const trackUserLogin = async (user: User, isNewUser: boolean = false) => {
    try {
      const token = await user.getIdToken();
      // Determine the actual login method from provider data
      const provider = user.providerData?.[0]?.providerId || 'password';
      const loginMethod = provider === 'google.com' ? 'google' : 'email';
      
      const response = await fetch('/api/track-login', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          method: loginMethod,
          timestamp: new Date().toISOString(),
          isNewUser,
          loginStreak: 1
        }),
      });

      if (response.ok) {
        const result = await response.json();
        authLogger.info('Login tracked successfully', {
          operation: 'track_login',
          uid: user.uid,
          reward: result.reward,
          credits: result.credits
        });

        // Show user notification if they received credits
        if (result.reward && result.reward.credits > 0) {
          authLogger.info('User received login reward', {
            operation: 'credit_reward',
            uid: user.uid,
            credits: result.reward.credits,
            message: result.reward.message
          });
        }
      } else {
        authLogger.warn('Login tracking failed', {
          operation: 'track_login',
          uid: user.uid,
          status: response.status
        });
      }
    } catch (error) {
      authLogger.error('Login tracking error', error, {
        operation: 'track_login',
        uid: user.uid
      });
    }
  };

  useEffect(() => {
    let mounted = true;
    
    const initializeAuth = async () => {
      try {
        // Wait for Firebase Auth to be ready with timeout
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Auth initialization timeout'));
          }, 10000);
          
          const unsubscribe = authService.onAuthStateChanged((user) => {
            // Resolve when we get ANY auth state (user or null)
            clearTimeout(timeout);
            unsubscribe();
            resolve();
          });
        });
        
        // Google OAuth now uses popup, no need to handle redirect result
      } catch (error: any) {
        authLogger.error('Auth initialization failed', error, {
          operation: 'auth_init'
        });
        // Set loading to false even if initialization fails
        if (mounted) {
          setLoading(false);
        }
      }
    };

    // Start auth initialization
    initializeAuth();

    // Set up auth state listener
    const unsubscribe = authService.onAuthStateChanged(async (user) => {
      if (mounted) {
        setUser(user);
        // Only set loading to false after initial load, not on every auth change
        if (loading) {
          setLoading(false);
        }
        
        // Log authentication state changes for debugging
        if (user) {
          authLogger.debug('User signed in', {
            operation: 'auth_state_change',
            uid: user.uid,
            email: user.email || undefined,
            success: true
          });

          // Track login and grant credits (avoid duplicate processing)
          if (user.uid !== lastProcessedUser) {
            setLastProcessedUser(user.uid);
            
            // Detect new user based on creation time (created within last 5 minutes)
            const isNewUser = user.metadata.creationTime && 
              (Date.now() - new Date(user.metadata.creationTime).getTime()) < 5 * 60 * 1000;
            
            // Track login asynchronously (don't block auth flow)
            trackUserLogin(user, Boolean(isNewUser)).catch(error => {
              authLogger.warn('Background login tracking failed', {
                operation: 'track_login_async',
                uid: user.uid,
                error: error.message
              });
            });
          }
        } else {
          authLogger.debug('User signed out', {
            operation: 'auth_state_change',
            success: false
          });
          
          // Reset processed user tracking on sign out
          setLastProcessedUser(null);
        }
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
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
      
      // Immediately track new user registration for credit granting
      // This ensures credits are granted even if onAuthStateChanged doesn't detect newUser correctly
      setLastProcessedUser(user.uid);
      trackUserLogin(user, true).catch(error => {
        authLogger.warn('New user login tracking failed during signup', {
          operation: 'signup_track_login',
          uid: user.uid,
          error: error.message
        });
      });
      
      return user;
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = async (): Promise<User> => {
    // Don't set loading here - it interferes with popup
    try {
      const user = await authService.signInWithGoogle();
      return user;
    } catch (error) {
      // Only handle errors, don't touch loading state
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
    // Redirect to auth page instead of showing fallback
    window.location.href = '/auth';
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>Redirecting to login...</div>
      </div>
    );
  }

  return <>{children}</>;
}

export default AuthContext;