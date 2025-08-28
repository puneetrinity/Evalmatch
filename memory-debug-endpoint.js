/**
 * Memory Debug Endpoint for Railway
 * Add this to your routes to debug memory configuration
 */

const express = require('express');
const v8 = require('v8');

function createMemoryDebugRoute() {
  const router = express.Router();
  
  router.get('/api/debug/memory', (req, res) => {
    try {
      const memUsage = process.memoryUsage();
      const heapStats = v8.getHeapStatistics();
      
      const mbUsed = Math.round(memUsage.heapUsed / 1024 / 1024);
      const mbTotal = Math.round(memUsage.heapTotal / 1024 / 1024);
      const heapLimitMB = Math.round(heapStats.total_heap_size_limit / 1024 / 1024);
      const availableMB = Math.round(heapStats.total_available_size / 1024 / 1024);
      const usagePercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);
      
      const expectedHeapLimitMB = 7168;
      const nodeOptionsApplied = heapLimitMB > 2000;
      const nodeOptionsCorrect = heapLimitMB >= expectedHeapLimitMB * 0.9;
      
      res.json({
        status: nodeOptionsApplied ? (nodeOptionsCorrect ? 'success' : 'partial') : 'failed',
        timestamp: new Date().toISOString(),
        memory: {
          current: {
            heapUsed: `${mbUsed}MB`,
            heapTotal: `${mbTotal}MB`,
            usagePercent: `${usagePercent}%`,
            external: `${Math.round(memUsage.external / 1024 / 1024)}MB`,
            rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`
          },
          limits: {
            v8HeapLimit: `${heapLimitMB}MB`,
            v8Available: `${availableMB}MB`,
            expectedLimit: `${expectedHeapLimitMB}MB`,
            nodeOptionsApplied,
            nodeOptionsCorrect
          }
        },
        configuration: {
          nodeOptions: process.env.NODE_OPTIONS || 'NOT SET',
          nodeVersion: process.version,
          platform: process.platform,
          railwayEnv: !!process.env.RAILWAY_ENVIRONMENT,
          workingDir: process.cwd()
        },
        verdict: {
          success: nodeOptionsApplied && nodeOptionsCorrect,
          message: !nodeOptionsApplied 
            ? 'NODE_OPTIONS is not being applied - using Node.js defaults'
            : !nodeOptionsCorrect
              ? `NODE_OPTIONS partially applied - got ${heapLimitMB}MB instead of ${expectedHeapLimitMB}MB`
              : 'NODE_OPTIONS successfully applied - memory configuration working correctly'
        }
      });
      
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: 'Failed to get memory information',
        error: error.message
      });
    }
  });
  
  return router;
}

module.exports = { createMemoryDebugRoute };