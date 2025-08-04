/**
 * Debug test to identify integration test issues
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import { Express } from 'express';

describe('Debug Integration Test', () => {
  let app: Express;

  beforeAll(async () => {
    try {
      console.log('Setting up debug test...');
      
      // Import and create mock server without setup
      const { createMockServer } = await import('./helpers/server-mock');
      
      // Create mock server
      app = createMockServer();
      console.log('Mock server created successfully');
    } catch (error) {
      console.error('Error setting up debug test:', error);
      throw error;
    }
  });

  test('should respond to health check', async () => {
    try {
      const response = await request(app)
        .get('/api/health');
      
      console.log('Health check response:', response.status, response.body);
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
    } catch (error) {
      console.error('Health check failed:', error);
      throw error;
    }
  });

  test('should require authentication', async () => {
    try {
      const response = await request(app)
        .get('/api/resumes');
      
      console.log('Unauthenticated response:', response.status, response.body);
      expect(response.status).toBe(401);
    } catch (error) {
      console.error('Auth test failed:', error);
      throw error;
    }
  });
});