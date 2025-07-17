#!/bin/bash
set -e

echo "🚀 Starting Unified AI Search System"
echo "=================================="

# Set Python path
export PYTHONPATH="/app/ubiquitous-octo-invention:/app/ideal-octo-goggles:$PYTHONPATH"

# Create log directories
mkdir -p /var/log/unified-ai-system
mkdir -p /app/logs

# Check if ideal-octo-goggles is available
if [ -d "/app/ideal-octo-goggles" ]; then
    echo "✅ ideal-octo-goggles found, starting full unified system"
    exec supervisord -c /etc/supervisor/conf.d/supervisord.conf
else
    echo "⚠️  ideal-octo-goggles not found, starting standalone mode"
    cd /app/ubiquitous-octo-invention
    exec python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
fi
