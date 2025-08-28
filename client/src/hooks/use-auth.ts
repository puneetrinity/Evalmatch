/**
 * Authentication Hook
 * 
 * Convenience hook for accessing authentication state and methods
 */

import { useAuth as useAuthContext } from '@/contexts/AuthContext';

// Re-export useAuth for convenience
export const useAuth = useAuthContext;

// Additional authentication utility hooks
export function useAuthToken() {
  const { getAuthToken, user } = useAuth();
  
  return {
    getToken: getAuthToken,
    hasToken: !!user,
    userId: user?.uid || null,
    userEmail: user?.email || null,
    displayName: user?.displayName || null,
  };
}

export function useAuthState() {
  const { user, loading, isAuthenticated } = useAuth();
  
  return {
    user,
    loading,
    isAuthenticated,
    isAnonymous: !user,
    userId: user?.uid || null,
    userEmail: user?.email || null,
    displayName: user?.displayName || user?.email?.split('@')[0] || 'User',
  };
}