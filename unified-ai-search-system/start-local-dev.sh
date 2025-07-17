#!/bin/bash

echo "🚀 Starting local development environment..."

# Start services
docker-compose -f docker-compose.local.yml up -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 30

# Pull Ollama model if needed
echo "🤖 Ensuring Ollama model is available..."
docker-compose -f docker-compose.local.yml exec ollama ollama pull phi3:mini

# Health checks
echo "🔍 Performing health checks..."
curl -f http://localhost:8001/health && echo "✅ Document service healthy"
curl -f http://localhost:8003/health && echo "✅ Chat service healthy"
curl -f http://localhost:8000/health && echo "✅ Nginx healthy"

echo "✅ Local development environment is ready!"
echo "🌐 Access points:"
echo "  - Document Service: http://localhost:8001"
echo "  - Chat Service: http://localhost:8003"
echo "  - Unified UI: http://localhost:8000"
