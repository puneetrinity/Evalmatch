#!/bin/bash
# PRODUCTION DOCKER BUILD SCRIPT - WITH ALL CRITICAL FIXES
# Run this script to build and push the corrected Docker image

echo "🔧 Building production Docker image with all critical fixes..."
echo "📋 This build includes:"
echo "   ✅ Fixed supervisor configs using /var/log/supervisor/ paths"
echo "   ✅ Eliminated all /app/logs references"
echo "   ✅ Fixed authentication duplicate functions"
echo "   ✅ Added memory leak prevention"
echo "   ✅ Fixed cache collisions with SHA256"
echo "   ✅ Added rate limiter memory controls"
echo "   ✅ Made health checks non-blocking"
echo "   ✅ Added model selection caching"
echo "   ✅ Runtime verification and fallback scripts"
echo ""

# Check if Docker is running
if ! docker ps >/dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop and try again."
    exit 1
fi

# Build the image
echo "🚀 Building Docker image..."
docker build -f Dockerfile.runpod -t puneetrinity/ai-search-system:v2.2-critical-fixes .

if [ $? -ne 0 ]; then
    echo "❌ Docker build failed!"
    exit 1
fi

# Tag as latest
echo "🏷️ Tagging as latest..."
docker tag puneetrinity/ai-search-system:v2.2-critical-fixes puneetrinity/ai-search-system:latest

# Push to registry
echo "📤 Pushing to Docker Hub..."
docker push puneetrinity/ai-search-system:v2.2-critical-fixes
docker push puneetrinity/ai-search-system:latest

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ PRODUCTION IMAGE READY!"
    echo "🎯 Image: puneetrinity/ai-search-system:v2.2-critical-fixes"
    echo "📝 This image includes all critical security and performance fixes"
    echo ""
    echo "🚀 Deploy on RunPod using:"
    echo "   Image: puneetrinity/ai-search-system:latest"
    echo "   Port: 8000"
    echo "   Environment: GPU-enabled"
    echo ""
    echo "🔍 After deployment, verify with:"
    echo "   curl http://YOUR_RUNPOD_URL:8000/health/live"
    echo "   curl http://YOUR_RUNPOD_URL:8000/health/ready"
    echo ""
    echo "🎯 FIXES INCLUDED:"
    echo "   • No more /app/logs/api.log errors"
    echo "   • Authentication system stability"
    echo "   • Memory leak prevention"
    echo "   • Performance improvements"
    echo "   • Resource cleanup"
else
    echo "❌ Docker push failed!"
    exit 1
fi
