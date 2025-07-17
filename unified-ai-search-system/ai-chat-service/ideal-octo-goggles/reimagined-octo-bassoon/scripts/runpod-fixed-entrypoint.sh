#!/bin/bash
# RunPod-optimized entrypoint that keeps PID 1 alive and maintains terminal access
# Fixes: supervisord as PID 1 + proper foreground process management

set -e

echo "🚀 Starting AI Search System - RunPod Container (FIXED)"
echo "======================================================"

# Trap SIGTERM and SIGINT for graceful shutdown
trap 'echo "🛑 Received shutdown signal, stopping services..."; supervisorctl shutdown; exit 0' TERM INT

# Create required directories FIRST
echo "📁 Creating required directories..."
mkdir -p /var/log/supervisor /root/.ollama/models /var/run /tmp
chmod 755 /var/log/supervisor /var/run
chown root:root /var/log/supervisor /var/run

# Create all expected log files
echo "📝 Creating log files..."
touch /var/log/supervisor/supervisord.log
touch /var/log/supervisor/{redis,ollama,api,model-init,health}.{err,out}.log
chmod 666 /var/log/supervisor/*.log

# Set Ollama environment variables
export OLLAMA_MODELS="/root/.ollama/models"
export OLLAMA_KEEP_ALIVE="24h"
export OLLAMA_HOST="0.0.0.0:11434"
export OLLAMA_ORIGINS="*"

echo "✅ Environment prepared"

# CRITICAL FIX: Run supervisor as PID 1 equivalent
# Use 'exec' to replace the shell process with supervisord
# This ensures supervisord becomes the main process and stays alive
echo "🎯 Starting supervisord as main process (PID 1 replacement)..."

# If we're PID 1, we need to handle this specially
if [ $$ -eq 1 ]; then
    echo "📍 Running as PID 1 - using exec supervisord"
    # This replaces the current process (PID 1) with supervisord
    exec /usr/bin/supervisord -n -c /etc/supervisor/supervisord.conf
else
    echo "📍 Running as subprocess - starting supervisord in foreground"
    # For testing/development, run in foreground but don't exec
    /usr/bin/supervisord -n -c /etc/supervisor/supervisord.conf
fi