/**
 * Credit management hooks
 * 
 * Handles credit balance, history, and package data
 */

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useAuth } from './use-auth';
import { useToast } from './use-toast';

interface CreditBalance {
  status: string;
  credits: number;
  totalPurchased: number;
  totalUsed: number;
  tier: string;
  timestamp: string;
}

interface CreditTransaction {
  id: string;
  type: 'debit' | 'credit' | 'grant' | 'refund';
  amount: number;
  description: string;
  createdAt: string;
  balanceBefore: number;
  balanceAfter: number;
  referenceId?: string;
}

interface CreditHistory {
  success: boolean;
  data: {
    transactions: CreditTransaction[];
    currentBalance: number;
    totalPurchased: number;
    totalUsed: number;
    pagination: {
      page: number;
      limit: number;
      total: number;
      hasMore: boolean;
    };
  };
}

interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  price: number;
  priceDisplay: string;
  currency: string;
  pricePerCredit: number;
  popular?: boolean;
  bonus?: number;
  bonusDisplay?: string;
  savings?: string;
  description: string;
}

interface PackagesResponse {
  status: string;
  packages: CreditPackage[];
  timestamp: string;
}

const fetchCreditBalance = async (token: string): Promise<CreditBalance> => {
  const response = await fetch('/api/v1/credits/balance', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `HTTP ${response.status}: Failed to fetch credit balance`);
  }

  return response.json();
};

const fetchCreditHistory = async (token: string, page: number = 1, limit: number = 50): Promise<CreditHistory> => {
  const response = await fetch(`/api/v1/credits/history?page=${page}&limit=${limit}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `HTTP ${response.status}: Failed to fetch credit history`);
  }

  return response.json();
};

const fetchCreditPackages = async (token: string): Promise<PackagesResponse> => {
  const response = await fetch('/api/v1/credits/packages', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `HTTP ${response.status}: Failed to fetch credit packages`);
  }

  return response.json();
};

const grantBetaCredits = async (token: string): Promise<{ status: string; message: string; credits: number }> => {
  const response = await fetch('/api/v1/credits/grant-beta', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `HTTP ${response.status}: Failed to grant beta credits`);
  }

  return response.json();
};

export const useCredits = () => {
  const { user, getToken } = useAuth();
  
  return useQuery({
    queryKey: ['credits', 'balance', user?.uid],
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error('No authentication token');
      return fetchCreditBalance(token);
    },
    enabled: !!user,
    staleTime: 30 * 1000, // 30 seconds - credit balance may change frequently
    cacheTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
    refetchOnWindowFocus: true, // Refresh on focus to get latest balance
  });
};

export const useCreditHistory = (page: number = 1, limit: number = 50) => {
  const { user, getToken } = useAuth();
  
  return useQuery({
    queryKey: ['credits', 'history', user?.uid, page, limit],
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error('No authentication token');
      return fetchCreditHistory(token, page, limit);
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000, // 2 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
    retry: 2,
    keepPreviousData: true, // For pagination
  });
};

export const useCreditPackages = () => {
  const { user, getToken } = useAuth();
  
  return useQuery({
    queryKey: ['credits', 'packages'],
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error('No authentication token');
      return fetchCreditPackages(token);
    },
    enabled: !!user,
    staleTime: 15 * 60 * 1000, // 15 minutes - packages rarely change
    cacheTime: 60 * 60 * 1000, // 1 hour
    retry: 2,
    refetchOnWindowFocus: false,
  });
};

export const useGrantBetaCredits = () => {
  const { user, getToken } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) throw new Error('No authentication token');
      return grantBetaCredits(token);
    },
    onSuccess: (data) => {
      toast({
        title: "Beta credits granted!",
        description: data.message,
      });
      // Invalidate credit queries to refresh balance
      queryClient.invalidateQueries(['credits', 'balance', user?.uid]);
      queryClient.invalidateQueries(['credits', 'history', user?.uid]);
      queryClient.invalidateQueries(['profile', user?.uid]);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to grant beta credits",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

export const useInvalidateCredits = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return () => {
    queryClient.invalidateQueries(['credits', 'balance', user?.uid]);
    queryClient.invalidateQueries(['credits', 'history', user?.uid]);
    queryClient.invalidateQueries(['profile', user?.uid]); // Profile includes credit summary
  };
};

export type { 
  CreditBalance, 
  CreditTransaction, 
  CreditHistory, 
  CreditPackage, 
  PackagesResponse 
};