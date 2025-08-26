/**
 * API Versioning Middleware
 * Handles version detection, deprecation warnings, and future-proofing
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';

/**
 * Add deprecation headers and warnings for legacy API routes
 */
export function legacyApiDeprecationMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Check if this is a legacy API route (not /api/v1/*)
  const isLegacyRoute = req.path.startsWith('/api/') && !req.path.startsWith('/api/v1/');
  
  if (isLegacyRoute) {
    // Add deprecation headers
    res.header('Deprecation', 'true');
    res.header('Sunset', '2025-12-31'); // Give users 1 year to migrate
    res.header('Link', '</api/v1' + req.path.replace('/api', '') + '>; rel="successor-version"');
    res.header('Warning', '299 - "This API version is deprecated. Please use /api/v1/* endpoints."');
    
    // Log deprecation usage for monitoring
    if (process.env.NODE_ENV === 'development') {
      logger.warn('Legacy API usage detected', {
        path: req.path,
        method: req.method,
        userAgent: req.headers['user-agent'],
        ip: req.ip,
        successorPath: '/api/v1' + req.path.replace('/api', '')
      });
    }
  }
  
  next();
}

/**
 * Add API version information to response headers
 */
export function apiVersionMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Determine API version from path
  const apiVersion = req.path.startsWith('/api/v1/') ? 'v1' : 'legacy';
  
  // Add version headers
  res.header('API-Version', apiVersion);
  res.header('X-API-Version', apiVersion);
  
  // Add supported versions
  res.header('X-Supported-Versions', 'v1');
  
  next();
}

/**
 * Combined middleware for API versioning and deprecation
 */
export function apiVersioningMiddleware(req: Request, res: Response, next: NextFunction): void {
  apiVersionMiddleware(req, res, () => {
    legacyApiDeprecationMiddleware(req, res, next);
  });
}