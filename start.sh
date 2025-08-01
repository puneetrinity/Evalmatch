#!/bin/bash

# Force NODE_OPTIONS for Railway deployment
export NODE_OPTIONS="--max-old-space-size=7168 --max-semi-space-size=256"

echo "=== EvalMatch Railway Startup ==="
echo "Working directory: $(pwd)"
echo "Node.js version: $(node --version)"
echo "NODE_OPTIONS: $NODE_OPTIONS"
echo "Environment: ${NODE_ENV:-development}"

# Function to start the application
start_app() {
    local script_path="$1"
    echo "🚀 Starting EvalMatch with: $script_path"
    exec node "$script_path"
}

# Check for the application in priority order
if [ -f "/app/build/index.js" ]; then
    echo "✅ Found built application at /app/build/index.js"
    start_app "build/index.js"
elif [ -f "/app/dist/index.js" ]; then
    echo "⚠️  Found fallback application at /app/dist/index.js"
    start_app "dist/index.js"
elif [ -f "/app/server/index.js" ]; then
    echo "🔧 Found source application at /app/server/index.js"
    start_app "server/index.js"
else
    echo "❌ No application entry point found!"
    echo "Searched locations:"
    echo "  - /app/build/index.js"
    echo "  - /app/dist/index.js" 
    echo "  - /app/server/index.js"
    echo ""
    echo "Available files in /app:"
    ls -la /app/ 2>/dev/null || echo "Cannot list /app directory"
    echo ""
    echo "Searching for any index.js files:"
    find /app -name "index.js" -type f 2>/dev/null || echo "No index.js files found"
    exit 1
fi