#!/bin/bash
# Build script for RunPod deployment
# This builds the Docker image with Ollama integration

set -e

echo "🚀 Building AI Search System for RunPod"
echo "======================================="

# Configuration
IMAGE_NAME="ai-search-system"
TAG="runpod-latest"
DOCKERFILE="Dockerfile.runpod"

# Build arguments
BUILD_TIME=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
VERSION=$(git describe --tags --always 2>/dev/null || echo "dev")

echo "📦 Build Information:"
echo "   Image: $IMAGE_NAME:$TAG"
echo "   Dockerfile: $DOCKERFILE"
echo "   Build Time: $BUILD_TIME"
echo "   Git Commit: $GIT_COMMIT"
echo "   Version: $VERSION"
echo ""

# Check if Dockerfile exists
if [[ ! -f "$DOCKERFILE" ]]; then
    echo "❌ Dockerfile not found: $DOCKERFILE"
    exit 1
fi

# Build the image
echo "🔨 Building Docker image..."
docker build \
    -f "$DOCKERFILE" \
    -t "$IMAGE_NAME:$TAG" \
    --build-arg BUILDTIME="$BUILD_TIME" \
    --build-arg VERSION="$VERSION" \
    --build-arg REVISION="$GIT_COMMIT" \
    --progress=plain \
    .

echo "✅ Build completed successfully!"

# Show image info
echo "📊 Image Information:"
docker images "$IMAGE_NAME:$TAG"

# Optional: Test the image
read -p "🧪 Do you want to test the image locally? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🧪 Testing image locally..."
    
    # Stop any existing container
    docker stop ai-search-test 2>/dev/null || true
    docker rm ai-search-test 2>/dev/null || true
    
    # Run the container
    echo "🚀 Starting container..."
    docker run \
        --name ai-search-test \
        -p 8000:8000 \
        -p 11434:11434 \
        -e ENVIRONMENT=testing \
        -d \
        "$IMAGE_NAME:$TAG"
    
    echo "⏳ Waiting for services to start..."
    sleep 30
    
    # Test health endpoint
    echo "🔍 Testing health endpoint..."
    if curl -f http://localhost:8000/health; then
        echo "✅ Health check passed!"
    else
        echo "❌ Health check failed!"
        docker logs ai-search-test --tail 50
    fi
    
    echo "🔍 Container logs:"
    docker logs ai-search-test --tail 20
    
    echo "🧹 Cleaning up test container..."
    docker stop ai-search-test
    docker rm ai-search-test
fi

# Optional: Push to registry
read -p "📤 Do you want to push to Docker Hub? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "📤 Pushing to Docker Hub..."
    
    # Tag for Docker Hub
    docker tag "$IMAGE_NAME:$TAG" "your-dockerhub-username/$IMAGE_NAME:$TAG"
    
    echo "🔐 Please make sure you're logged in to Docker Hub:"
    echo "   docker login"
    echo ""
    
    read -p "Continue with push? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker push "your-dockerhub-username/$IMAGE_NAME:$TAG"
        echo "✅ Image pushed successfully!"
        echo "🔗 Pull command: docker pull your-dockerhub-username/$IMAGE_NAME:$TAG"
    fi
fi

echo ""
echo "🎉 Build script completed!"
echo "📝 Next steps:"
echo "   1. Test the image locally if you haven't already"
echo "   2. Push to your container registry"
echo "   3. Deploy to RunPod using the image"
echo ""
echo "🚀 RunPod deployment command:"
echo "   Use image: your-dockerhub-username/$IMAGE_NAME:$TAG"
echo "   Ports: 8000 (API), 11434 (Ollama)"
echo "   GPU: Required for Ollama"