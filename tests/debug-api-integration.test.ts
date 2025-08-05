/**
 * Debug API Integration Test
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import request from 'supertest';

describe('Debug API Integration', () => {
  let app: any;

  beforeAll(async () => {
    console.log('Setting up test app...');
    try {
      const { createFixedTestApp } = await import('./helpers/test-server-fixed');
      app = await createFixedTestApp();
      console.log('Test app created successfully');
    } catch (error) {
      console.error('Failed to create test app:', error);
      throw error;
    }
  });

  test('should create app successfully', () => {
    expect(app).toBeDefined();
  });

  test('should respond to health check', async () => {
    const response = await request(app)
      .get('/api/health')
      .expect(200);
    
    expect(response.body.status).toBe('ok');
  });
});