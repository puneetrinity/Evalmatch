#!/bin/bash

# Docker Build Debug Script
# This script helps diagnose npm installation issues in Docker builds

echo "🔍 Docker Build Debugging Script"
echo "================================="

# Check system requirements
echo "📋 System Requirements Check:"
echo "Node.js version: $(node --version)"
echo "npm version: $(npm --version)"
echo "Available memory: $(free -h | grep '^Mem:' | awk '{print $2}')"
echo "Available disk space: $(df -h . | tail -1 | awk '{print $4}')"

# Check package.json for problematic dependencies
echo ""
echo "🔍 Checking for problematic dependencies:"
echo "Native compilation packages found:"
grep -E "(canvas|bufferutil|@xenova|sharp|node-gyp)" package.json || echo "None found"

echo ""
echo "Optional dependencies:"
grep -A 10 "optionalDependencies" package.json || echo "None found"

# Test npm install locally first
echo ""
echo "🧪 Testing npm install locally (first 10 lines):"
timeout 30s npm install --dry-run --legacy-peer-deps 2>&1 | head -10

# Check for lockfile consistency
echo ""
echo "📦 Package lockfile status:"
if [ -f "package-lock.json" ]; then
    echo "✅ package-lock.json exists"
    echo "Lockfile version: $(grep '"lockfileVersion"' package-lock.json)"
else
    echo "❌ package-lock.json missing"
fi

# Environment variable recommendations
echo ""
echo "🔧 Recommended Docker ENV variables for npm install:"
echo "ENV NPM_CONFIG_LEGACY_PEER_DEPS=true"
echo "ENV PYTHON=/usr/bin/python3"
echo "ENV NODE_OPTIONS='--max-old-space-size=4096'"
echo "ENV NPM_CONFIG_TIMEOUT=600000"

# Docker layer recommendations
echo ""
echo "🐳 Docker optimization recommendations:"
echo "1. Install build dependencies: build-essential, python3-dev, libcairo2-dev"
echo "2. Use .dockerignore to exclude node_modules, .git, etc."
echo "3. Copy package*.json before other files for better caching"
echo "4. Use npm ci instead of npm install when possible"
echo "5. Add timeout and memory limits to npm commands"

# Check for .dockerignore
echo ""
echo "📁 Docker ignore file:"
if [ -f ".dockerignore" ]; then
    echo "✅ .dockerignore exists"
    echo "Contents:"
    cat .dockerignore | head -5
    echo "..."
else
    echo "❌ .dockerignore missing - creating recommended version"
    cat > .dockerignore << 'EOF'
node_modules
npm-debug.log*
.git
.gitignore
README.md
.env
.nyc_output
coverage
.DS_Store
*.log
build
dist
uploads
EOF
    echo "✅ Created .dockerignore file"
fi

echo ""
echo "🚀 To test the Docker build:"
echo "docker build -f Dockerfile.railway -t evalmatch-test ."
echo ""
echo "💡 If build fails, try the alternative Dockerfile:"
echo "docker build -f Dockerfile.railway.alternative -t evalmatch-test ."