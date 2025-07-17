#!/bin/bash
# RunPod startup script for AI Search System
# Initializes GPU, starts services, and ensures system readiness

set -e

echo "🚀 Starting AI Search System on RunPod..."

# Create log directory
mkdir -p /workspace/logs

# Initialize GPU and CUDA
echo "🔧 Initializing GPU..."
nvidia-smi
echo "CUDA_VISIBLE_DEVICES: $CUDA_VISIBLE_DEVICES"

# Set up environment variables for RunPod
export REDIS_URL="redis://localhost:6379"
export OLLAMA_HOST="http://localhost:11434"
export ENVIRONMENT="production"
export API_HOST="0.0.0.0"
export API_PORT="8000"

# Start Redis in background first
echo "📦 Starting Redis..."
redis-server --bind 0.0.0.0 --port 6379 --daemonize yes --logfile /workspace/logs/redis-startup.log

# Wait for Redis to be ready
echo "⏳ Waiting for Redis..."
until redis-cli ping > /dev/null 2>&1; do
    echo "Redis not ready, waiting..."
    sleep 2
done
echo "✅ Redis is ready"

# Start Ollama service
echo "🤖 Starting Ollama..."
ollama serve &
OLLAMA_PID=$!

# Wait for Ollama to be ready
echo "⏳ Waiting for Ollama..."
until curl -f http://localhost:11434/api/version > /dev/null 2>&1; do
    echo "Ollama not ready, waiting..."
    sleep 3
done
echo "✅ Ollama is ready"

# Pull recruitment models in background
echo "📥 Pulling recruitment models in background..."
/workspace/init-models.sh &

# Test system health
echo "🔍 Testing system health..."
python3 -c "
import redis
import httpx
import sys

# Test Redis
try:
    r = redis.Redis(host='localhost', port=6379, decode_responses=True)
    r.ping()
    print('✅ Redis connection successful')
except Exception as e:
    print(f'❌ Redis connection failed: {e}')
    sys.exit(1)

# Test Ollama
try:
    import httpx
    response = httpx.get('http://localhost:11434/api/version', timeout=10)
    if response.status_code == 200:
        print('✅ Ollama connection successful')
    else:
        print(f'❌ Ollama returned status: {response.status_code}')
        sys.exit(1)
except Exception as e:
    print(f'❌ Ollama connection failed: {e}')
    sys.exit(1)

print('🎯 All services ready for AI Search System!')
"

if [ $? -eq 0 ]; then
    echo "✅ System health check passed"
else
    echo "❌ System health check failed"
    exit 1
fi

# Execute the command passed to the container
echo "🎯 Starting main application..."
exec "$@"