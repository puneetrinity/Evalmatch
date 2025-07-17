#!/bin/bash
# Service health check and startup verification script

set -e

echo "=== Service Health Check Script ==="
echo "Checking all services are running properly..."

# Function to check if a service is responding
check_service() {
    local service_name=$1
    local url=$2
    local max_attempts=$3
    local delay=$4
    
    echo "Checking $service_name at $url..."
    
    for i in $(seq 1 $max_attempts); do
        if curl -f -s "$url" > /dev/null 2>&1; then
            echo "✅ $service_name is responding"
            return 0
        fi
        echo "⏳ $service_name not ready yet (attempt $i/$max_attempts)"
        sleep $delay
    done
    
    echo "❌ $service_name failed to respond after $max_attempts attempts"
    return 1
}

# Function to check if Ollama models are loaded
check_ollama_models() {
    echo "Checking Ollama models..."
    
    if ! curl -f -s http://localhost:11434/api/tags > /dev/null 2>&1; then
        echo "❌ Cannot connect to Ollama API"
        return 1
    fi
    
    models=$(curl -s http://localhost:11434/api/tags | jq -r '.models[].name' 2>/dev/null || echo "")
    
    if [ -z "$models" ]; then
        echo "⚠️ No models loaded in Ollama yet"
        return 1
    fi
    
    echo "✅ Ollama models loaded:"
    echo "$models" | sed 's/^/  - /'
    return 0
}

# Wait for supervisor to be ready
sleep 5

# Check Redis
check_service "Redis" "redis://localhost:6379" 10 2 || {
    echo "❌ Redis health check failed"
    supervisorctl status redis || echo "Redis not in supervisor"
}

# Check Ollama
check_service "Ollama" "http://localhost:11434/api/version" 30 3 || {
    echo "❌ Ollama health check failed"
    supervisorctl status ollama || echo "Ollama not in supervisor"
}

# Check if models are loading
sleep 5
check_ollama_models || echo "⚠️ Models not loaded yet, this is normal during first startup"

# Check FastAPI app
check_service "FastAPI" "http://localhost:8000/health/live" 20 3 || {
    echo "❌ FastAPI health check failed"
    supervisorctl status ai-search-app || echo "FastAPI app not in supervisor"
}

echo ""
echo "=== Final Status ==="
supervisorctl status
echo ""
echo "=== Service URLs ==="
echo "  - FastAPI: http://localhost:8000"
echo "  - Ollama: http://localhost:11434"
echo "  - Redis: redis://localhost:6379"
echo ""
echo "Health check complete!"
