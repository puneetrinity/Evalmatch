/**
 * Deprecation Header Utility
 * 
 * Provides RFC 8594 compliant deprecation headers for legacy API endpoints.
 * Used during route migration to inform clients about upcoming changes.
 */

import type { Response } from 'express';

export interface DeprecationInfo {
  /** RFC 3339 formatted date when the endpoint was deprecated */
  deprecatedDate: string;
  /** RFC 3339 formatted date when the endpoint will be removed (optional) */
  sunsetDate?: string;
  /** URL to migration guide or new endpoint documentation */
  migrationUrl?: string;
  /** Human-readable deprecation message */
  message?: string;
}

/**
 * Adds RFC 8594 compliant deprecation headers to response
 * 
 * @param res - Express response object
 * @param info - Deprecation information
 * 
 * @example
 * ```typescript
 * addDeprecationHeaders(res, {
 *   deprecatedDate: '2024-01-15T00:00:00Z',
 *   sunsetDate: '2024-06-01T00:00:00Z',
 *   migrationUrl: 'https://docs.evalmatch.com/api/migration/v2',
 *   message: 'Use /api/v1/analyze/hybrid instead'
 * });
 * ```
 */
export function addDeprecationHeaders(res: Response, info: DeprecationInfo): void {
  // RFC 8594 Deprecation header (required)
  res.setHeader('Deprecation', `"${info.deprecatedDate}"`);
  
  // RFC 8594 Sunset header (optional)
  if (info.sunsetDate) {
    res.setHeader('Sunset', `"${info.sunsetDate}"`);
  }
  
  // Link header for migration documentation (optional)
  if (info.migrationUrl) {
    res.setHeader('Link', `<${info.migrationUrl}>; rel="deprecation"`);
  }
  
  // Warning header with human-readable message (optional)
  if (info.message) {
    // RFC 7234 Warning header format: warn-code warn-agent warn-text [warn-date]
    const warningText = info.message.replace(/"/g, '\\"');
    res.setHeader('Warning', `299 evalmatch-api "${warningText}"`);
  }
}

/**
 * Predefined deprecation configurations for common migration scenarios
 */
export const DEPRECATION_CONFIGS = {
  LEGACY_ANALYZE_TIERED: {
    deprecatedDate: '2024-01-15T00:00:00Z',
    sunsetDate: '2024-06-01T00:00:00Z',
    migrationUrl: 'https://docs.evalmatch.com/api/migration/hybrid-analysis',
    message: 'This endpoint is deprecated. Use /api/v1/analyze/hybrid for improved performance and accuracy.'
  } as DeprecationInfo,
  
  LEGACY_BATCH_TIERED: {
    deprecatedDate: '2024-01-15T00:00:00Z',
    sunsetDate: '2024-06-01T00:00:00Z',
    migrationUrl: 'https://docs.evalmatch.com/api/migration/hybrid-analysis',
    message: 'This endpoint is deprecated. Use /api/v1/analyze/batch-hybrid for improved batch processing.'
  } as DeprecationInfo
} as const;

/**
 * Middleware factory for adding deprecation headers to specific routes
 * 
 * @param config - Deprecation configuration
 * @returns Express middleware function
 * 
 * @example
 * ```typescript
 * router.get('/legacy-endpoint', 
 *   createDeprecationMiddleware(DEPRECATION_CONFIGS.LEGACY_ANALYZE_TIERED),
 *   legacyHandler
 * );
 * ```
 */
export function createDeprecationMiddleware(config: DeprecationInfo) {
  return (req: any, res: Response, next: any) => {
    addDeprecationHeaders(res, config);
    next();
  };
}