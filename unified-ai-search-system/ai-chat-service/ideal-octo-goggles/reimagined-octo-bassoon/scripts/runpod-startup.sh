#!/bin/bash
# RunPod startup script - ensures all directories and dependencies are ready

set -e

echo "🚀 Starting AI Search System - RunPod Container"
echo "================================================="

# EMERGENCY FIX: Force replace any /app/logs references in supervisor config
echo "🔧 EMERGENCY: Forcibly fixing supervisor config paths..."
CONFIG_FILE="/etc/supervisor/conf.d/ai-search.conf"

if [[ -f "$CONFIG_FILE" ]]; then
    echo "📝 Original config:"
    head -10 "$CONFIG_FILE"
    
    # Replace any /app/logs with /var/log/supervisor
    sed -i 's|/app/logs|/var/log/supervisor|g' "$CONFIG_FILE"
    
    # Also ensure specific log file extensions are correct
    sed -i 's|/var/log/supervisor/api\.log|/var/log/supervisor/api.err.log|g' "$CONFIG_FILE"
    
    echo "📝 Fixed config:"
    head -10 "$CONFIG_FILE"
else
    echo "❌ Supervisor config file not found: $CONFIG_FILE"
fi

# NUCLEAR OPTION: Completely rewrite supervisor config
if [[ -f /app/scripts/emergency-supervisor-rewrite.sh ]]; then
    echo "🔥 NUCLEAR OPTION: Completely rewriting supervisor config..."
    chmod +x /app/scripts/emergency-supervisor-rewrite.sh
    /app/scripts/emergency-supervisor-rewrite.sh
fi

# Run supervisor config verification FIRST
if [[ -f /app/scripts/verify-supervisor-config.sh ]]; then
    echo "🔍 Running supervisor config verification..."
    chmod +x /app/scripts/verify-supervisor-config.sh
    /app/scripts/verify-supervisor-config.sh
fi

# FIRST PRIORITY: Create all directories that supervisor needs
echo "📁 Creating ALL required directories IMMEDIATELY..."
mkdir -p /var/log/supervisor /root/.ollama/models /app/cache /var/run /tmp

# Force create the directory with explicit permissions
chmod 755 /var/log/supervisor /var/run
chown root:root /var/log/supervisor /var/run

# Verify the directory was created successfully
if [[ ! -d /var/log/supervisor ]]; then
    echo "❌ CRITICAL ERROR: Failed to create /var/log/supervisor directory!"
    echo "🔍 Current /var/log structure:"
    ls -la /var/log/ || echo "Cannot list /var/log"
    echo "🔍 Current filesystem info:"
    df -h
    exit 1
fi

# Test if directory is writable
if ! touch /var/log/supervisor/test.log 2>/dev/null; then
    echo "❌ CRITICAL ERROR: /var/log/supervisor directory is not writable!"
    echo "🔍 Directory permissions:"
    ls -ld /var/log/supervisor
    exit 1
fi

# Clean up test file
rm -f /var/log/supervisor/test.log

echo "✅ Successfully created and verified /var/log/supervisor directory"

# Now create all log files that supervisor expects (using correct paths)
echo "📝 Creating ALL log files in /var/log/supervisor..."
touch /var/log/supervisor/supervisord.log
touch /var/log/supervisor/redis.err.log /var/log/supervisor/redis.out.log
touch /var/log/supervisor/ollama.err.log /var/log/supervisor/ollama.out.log
touch /var/log/supervisor/api.err.log /var/log/supervisor/api.out.log
touch /var/log/supervisor/model-init.err.log /var/log/supervisor/model-init.out.log
touch /var/log/supervisor/health.err.log /var/log/supervisor/health.out.log

# Set proper permissions on all files
chmod 666 /var/log/supervisor/*.log 2>/dev/null || echo "⚠️ Some log files may not exist yet"
chmod 755 /app/scripts/*.py 2>/dev/null || true
chmod 755 /app/scripts/*.sh 2>/dev/null || true

echo "✅ All log files created successfully"

# Environment information
echo "🌍 Environment configured:"
echo "  - Ollama: ${OLLAMA_BASE_URL:-http://localhost:11434}"
echo "  - Environment: ${ENVIRONMENT:-production}"
echo "  - API: 0.0.0.0:8000"
echo "  - RunPod Pod ID: ${RUNPOD_POD_ID:-unknown}"
echo "  - RunPod Port: ${RUNPOD_TCP_PORT_8000:-8000}"

# Verify supervisor configuration - SAFE VERSION
echo "🔧 Checking supervisor configuration (using system paths)..."
echo "📄 Configuration files in use:"
echo "   Main config: /etc/supervisor/supervisord.conf"
echo "   Service config: /etc/supervisor/conf.d/ai-search.conf"

if [[ ! -f /etc/supervisor/conf.d/ai-search.conf ]]; then
    echo "❌ Supervisor config not found at /etc/supervisor/conf.d/ai-search.conf!"
    echo "📁 Listing contents of /etc/supervisor/conf.d/:"
    ls -la /etc/supervisor/conf.d/ || echo "Directory not found"
    exit 1
fi

echo "✅ Found supervisor config file"

# Show the actual configuration being used
echo "📋 Main supervisord.conf contents:"
echo "=================================="
cat /etc/supervisor/supervisord.conf | head -20
echo "=================================="

echo "📋 Service configuration contents:"
echo "=================================="
cat /etc/supervisor/conf.d/ai-search.conf | head -20
echo "=================================="

# Test configuration with verbose output
echo "🧪 Testing supervisor configuration..."
if ! supervisord -t -c /etc/supervisor/supervisord.conf 2>&1; then
    echo "❌ Supervisor configuration test failed!"
    echo "📋 Configuration file contents:"
    echo "=== /etc/supervisor/supervisord.conf ==="
    cat /etc/supervisor/supervisord.conf
    echo "=== /etc/supervisor/conf.d/ai-search.conf ==="
    cat /etc/supervisor/conf.d/ai-search.conf
    exit 1
fi

echo "✅ Supervisor configuration test passed"

echo "🎯 Starting supervisor in foreground mode..."
echo "   This will start all services: Redis -> Ollama -> FastAPI -> Model Init"

# Start supervisor - this should work now!
exec /usr/bin/supervisord -n -c /etc/supervisor/supervisord.conf
