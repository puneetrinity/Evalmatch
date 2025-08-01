#!/bin/bash

# Force NODE_OPTIONS for Railway deployment - multiple approaches for reliability
export NODE_OPTIONS="--max-old-space-size=7168 --max-semi-space-size=256"

echo "=== EvalMatch Railway Startup ==="
echo "Working directory: $(pwd)"
echo "Node.js version: $(node --version)"
echo "NODE_OPTIONS: $NODE_OPTIONS"
echo "Environment: ${NODE_ENV:-development}"

# Memory verification with heap statistics
echo "Memory Configuration Verification:"
node -e "
const v8 = require('v8');
const mem = process.memoryUsage();
const heapStats = v8.getHeapStatistics();
console.log('Current Heap Used:', Math.round(mem.heapUsed / 1024 / 1024) + 'MB');
console.log('Current Heap Total:', Math.round(mem.heapTotal / 1024 / 1024) + 'MB'); 
console.log('V8 Heap Size Limit:', Math.round(heapStats.total_heap_size_limit / 1024 / 1024) + 'MB');
console.log('V8 Available Size:', Math.round(heapStats.total_available_size / 1024 / 1024) + 'MB');
if (heapStats.total_heap_size_limit > 2000 * 1024 * 1024) {
  console.log('✅ NODE_OPTIONS memory limit successfully applied');
} else {
  console.log('❌ NODE_OPTIONS memory limit NOT applied - using defaults');
}
"
echo ""

# Function to start the application
start_app() {
    local script_path="$1"
    echo "🚀 Starting EvalMatch with: $script_path"
    echo "Final NODE_OPTIONS: $NODE_OPTIONS"
    exec env NODE_OPTIONS="$NODE_OPTIONS" node "$script_path"
}

# Debug: Show all available entry points
echo "🔍 Searching for application entry points..."
echo "Files in /app:"
ls -la /app/ 2>/dev/null || echo "Cannot list /app directory"
echo ""

# Remove dist directory if it exists to prevent Railway from using wrong entry point
if [ -d "/app/dist" ]; then
    echo "🗑️  Removing /app/dist directory to prevent Railway from using wrong entry point"
    rm -rf /app/dist
fi

echo "Available index.js files:"
find /app -name "index.js" -type f 2>/dev/null || echo "No index.js files found"
echo ""

# Check for the application in priority order (build only for Railway)
if [ -f "/app/build/index.js" ]; then
    echo "✅ Found built application at /app/build/index.js"
    start_app "build/index.js"
elif [ -f "/app/server/index.js" ]; then
    echo "🔧 Found source application at /app/server/index.js (fallback for development)"
    start_app "server/index.js"
else
    echo "❌ No application entry point found!"
    echo "Searched locations:"
    echo "  - /app/build/index.js (primary for Railway)"
    echo "  - /app/server/index.js (fallback for development)"
    echo ""
    echo "Available files in /app:"
    ls -la /app/ 2>/dev/null || echo "Cannot list /app directory"
    echo ""
    echo "Build directory contents:"
    ls -la /app/build/ 2>/dev/null || echo "Build directory not found"
    echo ""
    echo "This suggests the build process failed. Check Docker build logs."
    exit 1
fi