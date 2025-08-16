/**
 * Firebase Authentication Provider for EvalMatch SDK
 * Integrates with Firebase Auth to provide JWT tokens
 */

import type { AuthProvider } from '../types';

// Firebase types (imported as peer dependency)
interface FirebaseUser {
  getIdToken(forceRefresh?: boolean): Promise<string>;
}

interface FirebaseAuth {
  currentUser: FirebaseUser | null;
  onAuthStateChanged(callback: (user: FirebaseUser | null) => void): () => void;
}

export class FirebaseAuthProvider implements AuthProvider {
  private auth: FirebaseAuth;
  private tokenCache: string | null = null;
  private tokenExpiry: number = 0;

  constructor(auth: FirebaseAuth) {
    this.auth = auth;
    
    // Listen for auth state changes to clear cache
    this.auth.onAuthStateChanged(() => {
      this.tokenCache = null;
      this.tokenExpiry = 0;
    });
  }

  /**
   * Get current Firebase JWT token with caching
   */
  async getToken(): Promise<string | null> {
    if (!this.auth.currentUser) {
      return null;
    }

    // Return cached token if still valid (with 5 minute buffer)
    if (this.tokenCache && Date.now() < this.tokenExpiry - 5 * 60 * 1000) {
      return this.tokenCache;
    }

    try {
      // Get fresh token from Firebase
      const token = await this.auth.currentUser.getIdToken(false);
      
      // Cache token (Firebase JWT tokens expire in 1 hour)
      this.tokenCache = token;
      this.tokenExpiry = Date.now() + 55 * 60 * 1000; // 55 minutes
      
      return token;
    } catch (error) {
      console.error('Failed to get Firebase token:', error);
      return null;
    }
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    return this.auth.currentUser !== null;
  }

  /**
   * Force refresh the cached token
   */
  async refreshToken(): Promise<string | null> {
    if (!this.auth.currentUser) {
      return null;
    }

    try {
      const token = await this.auth.currentUser.getIdToken(true);
      this.tokenCache = token;
      this.tokenExpiry = Date.now() + 55 * 60 * 1000;
      return token;
    } catch (error) {
      console.error('Failed to refresh Firebase token:', error);
      return null;
    }
  }
}