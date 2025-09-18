#!/usr/bin/env tsx
/**
 * Export OpenAPI Specification Script
 * 
 * Exports the JSDoc-driven Swagger spec from server config to docs/api/
 * This ensures a single source of truth with no drift between code and spec.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';

// Import the Swagger spec from our server config
import { swaggerSpec } from '../server/config/swagger-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Ensure docs/api directory exists
const docsApiDir = join(projectRoot, 'docs', 'api');
mkdirSync(docsApiDir, { recursive: true });

// Export paths
const jsonPath = join(docsApiDir, 'openapi.json');
const yamlPath = join(docsApiDir, 'openapi.yaml');

console.log('🔄 Exporting OpenAPI specification...');

try {
  // Filter out x-internal tagged endpoints for public spec
  const publicSpec = filterInternalEndpoints(swaggerSpec);
  
  // Write JSON spec
  writeFileSync(jsonPath, JSON.stringify(publicSpec, null, 2));
  console.log(`✅ JSON spec exported to: ${jsonPath}`);
  
  // Write YAML spec  
  const yamlContent = YAML.stringify(publicSpec, { 
    lineWidth: 120,
    minContentWidth: 80 
  });
  writeFileSync(yamlPath, yamlContent);
  console.log(`✅ YAML spec exported to: ${yamlPath}`);
  
  // Validate the exported spec
  const validation = validateSpec(publicSpec);
  if (validation.errors.length > 0) {
    console.warn('⚠️  Spec validation warnings:');
    validation.errors.forEach(error => console.warn(`   - ${error}`));
  }
  
  console.log(`📊 Exported spec contains:`);
  console.log(`   - ${Object.keys(publicSpec.paths || {}).length} endpoints`);
  console.log(`   - ${Object.keys(publicSpec.components?.schemas || {}).length} schemas`);
  console.log(`   - ${Object.keys(publicSpec.components?.responses || {}).length} response types`);
  
} catch (error) {
  console.error('❌ Failed to export OpenAPI spec:', error);
  process.exit(1);
}

/**
 * Filter out internal endpoints marked with x-internal tag
 */
function filterInternalEndpoints(spec: any) {
  const publicSpec = JSON.parse(JSON.stringify(spec)); // Deep clone
  
  // Filter out internal tags
  if (publicSpec.tags) {
    publicSpec.tags = publicSpec.tags.filter((tag: any) => !tag['x-internal']);
  }
  
  // Filter out paths with internal tags
  if (publicSpec.paths) {
    const internalOpsFound: string[] = [];
    
    Object.keys(publicSpec.paths).forEach(path => {
      Object.keys(publicSpec.paths[path]).forEach(method => {
        const operation = publicSpec.paths[path][method];
        if (operation.tags?.some((tag: string) => 
          publicSpec.tags?.find((t: any) => t.name === tag && t['x-internal'])
        )) {
          internalOpsFound.push(`${method.toUpperCase()} ${path}`);
          delete publicSpec.paths[path][method];
        }
      });
      
      // Remove empty path objects
      if (Object.keys(publicSpec.paths[path]).length === 0) {
        delete publicSpec.paths[path];
      }
    });
    
    // Defense-in-depth: Log filtered internal operations
    if (internalOpsFound.length > 0) {
      console.log(`🔒 Filtered ${internalOpsFound.length} internal operations from public spec:`);
      internalOpsFound.forEach(op => console.log(`   - ${op}`));
    }
  }
  
  return publicSpec;
}

/**
 * Basic spec validation
 */
function validateSpec(spec: any) {
  const errors: string[] = [];
  
  if (!spec.openapi) errors.push('Missing openapi version');
  if (!spec.info?.title) errors.push('Missing API title');
  if (!spec.info?.version) errors.push('Missing API version');
  if (!spec.paths || Object.keys(spec.paths).length === 0) {
    errors.push('No public endpoints found');
  }
  
  // Validate required public endpoints are present
  const requiredEndpoints = [
    '/resumes',
    '/analysis/analyze/{jobId}', 
    '/analysis/analyze-bias/{jobId}',
    '/credits/balance',
    '/health'
  ];
  
  requiredEndpoints.forEach(endpoint => {
    if (!spec.paths[endpoint]) {
      errors.push(`Missing required endpoint: ${endpoint}`);
    }
  });
  
  return { errors };
}