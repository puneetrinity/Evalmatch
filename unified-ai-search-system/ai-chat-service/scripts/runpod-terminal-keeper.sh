#!/bin/bash
# Alternative approach: Keep terminal accessible while running services in background
# This script maintains a foreground process for RunPod terminal access

set -e

echo "🚀 AI Search System - Terminal-Friendly RunPod Setup"
echo "===================================================="

# Create directories and setup environment
mkdir -p /var/log/supervisor /root/.ollama/models /var/run
chmod 755 /var/log/supervisor /var/run
touch /var/log/supervisor/{supervisord,redis,ollama,api,model-init,health}.{log,err.log,out.log} 2>/dev/null || true
chmod 666 /var/log/supervisor/*.log 2>/dev/null || true

# Ollama environment
export OLLAMA_MODELS="/root/.ollama/models" 
export OLLAMA_HOST="0.0.0.0:11434"

echo "📁 Environment ready"

# Start supervisor in background (daemon mode)
echo "🎯 Starting services in background..."
/usr/bin/supervisord -c /etc/supervisor/supervisord.conf

# Wait for services to initialize
echo "⏳ Waiting for services to start..."
sleep 15

# Show service status
echo "📊 Service status:"
supervisorctl status 2>/dev/null || echo "Services initializing..."

echo ""
echo "🎉 All services started! Terminal ready for use."
echo "🌐 API: https://l4vja98so6wvh9-8000.proxy.runpod.net/"
echo "📖 Docs: https://l4vja98so6wvh9-8000.proxy.runpod.net/docs"
echo ""
echo "💡 Useful commands:"
echo "   supervisorctl status           # Check services"
echo "   supervisorctl restart api      # Restart API"
echo "   ollama pull phi3:mini         # Download model"
echo "   curl localhost:8000/health    # Test API"
echo ""

# CRITICAL: Keep the main process alive to maintain terminal access
# This creates a blocking foreground process that handles signals properly
echo "🔒 Keeping terminal session alive..."
echo "   Press Ctrl+C to exit or run commands in another terminal"

# Option 1: Simple infinite loop with signal handling
trap 'echo ""; echo "🛑 Shutting down..."; supervisorctl shutdown; exit 0' INT TERM

while true; do
    sleep 30
    # Optional: Add periodic health checks here
    if ! supervisorctl status > /dev/null 2>&1; then
        echo "⚠️  Supervisor not responding, restarting..."
        /usr/bin/supervisord -c /etc/supervisor/supervisord.conf
    fi
done