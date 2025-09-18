/**
 * Tests for Retry-After header parsing (RFC 7231)
 * Ensures both delay-seconds and HTTP-date formats are handled correctly
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios, { AxiosError } from 'axios';
import { RetryableHTTPClient } from '../core/retry-client';

describe('Retry-After Header Parsing', () => {
  let retryClient: RetryableHTTPClient;
  let mockAxios: typeof axios;

  beforeEach(() => {
    // Create RetryableHTTPClient with short delays for testing
    retryClient = new RetryableHTTPClient({
      maxAttempts: 3,
      baseDelay: 100,
      maxDelay: 5000,
      backoffFactor: 2
    });

    // Mock axios
    mockAxios = axios;
    vi.spyOn(mockAxios, 'request');
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('Delay-Seconds Format', () => {
    it('should parse numeric Retry-After header (seconds)', async () => {
      const startTime = Date.now();

      // Mock 429 response with 2-second retry delay
      (mockAxios.request as any)
        .mockRejectedValueOnce({
          isAxiosError: true,
          response: {
            status: 429,
            headers: { 'retry-after': '2' }
          }
        })
        .mockResolvedValueOnce({ data: 'success' });

      await retryClient.request({ url: '/test' });

      // Should have waited approximately 2 seconds
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(1800); // Allow for timing variance
      expect(elapsed).toBeLessThan(3000);
    });

    it('should cap delay to maxDelay for large Retry-After values', async () => {
      const startTime = Date.now();

      // Mock 429 response with very large retry delay
      (mockAxios.request as any)
        .mockRejectedValueOnce({
          isAxiosError: true,
          response: {
            status: 429,
            headers: { 'retry-after': '10000' } // 10,000 seconds
          }
        })
        .mockResolvedValueOnce({ data: 'success' });

      await retryClient.request({ url: '/test' });

      // Should have been capped to maxDelay (5000ms)
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(4800);
      expect(elapsed).toBeLessThan(6000);
    });

    it('should ignore zero or negative Retry-After values', async () => {
      const startTime = Date.now();

      // Mock 429 response with zero retry delay
      (mockAxios.request as any)
        .mockRejectedValueOnce({
          isAxiosError: true,
          response: {
            status: 429,
            headers: { 'retry-after': '0' }
          }
        })
        .mockResolvedValueOnce({ data: 'success' });

      await retryClient.request({ url: '/test' });

      // Should fall back to exponential backoff (baseDelay = 100ms)
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(80);
      expect(elapsed).toBeLessThan(300);
    });
  });

  describe('HTTP-Date Format', () => {
    it('should parse RFC 7231 HTTP-date Retry-After header', async () => {
      vi.useFakeTimers();
      const mockNow = new Date('2024-01-15T10:00:00.000Z');
      vi.setSystemTime(mockNow);

      // Set retry time to 2 seconds in the future
      const retryTime = new Date('2024-01-15T10:00:02.000Z');
      const retryAfterDate = retryTime.toUTCString();

      // Mock 429 response with HTTP-date
      (mockAxios.request as any)
        .mockRejectedValueOnce({
          isAxiosError: true,
          response: {
            status: 429,
            headers: { 'retry-after': retryAfterDate }
          }
        })
        .mockResolvedValueOnce({ data: 'success' });

      const requestPromise = retryClient.request({ url: '/test' });

      // Fast-forward to just before retry time
      vi.advanceTimersByTime(1900);
      
      // Should still be waiting
      await vi.runOnlyPendingTimersAsync();
      
      // Fast-forward past retry time
      vi.advanceTimersByTime(200);
      await vi.runOnlyPendingTimersAsync();

      const result = await requestPromise;
      expect(result.data).toBe('success');
      expect(mockAxios.request).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it('should cap HTTP-date delay to maxDelay', async () => {
      vi.useFakeTimers();
      const mockNow = new Date('2024-01-15T10:00:00.000Z');
      vi.setSystemTime(mockNow);

      // Set retry time way in the future (should be capped)
      const retryTime = new Date('2024-01-15T12:00:00.000Z'); // 2 hours
      const retryAfterDate = retryTime.toUTCString();

      (mockAxios.request as any)
        .mockRejectedValueOnce({
          isAxiosError: true,
          response: {
            status: 429,
            headers: { 'retry-after': retryAfterDate }
          }
        })
        .mockResolvedValueOnce({ data: 'success' });

      const requestPromise = retryClient.request({ url: '/test' });

      // Should be capped to maxDelay (5000ms)
      vi.advanceTimersByTime(5000);
      await vi.runOnlyPendingTimersAsync();

      const result = await requestPromise;
      expect(result.data).toBe('success');

      vi.useRealTimers();
    });

    it('should ignore past HTTP-date values', async () => {
      vi.useFakeTimers();
      const mockNow = new Date('2024-01-15T10:00:00.000Z');
      vi.setSystemTime(mockNow);

      // Set retry time in the past
      const pastTime = new Date('2024-01-15T09:59:00.000Z');
      const retryAfterDate = pastTime.toUTCString();

      (mockAxios.request as any)
        .mockRejectedValueOnce({
          isAxiosError: true,
          response: {
            status: 429,
            headers: { 'retry-after': retryAfterDate }
          }
        })
        .mockResolvedValueOnce({ data: 'success' });

      const requestPromise = retryClient.request({ url: '/test' });

      // Should fall back to exponential backoff (~100ms)
      vi.advanceTimersByTime(200);
      await vi.runOnlyPendingTimersAsync();

      const result = await requestPromise;
      expect(result.data).toBe('success');

      vi.useRealTimers();
    });
  });

  describe('Invalid Retry-After Values', () => {
    it('should fall back to exponential backoff for invalid values', async () => {
      const testCases = [
        'invalid-string',
        '',
        'not-a-date-or-number',
        '-5',
        'NaN'
      ];

      for (const invalidValue of testCases) {
        vi.clearAllMocks();
        const startTime = Date.now();

        (mockAxios.request as any)
          .mockRejectedValueOnce({
            isAxiosError: true,
            response: {
              status: 429,
              headers: { 'retry-after': invalidValue }
            }
          })
          .mockResolvedValueOnce({ data: 'success' });

        await retryClient.request({ url: '/test' });

        // Should fall back to exponential backoff (baseDelay = 100ms)
        const elapsed = Date.now() - startTime;
        expect(elapsed).toBeGreaterThanOrEqual(80);
        expect(elapsed).toBeLessThan(300);
      }
    });

    it('should handle missing Retry-After header', async () => {
      const startTime = Date.now();

      (mockAxios.request as any)
        .mockRejectedValueOnce({
          isAxiosError: true,
          response: {
            status: 429,
            headers: {} // No Retry-After header
          }
        })
        .mockResolvedValueOnce({ data: 'success' });

      await retryClient.request({ url: '/test' });

      // Should fall back to exponential backoff
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(80);
      expect(elapsed).toBeLessThan(300);
    });
  });

  describe('Non-429 Errors', () => {
    it('should not use Retry-After for non-429 status codes', async () => {
      const startTime = Date.now();

      (mockAxios.request as any)
        .mockRejectedValueOnce({
          isAxiosError: true,
          response: {
            status: 500, // Server error, not rate limit
            headers: { 'retry-after': '10' }
          }
        })
        .mockResolvedValueOnce({ data: 'success' });

      await retryClient.request({ url: '/test' });

      // Should use exponential backoff, not the 10-second Retry-After
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(80);
      expect(elapsed).toBeLessThan(300); // Much less than 10 seconds
    });
  });
});