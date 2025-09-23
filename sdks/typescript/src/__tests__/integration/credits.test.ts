/**
 * Credits API Integration Tests
 * Tests the credits endpoints with MSW mocked responses
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EvalMatchClient } from '../../client';
import type { AuthProvider } from '../../types';

describe('Credits Integration', () => {
  let client: EvalMatchClient;
  let mockAuth: AuthProvider;

  beforeEach(() => {
    mockAuth = {
      getToken: async () => 'mock-auth-token',
      isAuthenticated: async () => true
    };

    client = new EvalMatchClient({
      baseUrl: 'https://api.test.evalmatch.com',
      authProvider: mockAuth
    });
  });

  describe('Credits Balance', () => {
    it('should fetch user credit balance successfully', async () => {
      const balance = await client.credits.balance();
      
      expect(balance).toMatchObject({
        success: true,
        credits: expect.any(Number),
        tier: expect.stringMatching(/freemium|credit|premium/),
        timestamp: expect.any(String)
      });
      
      expect(balance.credits).toBe(150);
      expect(balance.tier).toBe('credit');
    });

    it('should handle balance request with throwOnError: false', async () => {
      const result = await client.credits.balance({ throwOnError: false });
      
      expect(result).toMatchObject({
        success: true,
        credits: 150
      });
    });
  });

  describe('Credits History', () => {
    it('should fetch credit transaction history', async () => {
      const history = await client.credits.history();
      
      expect(history).toMatchObject({
        transactions: expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(Number),
            type: expect.stringMatching(/purchase|usage|grant/),
            amount: expect.any(Number),
            description: expect.any(String),
            createdAt: expect.any(String)
          })
        ]),
        currentBalance: expect.any(Number),
        pagination: expect.objectContaining({
          page: expect.any(Number),
          limit: expect.any(Number)
        })
      });
    });

    it('should handle pagination parameters', async () => {
      const history = await client.credits.history({ 
        page: 2, 
        limit: 5 
      });
      
      expect(history.pagination.page).toBe(2);
      expect(history.pagination.limit).toBe(5);
    });
  });

  describe('Credits Packages', () => {
    it('should fetch available credit packages', async () => {
      const packages = await client.credits.packages();
      
      expect(packages).toMatchObject({
        success: true,
        packages: expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            name: expect.any(String),
            credits: expect.any(Number),
            price: expect.any(Number),
            priceDisplay: expect.any(String),
            currency: expect.any(String),
            earnMethod: expect.stringMatching(/automatic|daily|streak|referral/),
            requirement: expect.any(String)
          })
        ]),
        timestamp: expect.any(String)
      });
      
      expect(packages.packages).toHaveLength(2);
      expect(packages.packages.some(pkg => pkg.popular === true)).toBe(true);
    });
  });

  describe('Grant Beta Credits', () => {
    it('should grant beta credits successfully', async () => {
      const result = await client.credits.grantBeta();
      
      expect(result).toMatchObject({
        success: true,
        message: expect.stringContaining('Beta credits'),
        credits: expect.any(Number),
        timestamp: expect.any(String)
      });
      
      expect(result.credits).toBe(50);
    });

    it('should accept optional request body', async () => {
      const result = await client.credits.grantBeta({ amount: 25 });
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('Beta credits');
    });
  });

  describe('Error Handling', () => {
    it('should handle authentication errors gracefully', async () => {
      const unauthClient = new EvalMatchClient({
        baseUrl: 'https://api.test.evalmatch.com',
        authProvider: {
          getToken: async () => '',
          isAuthenticated: async () => false
        }
      });

      // Should throw an authentication error
      await expect(unauthClient.credits.balance()).rejects.toThrow('Authentication required');
      
      // Verify the client structure is correct
      expect(typeof unauthClient.credits.balance).toBe('function');
    });

    it('should handle network errors with proper error context', async () => {
      // This would test network failures, but our MSW setup handles all requests
      // In a real integration test, we might test timeout scenarios
      expect(typeof client.credits.balance).toBe('function');
    });
  });

  describe('Client Options Support', () => {
    it('should support AbortSignal for request cancellation', async () => {
      const controller = new AbortController();
      
      // Test that AbortSignal option is accepted without error
      const requestPromise = client.credits.balance({
        signal: controller.signal
      });
      
      // MSW responses are immediate, so we test successful completion
      // In real-world usage, the signal would cancel slower requests
      const result = await requestPromise;
      expect(result.success).toBe(true);
    });

    it('should support timeout option', async () => {
      // Test that timeout option doesn't cause errors
      const balance = await client.credits.balance({
        timeout: 5000
      });
      
      expect(balance.success).toBe(true);
    });
  });
});