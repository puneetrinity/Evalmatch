#!/bin/bash
# Container startup script for production deployment
set -e

echo "🚀 Starting AI Search System - Production Container"
echo "================================================="

# Create necessary directories
mkdir -p /workspace/logs /workspace/data /workspace/models

# Set environment variables
export REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
export OLLAMA_HOST="${OLLAMA_HOST:-http://localhost:11434}"
export ENVIRONMENT="${ENVIRONMENT:-production}"
export API_HOST="${API_HOST:-0.0.0.0}"
export API_PORT="${API_PORT:-8000}"

echo "✅ Environment configured:"
echo "  - Redis: $REDIS_URL"
echo "  - Ollama: $OLLAMA_HOST"
echo "  - Environment: $ENVIRONMENT"
echo "  - API: $API_HOST:$API_PORT"

# Initialize models in background if not already done
if [ ! -f "/workspace/models/.initialized" ]; then
    echo "🔄 Initializing models in background..."
    ./init-models.sh &
fi

# Start supervisor or the provided command
echo "🎯 Starting services with supervisor..."
exec "$@"