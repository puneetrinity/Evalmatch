/**
 * Jest Configuration for Test Sharding
 * Enables parallel test execution with proper isolation
 */

import baseConfig from './jest.config.mjs';

// Get shard information from environment variables
const shardIndex = parseInt(process.env.JEST_SHARD_INDEX || '1', 10);
const totalShards = parseInt(process.env.JEST_TOTAL_SHARDS || '1', 10);

export default {
  ...baseConfig,
  
  // Shard configuration
  shard: totalShards > 1 ? `${shardIndex}/${totalShards}` : undefined,
  
  // Enhanced isolation settings
  maxWorkers: 2, // Limit workers per shard to prevent memory issues
  workerIdleMemoryLimit: '512MB', // Kill idle workers to free memory
  
  // Ensure test isolation
  testEnvironmentOptions: {
    ...baseConfig.testEnvironmentOptions,
    // Each test gets a fresh environment
    testEnvironmentContext: {
      shard: shardIndex,
      totalShards: totalShards
    }
  },
  
  // Use unique cache directories per shard
  cacheDirectory: `<rootDir>/.jest-cache/shard-${shardIndex}`,
  
  // Unique coverage directory per shard
  coverageDirectory: `<rootDir>/coverage/shard-${shardIndex}`,
  
  // Test isolation globals
  globals: {
    ...baseConfig.globals,
    __SHARD__: shardIndex,
    __TOTAL_SHARDS__: totalShards
  },
  
  // Add shard info to test results
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: './test-results',
        outputName: `junit-shard-${shardIndex}.xml`,
        classNameTemplate: '{classname}-shard-' + shardIndex,
        titleTemplate: '{title}',
        ancestorSeparator: ' › ',
        usePathForSuiteName: 'true',
        addFileAttribute: 'true'
      }
    ]
  ]
};