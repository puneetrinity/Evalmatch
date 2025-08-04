/**
 * Simple debug test
 */

import { describe, test, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';

describe('Simple Debug Test', () => {
  test('should create express app and respond', async () => {
    const app = express();
    
    app.get('/test', (req, res) => {
      res.json({ message: 'hello' });
    });

    const response = await request(app)
      .get('/test');
    
    expect(response.status).toBe(200);
    expect(response.body.message).toBe('hello');
  });
});