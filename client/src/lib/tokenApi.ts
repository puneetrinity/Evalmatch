/**
 * Token API Client
 * 
 * HTTP client for token management API endpoints
 */

import { auth } from './firebase';
import type { 
  TokenGenerationRequest,
  TokenGenerationResponse,
  UsageOverview,
  ApiUsageMetrics,
} from '../../../shared/schema';

const API_BASE_URL = '';

class TokenApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string,
    public response?: any
  ) {
    super(message);
    this.name = 'TokenApiError';
  }
}

class TokenApiClient {
  private async getAuthHeaders(): Promise<HeadersInit> {
    const user = auth.currentUser;
    if (!user) {
      throw new TokenApiError('User not authenticated', 401, 'USER_NOT_AUTHENTICATED');
    }

    try {
      const idToken = await user.getIdToken();
      return {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      };
    } catch (error) {
      console.error('Failed to get auth token:', error);
      throw new TokenApiError('Failed to get authentication token', 401, 'AUTH_TOKEN_ERROR');
    }
  }

  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    
    try {
      const headers = await this.getAuthHeaders();
      
      const response = await fetch(url, {
        ...options,
        headers: {
          ...headers,
          ...options.headers,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new TokenApiError(
          data.message || `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          data.code,
          data
        );
      }

      return data.data || data;
    } catch (error) {
      if (error instanceof TokenApiError) {
        throw error;
      }

      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new TokenApiError(
          'Network error: Unable to connect to the API server',
          0,
          'NETWORK_ERROR'
        );
      }

      throw new TokenApiError(
        'An unexpected error occurred',
        500,
        'UNKNOWN_ERROR',
        error
      );
    }
  }

  /**
   * Generate a new API token
   */
  async generateToken(request: TokenGenerationRequest): Promise<TokenGenerationResponse> {
    return this.makeRequest<TokenGenerationResponse>('/api/tokens/generate', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * Get current usage overview
   */
  async getUsageOverview(): Promise<UsageOverview> {
    return this.makeRequest<UsageOverview>('/api/tokens/usage');
  }

  /**
   * Get detailed usage metrics
   */
  async getUsageMetrics(days: number = 30): Promise<ApiUsageMetrics> {
    return this.makeRequest<ApiUsageMetrics>(`/api/tokens/metrics?days=${days}`);
  }

  /**
   * Deactivate a token
   */
  async deactivateToken(tokenId: string): Promise<{ tokenId: string; message: string }> {
    return this.makeRequest(`/api/tokens/${tokenId}`, {
      method: 'DELETE',
    });
  }

  /**
   * Get token status and user info
   */
  async getTokenStatus(): Promise<{
    user: {
      uid: string;
      email: string;
      emailVerified: boolean;
      displayName?: string;
    };
    limits: {
      tier: string;
      maxCalls: number;
      usedCalls: number;
      remainingCalls: number;
      resetPeriod: string;
      lastReset: Date;
    };
  }> {
    return this.makeRequest('/api/tokens/status');
  }

  /**
   * Get upgrade information
   */
  async getUpgradeInfo(): Promise<{
    currentTier: string;
    currentUsage: number;
    currentLimit: number;
    tiers: Record<string, {
      name: string;
      maxCalls: number;
      price: string;
      features: string[];
    }>;
    contactInfo: {
      email: string;
      phone: string;
      calendlyUrl: string;
    };
  }> {
    return this.makeRequest('/api/tokens/upgrade-info');
  }

  /**
   * Reset usage (development only)
   */
  async resetUsage(): Promise<{ message: string; userId: string }> {
    return this.makeRequest('/api/tokens/reset-usage', {
      method: 'POST',
    });
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<{ status: string; timestamp: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/health`);
      if (response.ok) {
        return {
          status: 'connected',
          timestamp: new Date().toISOString(),
        };
      }
      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      throw new TokenApiError(
        'Unable to connect to API server',
        0,
        'CONNECTION_ERROR'
      );
    }
  }
}

export const tokenApi = new TokenApiClient();
export { TokenApiError };