/**
 * Simple Integration Test to Validate Setup
 */

import { describe, test, expect } from '@jest/globals';

describe('Simple Integration Test', () => {
  test('should pass basic test', () => {
    expect(1 + 1).toBe(2);
  });

  test('should import supertest without issues', async () => {
    const request = await import('supertest');
    expect(request).toBeDefined();
  });

  test('should import express without issues', async () => {
    const express = await import('express');
    expect(express).toBeDefined();
  });

  test('should create simple express app', async () => {
    const express = await import('express');
    const request = await import('supertest');
    
    const app = express.default();
    app.get('/test', (req, res) => {
      res.json({ status: 'ok' });
    });
    
    const response = await request.default(app)
      .get('/test')
      .expect(200);
      
    expect(response.body.status).toBe('ok');
  });
});