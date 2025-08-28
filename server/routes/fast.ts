/**
 * PHASE 1.4: Minimal Fast Routes (Prove Platform)
 * 
 * Ultra-lightweight fast paths with NO heavy imports.
 * These must be mounted FIRST to bypass all middleware.
 * 
 * NO IMPORTS FROM: database, redis-singleton, config, services
 * Only static responses allowed.
 */

import { Express } from 'express';

export const fastRoutes = (app: Express): void => {
  // Ultra-fast health check - static response, no DB/Redis calls
  app.get('/api/healthz', (req, res) => {
    res.set('X-Fast-Path', 'true');
    res.set('Cache-Control', 'no-cache');
    res.status(200).json({ 
      ok: true, 
      ts: Date.now(),
      uptime: Math.round(process.uptime()),
      service: 'evalmatch-api'
    });
  });

  // Ultra-fast version check - static response
  app.get('/api/version', (req, res) => {
    res.set('X-Fast-Path', 'true');
    res.set('Cache-Control', 'no-cache');
    res.status(200).json({ 
      version: process.env.APP_VERSION || 'dev',
      api: 'v1',
      ts: Date.now()
    });
  });

  // Ultra-fast ping - minimal response
  app.get('/api/ping', (req, res) => {
    res.set('X-Fast-Path', 'true');
    res.set('Cache-Control', 'no-cache');
    res.status(200).json({
      status: 'alive',
      ts: Date.now(),
      uptime: Math.round(process.uptime())
    });
  });
};