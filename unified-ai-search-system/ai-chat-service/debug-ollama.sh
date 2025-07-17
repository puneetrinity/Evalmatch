#!/bin/bash
# Debug script for Ollama service issues

echo "=== Ollama Service Debug Script ==="
echo "Current time: $(date)"
echo ""

echo "1. Checking Ollama process:"
ps aux | grep ollama | grep -v grep || echo "No Ollama process found"
echo ""

echo "2. Checking if Ollama port 11434 is listening:"
netstat -tulpn | grep 11434 || echo "Port 11434 not listening"
echo ""

echo "3. Checking Ollama service status:"
if command -v systemctl &> /dev/null; then
    systemctl status ollama || echo "Systemctl not available"
else
    echo "Systemctl not available"
fi
echo ""

echo "4. Checking Ollama logs (supervisor):"
if [ -f "/workspace/logs/ollama.out.log" ]; then
    echo "--- Ollama stdout (last 20 lines) ---"
    tail -n 20 /workspace/logs/ollama.out.log
else
    echo "No Ollama stdout log found"
fi
echo ""

if [ -f "/workspace/logs/ollama.err.log" ]; then
    echo "--- Ollama stderr (last 20 lines) ---"
    tail -n 20 /workspace/logs/ollama.err.log
else
    echo "No Ollama stderr log found"
fi
echo ""

echo "5. Checking supervisor status:"
supervisorctl status
echo ""

echo "6. Testing Ollama API directly:"
curl -v http://localhost:11434/api/version 2>&1 || echo "Ollama API not responding"
echo ""

echo "7. Checking if Ollama binary exists and is executable:"
which ollama || echo "Ollama binary not found in PATH"
ls -la /usr/local/bin/ollama || echo "Ollama not found at /usr/local/bin/ollama"
echo ""

echo "8. Checking GPU availability:"
nvidia-smi || echo "nvidia-smi not available"
echo ""

echo "9. Checking disk space:"
df -h || echo "df command failed"
echo ""

echo "10. Environment variables:"
echo "OLLAMA_HOST: $OLLAMA_HOST"
echo "CUDA_VISIBLE_DEVICES: $CUDA_VISIBLE_DEVICES"
echo ""

echo "=== Manual Ollama Start Test ==="
echo "Trying to start Ollama manually..."
# Kill any existing ollama processes
pkill ollama || echo "No ollama processes to kill"
sleep 2

# Try to start ollama manually
echo "Starting Ollama in background..."
/usr/local/bin/ollama serve &
OLLAMA_PID=$!
echo "Ollama PID: $OLLAMA_PID"

# Wait a few seconds
sleep 5

# Test if it's working
echo "Testing Ollama after manual start..."
curl -s http://localhost:11434/api/version || echo "Still not working"

# Cleanup
kill $OLLAMA_PID 2>/dev/null || echo "Ollama process already stopped"

echo ""
echo "=== Debug Complete ==="
