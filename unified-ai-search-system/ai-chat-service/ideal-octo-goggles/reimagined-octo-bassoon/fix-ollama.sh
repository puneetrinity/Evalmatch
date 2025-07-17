#!/bin/bash
# Quick fix script for Ollama startup issues

echo "=== Ollama Quick Fix Script ==="

# Stop any existing ollama processes
echo "1. Stopping existing Ollama processes..."
pkill ollama || echo "No existing Ollama processes"
supervisorctl stop ollama || echo "Ollama not running in supervisor"
sleep 3

# Check if port is still occupied
echo "2. Checking port 11434..."
if netstat -tulpn | grep 11434; then
    echo "Port 11434 still occupied, trying to free it..."
    fuser -k 11434/tcp || echo "Could not kill process on port 11434"
    sleep 2
fi

# Set proper environment variables
echo "3. Setting environment variables..."
export OLLAMA_HOST="0.0.0.0:11434"
export CUDA_VISIBLE_DEVICES="0"
export OLLAMA_MODELS="/root/.ollama/models"

# Create ollama directories if they don't exist
echo "4. Creating Ollama directories..."
mkdir -p /root/.ollama/models
chown -R root:root /root/.ollama

# Start Ollama via supervisor
echo "5. Starting Ollama via supervisor..."
supervisorctl start ollama

# Wait for startup
echo "6. Waiting for Ollama to start..."
for i in {1..30}; do
    if curl -s http://localhost:11434/api/version > /dev/null 2>&1; then
        echo "✅ Ollama is now responding on port 11434!"
        break
    fi
    echo "Waiting... ($i/30)"
    sleep 2
done

# Test the API
echo "7. Testing Ollama API..."
curl -s http://localhost:11434/api/version || echo "❌ Ollama still not responding"

# Check what models are available
echo "8. Checking available models..."
curl -s http://localhost:11434/api/tags | jq '.models[].name' 2>/dev/null || echo "No models or jq not available"

echo "=== Fix Complete ==="
