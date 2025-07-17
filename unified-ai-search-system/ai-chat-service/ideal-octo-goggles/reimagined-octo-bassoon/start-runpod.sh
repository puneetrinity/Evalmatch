#!/bin/bash
# RunPod Startup Script for AI Search System

set -e

echo "🚀 Starting AI Search System on RunPod..."

# Set up environment
export PYTHONPATH=/app
export OLLAMA_HOST=${OLLAMA_HOST:-http://localhost:11434}
export REDIS_URL=${REDIS_URL:-redis://localhost:6379}

# Create log directory
mkdir -p /var/log/supervisor

# Start Ollama in background (if not already running)
if ! pgrep -f ollama >/dev/null 2>&1; then
    echo "🦙 Starting Ollama..."
    ollama serve > /var/log/supervisor/ollama.log 2>&1 &
    sleep 10
    
    # Pull essential models
    echo "📚 Pulling essential models..."
    ollama pull llama2:7b-chat || echo "⚠️ Failed to pull llama2:7b-chat"
    ollama pull codellama:7b-instruct || echo "⚠️ Failed to pull codellama:7b-instruct"
fi

# Start Redis (if not already running)
if ! pgrep -f redis-server >/dev/null 2>&1; then
    echo "🗄️ Starting Redis..."
    redis-server --daemonize yes --logfile /var/log/supervisor/redis.log
fi

# Validate startup
echo "🔍 Running startup validation..."
python /app/scripts/validate_startup.py || {
    echo "❌ Startup validation failed, but continuing..."
}

# Start the main application
echo "🌟 Starting FastAPI application..."
exec uvicorn app.main:app --host 0.0.0.0 --port ${RUNPOD_TCP_PORT_8000:-8000} --workers 1
