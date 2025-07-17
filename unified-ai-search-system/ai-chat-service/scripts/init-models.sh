#!/bin/bash
# Ollama model initialization script for RunPod
# This script ensures the required models are downloaded and ready

set -e

# Enhanced logging function
log_with_timestamp() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Debug information function
debug_system_state() {
    log_with_timestamp "🔍 SYSTEM DEBUG INFO:"
    log_with_timestamp "- Current directory: $(pwd)"
    log_with_timestamp "- Available disk space: $(df -h / | tail -1)"
    log_with_timestamp "- Memory usage: $(free -h | head -2)"
    log_with_timestamp "- Ollama process: $(ps aux | grep ollama | grep -v grep || echo 'No ollama process found')"
    log_with_timestamp "- Network connectivity: $(ping -c 1 8.8.8.8 >/dev/null 2>&1 && echo 'OK' || echo 'FAILED')"
}

log_with_timestamp "🤖 Ollama Model Initialization Script"
log_with_timestamp "====================================="

# Initial system state check
debug_system_state

# Wait for Ollama service to be ready
log_with_timestamp "⏳ Waiting for Ollama service to start..."
max_attempts=30
attempt=0

while [ $attempt -lt $max_attempts ]; do
    log_with_timestamp "⏳ Attempt $((attempt + 1))/$max_attempts - Testing Ollama connectivity..."
    
    # Test Ollama API endpoint
    if curl -s -w "HTTP_CODE:%{http_code}" http://localhost:11434/api/tags > /tmp/ollama_test 2>&1; then
        http_code=$(grep "HTTP_CODE:" /tmp/ollama_test | cut -d: -f2)
        if [ "$http_code" = "200" ]; then
            log_with_timestamp "✅ Ollama service is ready! (HTTP 200)"
            break
        else
            log_with_timestamp "⚠️ Ollama responded but with HTTP code: $http_code"
        fi
    else
        log_with_timestamp "❌ Ollama API test failed"
        cat /tmp/ollama_test 2>/dev/null || true
    fi
    
    sleep 5
    attempt=$((attempt + 1))
done

if [ $attempt -eq $max_attempts ]; then
    log_with_timestamp "❌ Ollama service failed to start after $max_attempts attempts"
    log_with_timestamp "🔍 Final system diagnostics:"
    debug_system_state
    log_with_timestamp "🔍 Checking Ollama process:"
    ps aux | grep ollama || log_with_timestamp "No Ollama processes found"
    log_with_timestamp "🔍 Checking port 11434:"
    netstat -tlnp | grep 11434 || log_with_timestamp "Port 11434 not listening"
    log_with_timestamp "🔍 Checking Ollama logs:"
    tail -20 /var/log/supervisor/ollama.err.log 2>/dev/null || log_with_timestamp "No Ollama error logs found"
    exit 1
fi

# Function to download model with retry logic
download_model() {
    local model_name="$1"
    local max_retries=3
    local retry=0
    
    log_with_timestamp "📦 Starting download for model: $model_name"
    
    # Check available disk space before download
    available_space=$(df / | tail -1 | awk '{print $4}')
    log_with_timestamp "💾 Available disk space: ${available_space}KB"
    
    while [ $retry -lt $max_retries ]; do
        log_with_timestamp "📥 Download attempt $((retry + 1))/$max_retries for $model_name"
        
        # Run ollama pull with verbose output
        if timeout 300 ollama pull "$model_name" 2>&1 | tee /tmp/ollama_pull.log; then
            log_with_timestamp "✅ Successfully downloaded $model_name"
            # Verify the model is actually available
            if ollama list | grep -q "$model_name"; then
                log_with_timestamp "✅ Model $model_name verified in ollama list"
                return 0
            else
                log_with_timestamp "⚠️ Model downloaded but not showing in ollama list"
            fi
        else
            retry=$((retry + 1))
            log_with_timestamp "❌ Failed to download $model_name (attempt $retry/$max_retries)"
            log_with_timestamp "📋 Download error details:"
            tail -10 /tmp/ollama_pull.log 2>/dev/null || log_with_timestamp "No download log available"
            
            if [ $retry -lt $max_retries ]; then
                log_with_timestamp "⏳ Retrying in 10 seconds..."
                sleep 10
            fi
        fi
    done
    
    log_with_timestamp "❌ Failed to download $model_name after $max_retries attempts"
    log_with_timestamp "🔍 Final diagnostics for failed download:"
    debug_system_state
    return 1
}

# Check if models already exist
log_with_timestamp "🔍 Checking existing models..."
if ! ollama list >/dev/null 2>&1; then
    log_with_timestamp "❌ Cannot connect to ollama service for model check"
    debug_system_state
    exit 1
fi

log_with_timestamp "📋 Current models in Ollama:"
ollama list || log_with_timestamp "Failed to list models"

if ollama list | grep -q "phi3:mini"; then
    log_with_timestamp "✅ phi3:mini model already exists"
else
    log_with_timestamp "📦 phi3:mini model not found, downloading..."
    if ! download_model "phi3:mini"; then
        log_with_timestamp "❌ Failed to download phi3:mini - this is critical"
        exit 1
    fi
fi

# Optional: Download additional models for better performance
log_with_timestamp "🔍 Checking for additional models..."

# Uncomment to download more models
# if ! ollama list | grep -q "llama2:7b"; then
#     log_with_timestamp "📦 Downloading llama2:7b for enhanced capabilities..."
#     download_model "llama2:7b" || log_with_timestamp "⚠️ Failed to download llama2:7b"
# fi

# List all available models
log_with_timestamp "📋 Available models:"
if ! ollama list; then
    log_with_timestamp "❌ Failed to list models - ollama may not be ready"
    debug_system_state
    exit 1
fi

# Test model functionality
log_with_timestamp "🧪 Testing model functionality..."
if timeout 30 bash -c 'echo "Hello, this is a test." | ollama run phi3:mini' > /tmp/model_test.log 2>&1; then
    log_with_timestamp "✅ Model test successful!"
    log_with_timestamp "📋 Test output: $(head -1 /tmp/model_test.log)"
else
    log_with_timestamp "⚠️ Model test failed"
    log_with_timestamp "📋 Test error details:"
    cat /tmp/model_test.log 2>/dev/null || log_with_timestamp "No test log available"
    log_with_timestamp "⚠️ Continuing despite test failure..."
fi

log_with_timestamp "🎉 Model initialization complete!"
log_with_timestamp "📊 Final model statistics:"
if ! ollama list; then
    log_with_timestamp "❌ Failed to get final model statistics"
    debug_system_state
    exit 1
fi

# Create a flag file to indicate initialization is complete
mkdir -p /root/.ollama/models
touch /root/.ollama/models/.initialized
log_with_timestamp "✅ Initialization flag created at /root/.ollama/models/.initialized"

log_with_timestamp "🚀 Ollama is ready for use!"
log_with_timestamp "🏁 Model initialization script completed successfully"