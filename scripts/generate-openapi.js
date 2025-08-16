#!/usr/bin/env node

/**
 * Generate OpenAPI YAML spec from Swagger configuration
 */

import { swaggerSpec } from '../server/config/swagger-config.ts';
import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';

// Ensure docs/api directory exists
const apiDocsDir = './docs/api';
fs.mkdirSync(apiDocsDir, { recursive: true });

// Convert to YAML and save
const yamlStr = yaml.dump(swaggerSpec, { 
  lineWidth: -1,
  noArrayIndent: true,
  skipInvalid: true
});

const outputPath = path.join(apiDocsDir, 'openapi.yaml');
fs.writeFileSync(outputPath, yamlStr);

console.log('✅ OpenAPI spec exported to', outputPath);
console.log('📊 Spec contains', Object.keys(swaggerSpec.paths || {}).length, 'API paths');
console.log('🏷️  API version:', swaggerSpec.info?.version);
console.log('📝 API title:', swaggerSpec.info?.title);

// Show summary of endpoints
const paths = swaggerSpec.paths || {};
const endpoints = [];
Object.keys(paths).forEach(path => {
  Object.keys(paths[path]).forEach(method => {
    if (method !== 'parameters') {
      endpoints.push(`${method.toUpperCase()} ${path}`);
    }
  });
});

console.log('\n📋 Discovered API endpoints:');
endpoints.forEach(endpoint => console.log('  ', endpoint));

console.log('\n🚀 Ready for SDK generation!');