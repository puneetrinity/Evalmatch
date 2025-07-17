#!/bin/bash
# RunPod entrypoint - starts services in background and preserves terminal access

set -e

echo "🚀 Starting AI Search System - RunPod Container"
echo "================================================="

# Create required directories
mkdir -p /var/log/supervisor /root/.ollama/models /var/run

# Set permissions
chmod 755 /var/log/supervisor /var/run
chown root:root /var/log/supervisor /var/run

# Create log files
touch /var/log/supervisor/supervisord.log
touch /var/log/supervisor/redis.err.log /var/log/supervisor/redis.out.log
touch /var/log/supervisor/ollama.err.log /var/log/supervisor/ollama.out.log
touch /var/log/supervisor/api.err.log /var/log/supervisor/api.out.log
touch /var/log/supervisor/health.err.log /var/log/supervisor/health.out.log

chmod 666 /var/log/supervisor/*.log

echo "✅ Directories and log files created"

# Start supervisor in background (daemon mode)
echo "🎯 Starting supervisor in daemon mode..."
supervisord -c /etc/supervisor/supervisord.conf

# Wait for services to start
echo "⏳ Waiting for services to initialize..."
sleep 10

# Show status
echo "📊 Service status:"
supervisorctl status 2>/dev/null || echo "Services starting..."

echo ""
echo "🎉 Startup complete!"
echo "🌐 API available at: https://l4vja98so6wvh9-8000.proxy.runpod.net/"
echo "📖 API docs at: https://l4vja98so6wvh9-8000.proxy.runpod.net/docs"
echo "💻 Terminal is ready for use!"
echo ""
echo "Useful commands:"
echo "  supervisorctl status     - Check service status"
echo "  ollama pull phi3:mini    - Download models"
echo "  curl http://localhost:8000/health - Test API"
echo ""

# Execute the CMD (which should be /bin/bash)
exec "$@"