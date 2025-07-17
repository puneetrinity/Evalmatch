#!/bin/bash
# Production Build Script for AI Search System

set -e  # Exit on error

echo "🚀 Starting production build..."

# Clean up previous builds
echo "🧹 Cleaning up..."
docker system prune -f 2>/dev/null || true

# Build the Docker image
echo "🔨 Building Docker image..."
docker build -t ai-search-system:latest . || {
    echo "❌ Docker build failed"
    exit 1
}

echo "✅ Build completed successfully!"

# Optional: Tag for registry
if [ "$1" = "push" ]; then
    echo "📤 Tagging and pushing to registry..."
    docker tag ai-search-system:latest ghcr.io/your-username/ai-search-system:latest
    docker push ghcr.io/your-username/ai-search-system:latest
    echo "✅ Image pushed to registry"
fi

echo "🎉 Production build complete!"
