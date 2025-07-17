#!/bin/bash
# Build and push Docker image to DockerHub for RunPod deployment

set -e

# Configuration
IMAGE_NAME="advancellmsearch/ai-search-system"
TAG="runpod-latest"
FULL_IMAGE="${IMAGE_NAME}:${TAG}"

echo "🐋 Building and pushing AI Search System Docker image for RunPod..."
echo "Image: $FULL_IMAGE"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if logged into DockerHub
if ! docker info | grep -q "Username"; then
    echo "⚠️ Not logged into DockerHub. Please login first:"
    echo "docker login"
    exit 1
fi

# Build the image
echo "🔨 Building Docker image..."
docker build -f Dockerfile.runpod -t $FULL_IMAGE .

if [ $? -eq 0 ]; then
    echo "✅ Docker image built successfully"
else
    echo "❌ Docker build failed"
    exit 1
fi

# Test the image locally (basic smoke test)
echo "🧪 Running smoke test..."
docker run --rm -d --name ai-search-test $FULL_IMAGE sleep 60

# Wait a moment for services to start
sleep 10

# Check if container is running
if docker ps | grep -q ai-search-test; then
    echo "✅ Container smoke test passed"
    docker stop ai-search-test
else
    echo "❌ Container smoke test failed"
    exit 1
fi

# Push to DockerHub
echo "📤 Pushing to DockerHub..."
docker push $FULL_IMAGE

if [ $? -eq 0 ]; then
    echo "✅ Image pushed successfully to DockerHub"
else
    echo "❌ Docker push failed"
    exit 1
fi

# Also tag as latest
docker tag $FULL_IMAGE "${IMAGE_NAME}:latest"
docker push "${IMAGE_NAME}:latest"

echo ""
echo "🎯 Deployment Information:"
echo "================================"
echo "DockerHub Image: $FULL_IMAGE"
echo "Latest Tag: ${IMAGE_NAME}:latest"
echo ""
echo "🚀 RunPod Deployment Command:"
echo "docker run -d --gpus all -p 8000:8000 --name ai-search $FULL_IMAGE"
echo ""
echo "📋 Or using docker-compose:"
echo "docker-compose -f docker-compose.runpod.yml up -d"
echo ""
echo "🔗 Access the application at: http://localhost:8000"
echo "📊 Health check: http://localhost:8000/health/live"
echo "📖 API docs: http://localhost:8000/docs"

# Display image information
echo ""
echo "📦 Image Information:"
docker images | grep $IMAGE_NAME

echo ""
echo "✅ Build and push completed successfully!"