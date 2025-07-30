/**
 * New Modular Route Registration System
 * 
 * This file replaces the monolithic routes.ts with a clean, modular approach.
 * Routes are now organized by domain and imported from separate modules.
 */

import { Express } from "express";
import { registerModularRoutes, getRoutesSummary } from './routes';
import { logger } from "./lib/logger";

/**
 * Register all application routes using the new modular system
 */
export function registerRoutes(app: Express) {
  logger.info('🔄 Registering routes using new modular system...');
  
  try {
    // Register all modular routes
    registerModularRoutes(app);
    
    // Log route registration summary
    const summary = getRoutesSummary();
    logger.info('✅ Route registration completed', {
      system: 'modular',
      totalModules: summary.totalModules,
      estimatedRoutes: summary.estimatedRoutes,
      modules: summary.modules
    });
    
    // Add a route to show the migration status
    app.get('/api/routes-info', (req, res) => {
      res.json({
        status: 'ok',
        message: 'Using new modular route system',
        system: 'modular',
        migrationDate: '2025-01-30',
        ...summary,
        benefits: [
          'Reduced code complexity (2691 lines → ~300 lines per module)',
          'Better separation of concerns',
          'Easier testing and maintenance',
          'Improved developer experience',
          'Better error isolation'
        ]
      });
    });
    
  } catch (error) {
    logger.error('❌ Route registration failed:', error);
    throw new Error(`Route registration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}