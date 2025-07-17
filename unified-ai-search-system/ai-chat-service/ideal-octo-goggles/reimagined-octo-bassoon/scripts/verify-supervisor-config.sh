#!/bin/bash
# Runtime supervisor config verification script
# This runs at container startup to ensure configs are correct

echo "🔍 RUNTIME SUPERVISOR CONFIG VERIFICATION"
echo "========================================"

CONFIG_FILE="/etc/supervisor/conf.d/ai-search.conf"

if [[ ! -f "$CONFIG_FILE" ]]; then
    echo "❌ ERROR: Supervisor config file not found: $CONFIG_FILE"
    exit 1
fi

echo "✅ Config file exists: $CONFIG_FILE"

# Check for any /app/logs references (should be NONE)
if grep -q "/app/logs" "$CONFIG_FILE"; then
    echo "❌ ERROR: Found /app/logs references in config file:"
    grep -n "/app/logs" "$CONFIG_FILE"
    echo "This will cause supervisor to fail!"
    exit 1
else
    echo "✅ No /app/logs references found"
fi

# Verify log paths are correct
echo "📁 Log file paths configured:"
grep -E "(stderr_logfile|stdout_logfile)" "$CONFIG_FILE" | head -10

# Check program section names
echo "📋 Program sections defined:"
grep "^\[program:" "$CONFIG_FILE"

# Verify log directories exist
echo "📂 Checking log directories:"
if [[ -d "/var/log/supervisor" ]]; then
    echo "✅ /var/log/supervisor exists"
    ls -la /var/log/supervisor/ | head -5
else
    echo "❌ /var/log/supervisor does not exist!"
    exit 1
fi

echo "🎯 Runtime verification PASSED - supervisor config is correct!"
echo "========================================"
