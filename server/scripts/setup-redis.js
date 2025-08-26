#!/usr/bin/env node

/**
 * PERFORMANCE: Redis setup script
 * Checks Redis availability and configures caching
 */

const Redis = require('ioredis');

async function setupRedis() {
  console.log('🔧 Setting up Redis cache...');
  
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  
  try {
    const redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      enableOfflineQueue: false,
    });

    await redis.connect();
    await redis.ping();
    
    console.log('✅ Redis connected successfully');
    console.log(`📊 Redis URL: ${redisUrl}`);
    
    // Set test cache entry
    await redis.setex('test:setup', 60, JSON.stringify({
      timestamp: new Date().toISOString(),
      message: 'Redis cache is working'
    }));
    
    const testValue = await redis.get('test:setup');
    if (testValue) {
      console.log('✅ Redis read/write test passed');
    }
    
    // Show Redis info
    const info = await redis.info('stats');
    const lines = info.split('\r\n');
    const version = lines.find(l => l.startsWith('redis_version:'));
    
    if (version) {
      console.log(`📈 ${version}`);
    }
    
    await redis.quit();
    console.log('✅ Redis setup complete!');
    
  } catch (error) {
    console.warn('⚠️  Redis not available, cache will be disabled');
    console.warn(`Error: ${error.message}`);
    console.log('');
    console.log('💡 To enable Redis cache:');
    console.log('1. Install Redis: https://redis.io/docs/install/');
    console.log('2. Start Redis server: redis-server');
    console.log('3. Or set REDIS_URL environment variable');
    console.log('');
    console.log('Application will work without Redis (just slower)');
    process.exit(0); // Don't fail the build
  }
}

setupRedis();