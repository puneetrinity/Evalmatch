#!/usr/bin/env node

/**
 * Generate TypeScript SDK using @hey-api/openapi-ts
 * Modern, fast, and actively maintained OpenAPI generator
 */

import { createConfig, generate } from '@hey-api/openapi-ts';
import fs from 'fs';
import path from 'path';

const config = createConfig({
  input: './docs/api/openapi.yaml',
  output: './sdks/typescript/src/generated',
  client: {
    name: '@hey-api/client-axios', // Use Axios client for better compatibility
  },
  types: {
    dates: 'types+transform', // Handle dates properly
    enums: 'typescript', // Use TypeScript enums
  },
  plugins: [
    '@hey-api/typescript',
    '@hey-api/schemas',
    '@hey-api/services',
  ],
});

console.log('🚀 Generating EvalMatch TypeScript SDK with Hey API...');
console.log('📂 Input:', config.input);
console.log('📁 Output:', config.output);

try {
  // Ensure output directory exists
  fs.mkdirSync(path.dirname(config.output), { recursive: true });
  
  // Generate the SDK
  await generate(config);
  
  console.log('✅ TypeScript SDK generated successfully!');
  console.log('📊 Generated files:');
  
  const files = fs.readdirSync(config.output);
  files.forEach(file => {
    const stats = fs.statSync(path.join(config.output, file));
    console.log(`   ${file} (${Math.round(stats.size / 1024)}KB)`);
  });
  
  console.log('\n🎉 SDK generation complete!');
  console.log('📋 Next steps:');
  console.log('   1. Review generated code in ./sdks/typescript/src/generated/');
  console.log('   2. Create package.json for the SDK');
  console.log('   3. Add Firebase authentication wrapper');
  console.log('   4. Write tests and documentation');
  
} catch (error) {
  console.error('❌ SDK generation failed:', error.message);
  process.exit(1);
}