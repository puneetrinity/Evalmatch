/**
 * Simplified Authentication Manager
 * Replaces complex Firebase auth handling with race condition fixes
 */

import { User, onAuthStateChanged } from 'firebase/auth';
import { auth, authService } from './firebase';
import { authLogger } from './auth-logger';

type AuthState = {
  user: User | null;
  loading: boolean;
  initialized: boolean;
};

type AuthListener = (state: AuthState) => void;

class AuthManager {
  private state: AuthState = {
    user: null,
    loading: true,
    initialized: false
  };

  private listeners = new Set<AuthListener>();
  private unsubscribeAuth: (() => void) | null = null;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.initialize();
  }

  /**
   * Initialize authentication - called once on startup
   */
  private async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise<void>((resolve) => {
      // Set up Firebase auth state listener
      this.unsubscribeAuth = onAuthStateChanged(auth, (user) => {
        const wasInitialized = this.state.initialized;
        
        this.state = {
          user,
          loading: false,
          initialized: true
        };

        // Notify all listeners
        this.notifyListeners();

        // Resolve initialization promise on first auth state change
        if (!wasInitialized) {
          resolve();
        }
      });

      // Failsafe: resolve after 10 seconds even if no auth state change
      setTimeout(() => {
        if (!this.state.initialized) {
          this.state = {
            user: null,
            loading: false,
            initialized: true
          };
          this.notifyListeners();
          resolve();
        }
      }, 10000);
    });

    return this.initPromise;
  }

  /**
   * Wait for authentication to be initialized
   */
  async waitForInitialization(): Promise<void> {
    if (this.state.initialized) {
      return;
    }
    await this.initialize();
  }

  /**
   * Get current authentication state
   */
  getState(): AuthState {
    return { ...this.state };
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.state.user;
  }

  /**
   * Get current user
   */
  getCurrentUser(): User | null {
    return this.state.user;
  }

  /**
   * Get authentication token with proper error handling
   */
  async getAuthToken(forceRefresh = false): Promise<string | null> {
    // Wait for initialization if not ready
    if (!this.state.initialized) {
      await this.waitForInitialization();
    }

    const user = this.state.user;
    if (!user) {
      return null;
    }

    try {
      return await user.getIdToken(forceRefresh);
    } catch (error: any) {
      authLogger.error('Failed to get auth token', error, {
        operation: 'get_token',
        uid: user.uid,
        errorCode: error.code
      });
      return null;
    }
  }

  /**
   * Sign in with email and password
   */
  async signInWithEmail(email: string, password: string): Promise<void> {
    await authService.signInWithEmail(email, password);
    // Auth state will be updated automatically via onAuthStateChanged
  }

  /**
   * Register with email and password
   */
  async registerWithEmail(email: string, password: string, displayName?: string): Promise<void> {
    await authService.registerWithEmail(email, password, displayName);
    // Auth state will be updated automatically via onAuthStateChanged
  }

  /**
   * Sign in with Google
   */
  async signInWithGoogle(): Promise<void> {
    await authService.signInWithGoogle();
    // Auth state will be updated automatically via onAuthStateChanged
  }

  /**
   * Sign out
   */
  async signOut(): Promise<void> {
    await authService.signOut();
    // Auth state will be updated automatically via onAuthStateChanged
  }

  /**
   * Reset password
   */
  async resetPassword(email: string): Promise<void> {
    await authService.resetPassword(email);
  }

  /**
   * Subscribe to auth state changes
   */
  subscribe(listener: AuthListener): () => void {
    this.listeners.add(listener);
    
    // Immediately notify with current state
    listener(this.getState());
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners of state changes
   */
  private notifyListeners(): void {
    const state = this.getState();
    this.listeners.forEach(listener => {
      try {
        listener(state);
      } catch (error: any) {
        authLogger.error('Error in auth listener', error, {
          operation: 'auth_listener'
        });
      }
    });
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.unsubscribeAuth) {
      this.unsubscribeAuth();
      this.unsubscribeAuth = null;
    }
    this.listeners.clear();
  }
}

// Export singleton instance
export const authManager = new AuthManager();

// Export types for external use
export type { AuthState, AuthListener };