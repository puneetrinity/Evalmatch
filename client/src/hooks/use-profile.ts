/**
 * Profile management hook
 * 
 * Handles user profile data fetching and caching
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './use-auth';

interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  emailVerified: boolean;
  createdAt?: string;
  lastLoginAt?: string;
  tier: string;
  country: string;
  currency: string;
  company?: string | null;
  title?: string | null;
  phone?: string | null;
  creditSummary?: {
    balance: number;
    totalPurchased: number;
    totalUsed: number;
    available: boolean;
  };
}

interface ProfileResponse {
  success: boolean;
  profile: UserProfile;
  error?: string;
}

const fetchProfile = async (token: string): Promise<UserProfile> => {
  const response = await fetch('/api/v1/user/profile', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `HTTP ${response.status}: Failed to fetch profile`);
  }

  const data: ProfileResponse = await response.json();
  
  if (!data.success) {
    throw new Error(data.error || 'Failed to fetch profile');
  }

  return data.profile;
};

export const useProfile = () => {
  const { user, getAuthToken } = useAuth();
  
  return useQuery({
    queryKey: ['profile', user?.uid],
    queryFn: async () => {
      const token = await getAuthToken();
      if (!token) throw new Error('No authentication token');
      return fetchProfile(token);
    },
    enabled: !!user,
    staleTime: 10 * 60 * 1000, // 10 minutes - profile data changes infrequently
    gcTime: 30 * 60 * 1000, // 30 minutes (formerly cacheTime)
    retry: 2,
    refetchOnWindowFocus: false,
  });
};

export const useInvalidateProfile = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return () => {
    queryClient.invalidateQueries({ queryKey: ['profile', user?.uid] });
  };
};

export type { UserProfile, ProfileResponse };