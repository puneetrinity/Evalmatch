#!/bin/bash
# Quick deployment script for RunPod A5000
# Run this script on your RunPod instance

set -e

echo "🚀 AI Search System - Quick RunPod Deployment"
echo "=============================================="

# Check if running on GPU instance
if ! nvidia-smi > /dev/null 2>&1; then
    echo "❌ NVIDIA GPU not detected. Please run on a GPU instance."
    exit 1
fi

echo "✅ GPU detected:"
nvidia-smi --query-gpu=gpu_name,memory.total --format=csv,noheader

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "📦 Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
    echo "✅ Docker installed"
else
    echo "✅ Docker already installed"
fi

# Check if docker-compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "📦 Installing Docker Compose..."
    curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-linux-x86_64" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    echo "✅ Docker Compose installed"
else
    echo "✅ Docker Compose already installed"
fi

# Stop any existing containers
echo "🛑 Stopping any existing AI Search containers..."
docker stop ai-search-system 2>/dev/null || true
docker rm ai-search-system 2>/dev/null || true

# Pull the latest image
echo "📥 Pulling AI Search System image..."
docker pull advancellmsearch/ai-search-system:latest

# Deploy the container
echo "🚀 Deploying AI Search System..."
docker run -d --gpus all \
  -p 8000:8000 \
  -p 11434:11434 \
  -p 6379:6379 \
  --name ai-search-system \
  --shm-size=2g \
  --restart unless-stopped \
  -e CUDA_VISIBLE_DEVICES=0 \
  -e ENVIRONMENT=production \
  -e LOG_LEVEL=INFO \
  advancellmsearch/ai-search-system:latest

echo "⏳ Waiting for services to start..."
sleep 30

# Check container status
if docker ps | grep -q ai-search-system; then
    echo "✅ Container is running"
else
    echo "❌ Container failed to start. Checking logs..."
    docker logs ai-search-system
    exit 1
fi

# Wait for health check
echo "🔍 Checking application health..."
for i in {1..12}; do
    if curl -f http://localhost:8000/health/live > /dev/null 2>&1; then
        echo "✅ Application is healthy!"
        break
    fi
    echo "Waiting for application to be ready... ($i/12)"
    sleep 10
done

# Final status check
echo ""
echo "📊 Deployment Status:"
echo "===================="

# Container status
echo "🐳 Container Status:"
docker ps | grep ai-search-system

echo ""
echo "🖥️  GPU Memory Usage:"
nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader,nounits

echo ""
echo "🌐 API Endpoints:"
echo "Health Check: http://localhost:8000/health/live"
echo "System Status: http://localhost:8000/system/status"
echo "API Documentation: http://localhost:8000/docs"
echo "Chat API: http://localhost:8000/api/v1/chat/complete"

echo ""
echo "📋 Service Status (inside container):"
docker exec ai-search-system supervisorctl status 2>/dev/null || echo "Supervisor not yet available"

echo ""
echo "🎯 Quick Test:"
echo "curl -X POST http://localhost:8000/api/v1/chat/complete \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"message\": \"Hello, test the system\", \"session_id\": \"test\", \"user_id\": \"test\"}'"

echo ""
echo "📝 View Logs:"
echo "docker logs ai-search-system"
echo "docker exec ai-search-system tail -f /workspace/logs/app.out.log"

echo ""
echo "🎉 Deployment completed successfully!"
echo "Your AI Search System is now running on RunPod A5000."