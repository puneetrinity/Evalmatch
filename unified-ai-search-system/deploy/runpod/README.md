# 🚀 RunPod Deployment Guide

This guide will help you deploy the Unified AI Search System on RunPod with all advanced features.

## 🎯 Quick Start

### 1. Create RunPod Instance
- Go to [RunPod](https://www.runpod.io/)
- Create a new pod with:
  - **Template**: Ubuntu 22.04 LTS
  - **GPU**: A4000 or better (recommended)
  - **Storage**: 50GB+ 
  - **Expose HTTP Ports**: 8000, 8001, 8003

### 2. Connect to Pod
```bash
# Use RunPod's web terminal or SSH
ssh root@<pod-ip> -p <port> -i ~/.runpod/ssh/RunPod-Key-Go
```

### 3. Run Deployment Script
```bash
# Download and execute the deployment script
curl -fsSL https://raw.githubusercontent.com/puneetrinity/laughing-guacamole-runpod/master/unified-ai-search-system/deploy/runpod/deploy-unified-system.sh | bash
```

**That's it!** The script will automatically:
- Install all dependencies
- Clone the repository
- Set up Python environments
- Install Ollama and pull models
- Configure Redis and ClickHouse
- Start all services with Supervisor
- Configure Nginx for unified access

## 🌐 Access Points

After deployment, you can access:

### Main Interfaces
- **Unified Chat**: `http://<pod-ip>:8000/ui/unified_chat.html`
- **Auth Demo**: `http://<pod-ip>:8000/ui/test_auth_demo.html`
- **Document Search**: `http://<pod-ip>:8000/ui/index.html`

### API Services
- **AI Chat Service**: `http://<pod-ip>:8003`
- **Document Search Service**: `http://<pod-ip>:8001`
- **Unified UI**: `http://<pod-ip>:8000`

### API Documentation
- **Chat API Docs**: `http://<pod-ip>:8003/docs`
- **Search API Docs**: `http://<pod-ip>:8001/docs`

### Health Checks
- **System Health**: `http://<pod-ip>:8000/health`
- **Chat Health**: `http://<pod-ip>:8003/health`
- **Search Health**: `http://<pod-ip>:8001/health`

## 🔧 Manual Setup (Alternative)

If you prefer manual setup:

### 1. Clone Repository
```bash
cd /workspace
git clone https://github.com/puneetrinity/laughing-guacamole-runpod.git
cd laughing-guacamole-runpod/unified-ai-search-system
```

### 2. Set Up Environment
```bash
# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
cd ai-chat-service && pip install -r requirements.txt && cd ..
cd document-search-service && pip install -r requirements.txt && cd ..
```

### 3. Install Services
```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh
ollama pull phi3:mini
ollama pull llama3.2
ollama pull qwen2.5

# Install Redis
apt-get install -y redis-server
systemctl start redis-server

# Install ClickHouse
curl -fsSL https://install.clickhouse.com | bash
clickhouse-server --config-file=/etc/clickhouse-server/config.xml --daemon
```

### 4. Start Services
```bash
# Start AI Chat Service
cd ai-chat-service
export PYTHONPATH=/workspace/laughing-guacamole-runpod/unified-ai-search-system/ai-chat-service:$PYTHONPATH
python -m uvicorn app.main:app --host 0.0.0.0 --port 8003 &

# Start Document Search Service
cd ../document-search-service
export PYTHONPATH=/workspace/laughing-guacamole-runpod/unified-ai-search-system/document-search-service:$PYTHONPATH
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 &

# Start Nginx for unified UI
nginx -g "daemon off;" &
```

## 🎯 Advanced Features Available

### ✅ Machine Learning & AI
- **Thompson Sampling Multi-Armed Bandit**: Bayesian exploration/exploitation
- **Adaptive Routing**: Dynamic model selection
- **Shadow Routing**: Safe testing of new models
- **A/B Testing**: Statistical validation framework

### ✅ Analytics & Storage
- **ClickHouse**: Cold storage analytics
- **Dual-Layer Metadata**: Hot (Redis) + Cold (ClickHouse) storage
- **Cost Analytics**: Detailed breakdown by provider
- **Performance Trends**: Historical analysis

### ✅ Mathematical Algorithms
- **LSH Index**: Locality-Sensitive Hashing
- **HNSW Index**: Hierarchical Navigable Small World
- **Product Quantization**: Vector compression
- **Batch Processing**: High-performance parallel processing

### ✅ System Optimization
- **Intelligent Streaming**: Adaptive buffer management
- **Cost Optimizer**: Budget-aware routing
- **Performance Monitoring**: Real-time health tracking
- **Gradual Rollout**: Safe feature deployment

## 🔍 Monitoring & Debugging

### Check Service Status
```bash
# Supervisor status
supervisorctl status

# System services
systemctl status nginx
systemctl status redis-server
systemctl status clickhouse-server
systemctl status ollama

# Process monitoring
htop
```

### View Logs
```bash
# Service logs
tail -f /var/log/ai-chat-service.out.log
tail -f /var/log/document-search-service.out.log

# Nginx logs
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log

# System logs
journalctl -u supervisor -f
```

### Test APIs
```bash
# Test AI Chat Service
curl -X POST http://localhost:8003/api/v1/chat/complete \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, test the system!"}'

# Test Document Search Service
curl -X POST http://localhost:8001/api/v2/search/ultra-fast \
  -H "Content-Type: application/json" \
  -d '{"query": "test search"}'
```

## 🛠️ Troubleshooting

### Common Issues

1. **Port conflicts**: Ensure ports 8000, 8001, 8003 are available
2. **Memory issues**: Ensure adequate RAM for models
3. **GPU not detected**: Check CUDA installation
4. **Model loading fails**: Verify Ollama service is running

### Reset Services
```bash
# Restart all services
supervisorctl restart all
systemctl restart nginx

# Restart individual services
supervisorctl restart ai-chat-service
supervisorctl restart document-search-service
```

### Clean Restart
```bash
# Stop all services
supervisorctl stop all
systemctl stop nginx
systemctl stop redis-server
systemctl stop clickhouse-server
systemctl stop ollama

# Start services
systemctl start ollama
systemctl start redis-server
systemctl start clickhouse-server
systemctl start nginx
supervisorctl start all
```

## 📝 Configuration

### Environment Variables
Edit `/workspace/laughing-guacamole-runpod/unified-ai-search-system/.env`:
```bash
# Add your API keys
BRAVE_API_KEY=your_actual_brave_api_key
SCRAPINGBEE_API_KEY=your_actual_scrapingbee_api_key

# Adjust settings
DEFAULT_MONTHLY_BUDGET=50.0
RATE_LIMIT_PER_MINUTE=120
```

### Service Configuration
- **Supervisor**: `/etc/supervisor/conf.d/unified-ai-search.conf`
- **Nginx**: `/etc/nginx/sites-available/unified-ai-search`

## 🎉 Success Indicators

When deployment is successful, you should see:
- ✅ All services running in supervisor
- ✅ Health checks return 200 OK
- ✅ UI interfaces load correctly
- ✅ API documentation accessible
- ✅ Models respond to queries

## 🔗 Links

- **Repository**: https://github.com/puneetrinity/laughing-guacamole-runpod
- **RunPod**: https://www.runpod.io/
- **Documentation**: Check the README.md files in each service directory

---

**Need help?** Check the logs and ensure all services are running. The deployment script includes comprehensive error handling and status checks.