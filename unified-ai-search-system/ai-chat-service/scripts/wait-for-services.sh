#!/bin/bash
# Wait for services to be ready before proceeding

set -e

echo "Waiting for services to be ready..."

# Wait for Redis
echo "Waiting for Redis..."
while ! redis-cli ping >/dev/null 2>&1; do
    echo "Redis not ready, waiting..."
    sleep 2
done
echo "✓ Redis is ready"

# Wait for Ollama
echo "Waiting for Ollama..."
for i in {1..30}; do
    if curl -f http://localhost:11434/api/version >/dev/null 2>&1; then
        echo "✓ Ollama is ready"
        break
    fi
    echo "Ollama not ready, waiting... ($i/30)"
    sleep 3
done

# Wait for FastAPI
echo "Waiting for FastAPI..."
for i in {1..20}; do
    if curl -f http://localhost:8000/health/live >/dev/null 2>&1; then
        echo "✓ FastAPI is ready"
        break
    fi
    echo "FastAPI not ready, waiting... ($i/20)"
    sleep 3
done

echo "All services are ready!"

# Now start model initialization
echo "Starting model initialization..."
supervisorctl start model-init
