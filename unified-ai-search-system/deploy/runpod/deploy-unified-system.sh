#!/bin/bash

# RunPod Unified AI Search System Deployment Script
# This script deploys the complete unified system with all advanced features

set -e

echo "🚀 Starting RunPod Unified AI Search System Deployment"
echo "======================================================="

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running on RunPod
if [ -d "/workspace" ]; then
    WORKSPACE_DIR="/workspace"
    log_info "RunPod environment detected"
else
    WORKSPACE_DIR="/tmp/workspace"
    mkdir -p $WORKSPACE_DIR
    log_warning "Non-RunPod environment, using $WORKSPACE_DIR"
fi

# System update and dependencies
log_info "Updating system and installing dependencies..."
apt-get update && apt-get upgrade -y
apt-get install -y curl wget git python3 python3-pip python3-venv redis-server nginx supervisor htop

# Install Docker if not present
if ! command -v docker &> /dev/null; then
    log_info "Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    systemctl start docker
    systemctl enable docker
    log_success "Docker installed and started"
fi

# Clone repository
log_info "Cloning unified AI search system repository..."
cd $WORKSPACE_DIR
if [ -d "laughing-guacamole-runpod" ]; then
    rm -rf laughing-guacamole-runpod
fi

git clone https://github.com/puneetrinity/laughing-guacamole-runpod.git
cd laughing-guacamole-runpod/unified-ai-search-system

# Create Python virtual environment
log_info "Setting up Python virtual environment..."
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip

# Install AI Chat Service dependencies
log_info "Installing AI Chat Service dependencies..."
cd ai-chat-service
pip install -r requirements.txt
cd ..

# Install Document Search Service dependencies
log_info "Installing Document Search Service dependencies..."
cd document-search-service
pip install -r requirements.txt
cd ..

# Install Ollama
log_info "Installing Ollama..."
curl -fsSL https://ollama.com/install.sh | sh
systemctl start ollama
systemctl enable ollama

# Wait for Ollama to be ready
log_info "Waiting for Ollama to be ready..."
sleep 10

# Pull required models
log_info "Pulling required Ollama models..."
ollama pull phi3:mini
ollama pull llama3.2
ollama pull qwen2.5

# Start Redis
log_info "Starting Redis server..."
systemctl start redis-server
systemctl enable redis-server

# Install and configure ClickHouse (for advanced analytics)
log_info "Installing ClickHouse..."
apt-get install -y apt-transport-https ca-certificates dirmngr
apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv 8919F6BD2B48D754
echo "deb https://packages.clickhouse.com/deb stable main" | tee /etc/apt/sources.list.d/clickhouse.list
apt-get update
apt-get install -y clickhouse-server clickhouse-client
systemctl start clickhouse-server
systemctl enable clickhouse-server

# Create environment configuration
log_info "Creating environment configuration..."
cat > $WORKSPACE_DIR/laughing-guacamole-runpod/unified-ai-search-system/.env << EOF
# Environment Configuration
ENVIRONMENT=production
DEBUG=false

# Services
REDIS_URL=redis://localhost:6379
OLLAMA_HOST=http://localhost:11434
CLICKHOUSE_HOST=localhost:8123

# API Keys (replace with your actual keys)
BRAVE_API_KEY=your_brave_search_api_key_here
SCRAPINGBEE_API_KEY=your_scrapingbee_api_key_here

# Model Configuration
DEFAULT_MODEL=phi3:mini
FALLBACK_MODEL=phi3:mini

# Cost & Performance
DEFAULT_MONTHLY_BUDGET=20.0
RATE_LIMIT_PER_MINUTE=60
TARGET_RESPONSE_TIME=2.5

# Ports
AI_CHAT_SERVICE_PORT=8003
DOCUMENT_SEARCH_SERVICE_PORT=8001
UNIFIED_UI_PORT=8000
EOF

# Create startup script for AI Chat Service
log_info "Creating AI Chat Service startup script..."
cat > $WORKSPACE_DIR/laughing-guacamole-runpod/unified-ai-search-system/ai-chat-service/start-service.sh << 'EOF'
#!/bin/bash
cd /workspace/laughing-guacamole-runpod/unified-ai-search-system/ai-chat-service
source ../venv/bin/activate
export PYTHONPATH=/workspace/laughing-guacamole-runpod/unified-ai-search-system/ai-chat-service:$PYTHONPATH
python -m uvicorn app.main:app --host 0.0.0.0 --port 8003 --reload
EOF

# Create startup script for Document Search Service
log_info "Creating Document Search Service startup script..."
cat > $WORKSPACE_DIR/laughing-guacamole-runpod/unified-ai-search-system/document-search-service/start-service.sh << 'EOF'
#!/bin/bash
cd /workspace/laughing-guacamole-runpod/unified-ai-search-system/document-search-service
source ../venv/bin/activate
export PYTHONPATH=/workspace/laughing-guacamole-runpod/unified-ai-search-system/document-search-service:$PYTHONPATH
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
EOF

# Make scripts executable
chmod +x $WORKSPACE_DIR/laughing-guacamole-runpod/unified-ai-search-system/ai-chat-service/start-service.sh
chmod +x $WORKSPACE_DIR/laughing-guacamole-runpod/unified-ai-search-system/document-search-service/start-service.sh

# Create Supervisor configuration
log_info "Creating Supervisor configuration..."
cat > /etc/supervisor/conf.d/unified-ai-search.conf << EOF
[program:ai-chat-service]
command=/workspace/laughing-guacamole-runpod/unified-ai-search-system/ai-chat-service/start-service.sh
directory=/workspace/laughing-guacamole-runpod/unified-ai-search-system/ai-chat-service
autostart=true
autorestart=true
stderr_logfile=/var/log/ai-chat-service.err.log
stdout_logfile=/var/log/ai-chat-service.out.log
user=root
environment=PATH="/workspace/laughing-guacamole-runpod/unified-ai-search-system/venv/bin:%(ENV_PATH)s"

[program:document-search-service]
command=/workspace/laughing-guacamole-runpod/unified-ai-search-system/document-search-service/start-service.sh
directory=/workspace/laughing-guacamole-runpod/unified-ai-search-system/document-search-service
autostart=true
autorestart=true
stderr_logfile=/var/log/document-search-service.err.log
stdout_logfile=/var/log/document-search-service.out.log
user=root
environment=PATH="/workspace/laughing-guacamole-runpod/unified-ai-search-system/venv/bin:%(ENV_PATH)s"
EOF

# Configure Nginx for unified UI
log_info "Configuring Nginx for unified UI..."
cat > /etc/nginx/sites-available/unified-ai-search << 'EOF'
server {
    listen 8000;
    server_name _;
    
    # Serve static UI files
    location /ui/ {
        root /workspace/laughing-guacamole-runpod/unified-ai-search-system;
        try_files $uri $uri/ =404;
    }
    
    # Default to unified chat interface
    location / {
        root /workspace/laughing-guacamole-runpod/unified-ai-search-system/ui;
        try_files /unified_chat.html =404;
    }
    
    # Proxy AI Chat Service API
    location /api/v1/ {
        proxy_pass http://127.0.0.1:8003;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Proxy Document Search Service API
    location /api/v2/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Health checks
    location /health {
        return 200 "OK";
        add_header Content-Type text/plain;
    }
}
EOF

# Enable Nginx site
ln -sf /etc/nginx/sites-available/unified-ai-search /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
nginx -t

# Start services
log_info "Starting all services..."
systemctl restart supervisor
systemctl restart nginx
systemctl enable supervisor
systemctl enable nginx

# Wait for services to start
sleep 15

# Health checks
log_info "Performing health checks..."

# Check AI Chat Service
if curl -s http://localhost:8003/health > /dev/null; then
    log_success "AI Chat Service (port 8003) is running"
else
    log_error "AI Chat Service health check failed"
fi

# Check Document Search Service
if curl -s http://localhost:8001/health > /dev/null; then
    log_success "Document Search Service (port 8001) is running"
else
    log_error "Document Search Service health check failed"
fi

# Check Unified UI
if curl -s http://localhost:8000/health > /dev/null; then
    log_success "Unified UI (port 8000) is running"
else
    log_error "Unified UI health check failed"
fi

# Display deployment summary
echo ""
echo "🎉 DEPLOYMENT COMPLETE!"
echo "======================="
echo ""
echo "Services available at:"
echo "• AI Chat Service: http://localhost:8003"
echo "• Document Search Service: http://localhost:8001"
echo "• Unified UI: http://localhost:8000"
echo ""
echo "UI Interfaces:"
echo "• Unified Chat: http://localhost:8000/ui/unified_chat.html"
echo "• Auth Demo: http://localhost:8000/ui/test_auth_demo.html"
echo "• Document Search: http://localhost:8000/ui/index.html"
echo ""
echo "API Documentation:"
echo "• Chat API: http://localhost:8003/docs"
echo "• Search API: http://localhost:8001/docs"
echo ""
echo "Health Checks:"
echo "• System Health: http://localhost:8000/health"
echo "• Chat Health: http://localhost:8003/health"
echo "• Search Health: http://localhost:8001/health"
echo ""
echo "Advanced Features Available:"
echo "✅ Thompson Sampling Multi-Armed Bandit"
echo "✅ ClickHouse Analytics & Cold Storage"
echo "✅ Shadow Routing & A/B Testing"
echo "✅ Mathematical Algorithms (LSH, HNSW, Product Quantization)"
echo "✅ Intelligent Streaming & Cost Optimization"
echo "✅ Dual-Layer Metadata System"
echo ""
echo "Log files:"
echo "• AI Chat: /var/log/ai-chat-service.out.log"
echo "• Document Search: /var/log/document-search-service.out.log"
echo ""
echo "Configuration:"
echo "• Environment: $WORKSPACE_DIR/laughing-guacamole-runpod/unified-ai-search-system/.env"
echo "• Supervisor: /etc/supervisor/conf.d/unified-ai-search.conf"
echo "• Nginx: /etc/nginx/sites-available/unified-ai-search"
echo ""
echo "To check service status:"
echo "• supervisorctl status"
echo "• systemctl status nginx"
echo "• systemctl status redis-server"
echo "• systemctl status clickhouse-server"
echo "• systemctl status ollama"
echo ""
log_success "Unified AI Search System deployment completed successfully!"