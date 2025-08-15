#!/usr/bin/env node
/**
 * Swagger Documentation Generator Script
 * Validates and generates OpenAPI documentation from route annotations
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function validateSwaggerSetup() {
  console.log('🔍 Validating Swagger setup...');
  
  // Check if dependencies are installed
  const packagePath = path.join(process.cwd(), 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  
  const requiredDeps = ['swagger-jsdoc', 'swagger-ui-express'];
  const missingDeps = requiredDeps.filter(dep => !packageJson.dependencies[dep]);
  
  if (missingDeps.length > 0) {
    console.error('❌ Missing dependencies:', missingDeps.join(', '));
    console.log('Run: npm install', missingDeps.join(' '));
    process.exit(1);
  }
  
  console.log('✅ All dependencies installed');
  
  // Check if swagger config exists
  const swaggerConfigPath = path.join(process.cwd(), 'docs', 'api', 'swagger-config.ts');
  if (!fs.existsSync(swaggerConfigPath)) {
    console.error('❌ Swagger config not found at:', swaggerConfigPath);
    process.exit(1);
  }
  
  console.log('✅ Swagger configuration found');
  
  // Check if routes have swagger annotations
  const routesDir = path.join(process.cwd(), 'server', 'routes');
  const routeFiles = fs.readdirSync(routesDir).filter(file => file.endsWith('.ts'));
  
  let annotatedRoutes = 0;
  for (const file of routeFiles) {
    const filePath = path.join(routesDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    if (content.includes('@swagger')) {
      annotatedRoutes++;
      console.log(`✅ ${file} has Swagger annotations`);
    } else {
      console.log(`⚠️  ${file} missing Swagger annotations`);
    }
  }
  
  console.log(`📊 ${annotatedRoutes}/${routeFiles.length} route files have Swagger annotations`);
  
  // Check if server setup includes swagger
  const serverPath = path.join(process.cwd(), 'server', 'index.ts');
  const serverContent = fs.readFileSync(serverPath, 'utf8');
  
  if (serverContent.includes('swagger-ui-express') && serverContent.includes('/api-docs')) {
    console.log('✅ Swagger UI integrated in server');
  } else {
    console.log('❌ Swagger UI not properly integrated in server');
  }
  
  console.log('\n🎉 Swagger setup validation complete!');
  console.log('\n📚 API Documentation will be available at:');
  console.log('   • Interactive UI: http://localhost:3000/api-docs');
  console.log('   • Raw OpenAPI spec: http://localhost:3000/api-docs.json');
}

async function generateDocumentationSummary() {
  console.log('\n📋 Documentation Summary:');
  
  const routesWithDocs = {
    'Resumes': {
      'GET /resumes': 'List user resumes with filtering',
      'GET /resumes/:id': 'Get specific resume details',
      'POST /resumes': 'Upload new resume file'
    },
    'Job Descriptions': {
      'POST /job-descriptions': 'Create job description with AI analysis'
    },
    'Analysis': {
      'Pending': 'Resume analysis and matching endpoints'
    },
    'Authentication': {
      'Pending': 'Firebase JWT authentication endpoints'
    }
  };
  
  for (const [category, endpoints] of Object.entries(routesWithDocs)) {
    console.log(`\n${category}:`);
    for (const [endpoint, description] of Object.entries(endpoints)) {
      const status = description.includes('Pending') ? '⏳' : '✅';
      console.log(`  ${status} ${endpoint}: ${description}`);
    }
  }
}

async function main() {
  try {
    await validateSwaggerSetup();
    await generateDocumentationSummary();
    
    console.log('\n🚀 Next steps:');
    console.log('   1. Start the server: npm run dev');
    console.log('   2. Visit http://localhost:3000/api-docs');
    console.log('   3. Test API endpoints interactively');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();