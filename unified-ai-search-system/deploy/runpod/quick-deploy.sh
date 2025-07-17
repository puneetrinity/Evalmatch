#!/bin/bash

# Quick Deploy Script for RunPod
# This is a simplified version for immediate deployment

set -e

echo "🚀 Quick Deploy - Unified AI Search System"
echo "=========================================="

# Check if we're in RunPod
if [ ! -d "/workspace" ]; then
    echo "❌ This script is designed for RunPod environment"
    echo "Please run this on a RunPod instance"
    exit 1
fi

# Install basic dependencies
echo "📦 Installing dependencies..."
apt-get update -y
apt-get install -y python3 python3-pip python3-venv git curl redis-server

# Clone repository
echo "📂 Cloning repository..."
cd /workspace
rm -rf laughing-guacamole-runpod
git clone https://github.com/puneetrinity/laughing-guacamole-runpod.git
cd laughing-guacamole-runpod/unified-ai-search-system

# Create virtual environment
echo "🐍 Setting up Python environment..."
python3 -m venv venv
source venv/bin/activate

# Install AI Chat Service dependencies
echo "🤖 Installing AI Chat Service..."
cd ai-chat-service
pip install fastapi uvicorn requests redis python-multipart
pip install -r requirements.txt || echo "Some packages may have failed, continuing..."
cd ..

# Install Document Search Service dependencies
echo "🔍 Installing Document Search Service..."
cd document-search-service
pip install fastapi uvicorn numpy faiss-cpu sentence-transformers
pip install -r requirements.txt || echo "Some packages may have failed, continuing..."
cd ..

# Install Ollama
echo "🧠 Installing Ollama..."
curl -fsSL https://ollama.com/install.sh | sh
systemctl start ollama &
sleep 5

# Start Redis
echo "🔄 Starting Redis..."
systemctl start redis-server &

# Pull essential model
echo "📥 Pulling essential model..."
ollama pull phi3:mini &

# Create simple startup script
echo "🚀 Creating startup script..."
cat > /workspace/start-unified-system.sh << 'EOF'
#!/bin/bash
cd /workspace/laughing-guacamole-runpod/unified-ai-search-system
source venv/bin/activate

# Start Redis if not running
systemctl start redis-server

# Start Ollama if not running
systemctl start ollama

# Start AI Chat Service
cd ai-chat-service
export PYTHONPATH=/workspace/laughing-guacamole-runpod/unified-ai-search-system/ai-chat-service:$PYTHONPATH
python -m uvicorn app.main:app --host 0.0.0.0 --port 8003 &
echo "AI Chat Service started on port 8003"

# Start Document Search Service
cd ../document-search-service
export PYTHONPATH=/workspace/laughing-guacamole-runpod/unified-ai-search-system/document-search-service:$PYTHONPATH
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 &
echo "Document Search Service started on port 8001"

# Simple UI server
cd ../ui
python3 -m http.server 8000 &
echo "UI server started on port 8000"

echo ""
echo "🎉 System started successfully!"
echo "Access points:"
echo "• AI Chat Service: http://localhost:8003"
echo "• Document Search Service: http://localhost:8001"
echo "• UI: http://localhost:8000"
echo ""
echo "To stop all services: pkill -f uvicorn && pkill -f http.server"
echo "To restart: bash /workspace/start-unified-system.sh"

wait
EOF

chmod +x /workspace/start-unified-system.sh

# Start the system
echo "🏁 Starting the unified system..."
bash /workspace/start-unified-system.sh

echo "✅ Quick deployment complete!"
echo "The system should be running on:"
echo "• AI Chat: http://localhost:8003"
echo "• Document Search: http://localhost:8001"
echo "• UI: http://localhost:8000"