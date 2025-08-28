#!/bin/bash

# TypeScript SDK Generation Script for EvalMatch API
# Using @hey-api/openapi-ts - modern, fast, and actively maintained

set -e

echo "🚀 Generating EvalMatch TypeScript SDK with Hey API..."

# Clean previous generation
rm -rf ./sdks/typescript/src/generated
mkdir -p ./sdks/typescript/src

# Generate TypeScript SDK with Hey API
npx @hey-api/openapi-ts \
  --input ./docs/api/openapi.yaml \
  --output ./sdks/typescript/src/generated \
  --client @hey-api/client-axios

echo "✅ TypeScript SDK generated successfully!"

# Show generated files
echo "📊 Generated files:"
ls -la ./sdks/typescript/src/generated/ | head -10

echo ""
echo "🎉 TypeScript SDK generation complete!"
echo "📋 Next steps:"
echo "   1. Review generated code in ./sdks/typescript/src/generated/"
echo "   2. Create package.json for the SDK"
echo "   3. Add Firebase authentication wrapper"
echo "   4. Write tests and documentation"