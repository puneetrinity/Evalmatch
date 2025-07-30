#!/bin/sh

# Railway startup script - runs both nginx and Express like localhost
echo "🚄 Starting Railway deployment with nginx + Express..."

# Verify Node.js version
echo "Node.js version check:"
node --version
npm --version

# Environment setup
export NODE_ENV=production
export PORT=8080
export SERVE_STATIC=false  # nginx handles static files

# Log configuration
echo "Configuration check:"
echo "- NODE_ENV: $NODE_ENV"
echo "- PORT: $PORT (Express backend)"
echo "- nginx: Port 80 (frontend proxy)"
echo "- DATABASE_URL: $(echo $DATABASE_URL | sed 's/:.*/:*****/')"
echo "- GROQ_API_KEY: $(echo $GROQ_API_KEY | cut -c1-10)..."

# Start supervisor to run both nginx and Express
echo "🚀 Starting nginx + Express with supervisor..."
exec supervisord -c /etc/supervisor/conf.d/supervisord.conf