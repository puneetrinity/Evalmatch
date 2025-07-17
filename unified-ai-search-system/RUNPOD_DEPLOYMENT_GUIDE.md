# 🚀 RunPod Deployment Guide - Unified AI Search System

## 🎯 Two Deployment Options

### Option 1: Full Production Deployment (Recommended)
```bash
curl -fsSL https://raw.githubusercontent.com/puneetrinity/laughing-guacamole-runpod/master/unified-ai-search-system/deploy/runpod/deploy-unified-system.sh | bash
```

### Option 2: Quick Deploy (For Testing)
```bash
curl -fsSL https://raw.githubusercontent.com/puneetrinity/laughing-guacamole-runpod/master/unified-ai-search-system/deploy/runpod/quick-deploy.sh | bash
```

## 🔧 RunPod Setup Instructions

### 1. Create RunPod Instance
- Go to [RunPod](https://www.runpod.io/)
- Select **"Deploy"** → **"GPU Pod"**
- Choose template: **Ubuntu 22.04 LTS**
- Recommended specs:
  - **GPU**: RTX A4000 or better
  - **CPU**: 8+ cores
  - **RAM**: 32GB+
  - **Storage**: 50GB+
- **Expose HTTP Ports**: 8000, 8001, 8003
- **Enable SSH**: Yes

### 2. Connect to Your Pod
```bash
# Use the SSH command provided by RunPod
ssh root@<pod-ip> -p <port> -i ~/.runpod/ssh/RunPod-Key-Go
```

### 3. Run Deployment Command
Choose one of the deployment options above and run the command in your RunPod terminal.

## 📊 What Gets Deployed

### 🤖 AI Chat Service (Port 8003)
- **LangGraph orchestration** for complex conversation flows
- **Ollama integration** with local models (phi3:mini, llama3.2, qwen2.5)
- **Thompson Sampling Multi-Armed Bandit** for adaptive routing
- **ClickHouse analytics** for long-term data storage
- **Cost optimization** with budget tracking
- **Streaming responses** and real-time chat

### 🔍 Document Search Service (Port 8001)
- **FAISS vector search** with 384-dimensional embeddings
- **RAG (Retrieval Augmented Generation)** capabilities
- **Advanced mathematical algorithms** (LSH, HNSW, Product Quantization)
- **Bulk document processing** with multiple format support
- **Real-time indexing** and semantic search
- **Mathematical batch processing** for high performance

### 🎨 Unified UI (Port 8000)
- **Unified Chat Interface** - Modern chat with document upload
- **Authentication Demo** - Multi-tab interface with API testing
- **Document Search Interface** - ML search with profile management
- **Health monitoring** for all services
- **Parallel search** combining both services

## 🌐 Access Your Deployed System

After deployment, access your system using your RunPod's public IP:

### Main Interfaces
- **Unified Chat**: `http://<runpod-ip>:8000/ui/unified_chat.html`
- **Auth Demo**: `http://<runpod-ip>:8000/ui/test_auth_demo.html`
- **Document Search**: `http://<runpod-ip>:8000/ui/index.html`

### API Services
- **AI Chat API**: `http://<runpod-ip>:8003/docs`
- **Document Search API**: `http://<runpod-ip>:8001/docs`

### Health Checks
- **System Health**: `http://<runpod-ip>:8000/health`
- **Chat Health**: `http://<runpod-ip>:8003/health`
- **Search Health**: `http://<runpod-ip>:8001/health`

## 🔍 Verify Deployment

### Check Services
```bash
# Check if services are running
supervisorctl status  # For full deployment
ps aux | grep uvicorn  # For quick deployment

# Test API endpoints
curl http://localhost:8003/health
curl http://localhost:8001/health
curl http://localhost:8000/health
```

### Test Chat API
```bash
curl -X POST http://localhost:8003/api/v1/chat/complete \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello! Test the AI system."}'
```

### Test Document Search API
```bash
curl -X POST http://localhost:8001/api/v2/search/ultra-fast \
  -H "Content-Type: application/json" \
  -d '{"query": "test search query"}'
```

## 📈 Advanced Features Available

### ✅ Machine Learning & AI
- **Thompson Sampling Multi-Armed Bandit**: Bayesian exploration/exploitation
- **Adaptive Routing**: Dynamic model selection based on performance
- **Shadow Routing**: Safe testing of new models without user impact
- **A/B Testing Framework**: Statistical validation of model performance

### ✅ Analytics & Storage
- **ClickHouse**: Cold storage for long-term analytics
- **Dual-Layer Metadata**: Hot (Redis) + Cold (ClickHouse) storage
- **Cost Analytics**: Detailed breakdown by provider and usage
- **Performance Trends**: Historical performance analysis

### ✅ Mathematical Algorithms
- **LSH Index**: Locality-Sensitive Hashing for fast similarity search
- **HNSW Index**: Hierarchical Navigable Small World graphs
- **Product Quantization**: Vector compression for efficient storage
- **Mathematical Batch Processor**: High-performance parallel processing

## 🛠️ Troubleshooting

### Common Issues

1. **Port Access Issues**
   - Ensure ports 8000, 8001, 8003 are exposed in RunPod settings
   - Check firewall settings

2. **Service Not Starting**
   ```bash
   # Check logs
   tail -f /var/log/ai-chat-service.out.log
   tail -f /var/log/document-search-service.out.log
   
   # Restart services
   supervisorctl restart all
   ```

3. **Model Loading Issues**
   ```bash
   # Check Ollama status
   systemctl status ollama
   
   # Pull models manually
   ollama pull phi3:mini
   ollama pull llama3.2
   ```

4. **Memory Issues**
   - Ensure sufficient RAM for models
   - Monitor with `htop`
   - Consider using smaller models

### Reset System
```bash
# Stop all services
supervisorctl stop all
systemctl stop nginx
systemctl stop redis-server

# Restart everything
systemctl start redis-server
systemctl start ollama
supervisorctl start all
systemctl start nginx
```

## 📝 Configuration

### Environment Variables
Edit `/workspace/laughing-guacamole-runpod/unified-ai-search-system/.env`:
```bash
# Add your API keys for enhanced functionality
BRAVE_API_KEY=your_actual_brave_api_key
SCRAPINGBEE_API_KEY=your_actual_scrapingbee_api_key

# Adjust performance settings
DEFAULT_MONTHLY_BUDGET=50.0
RATE_LIMIT_PER_MINUTE=120
TARGET_RESPONSE_TIME=2.0
```

### Service Configuration
- **Supervisor**: `/etc/supervisor/conf.d/unified-ai-search.conf`
- **Nginx**: `/etc/nginx/sites-available/unified-ai-search`

## 🎉 Success Indicators

When deployment is successful, you should see:
- ✅ All services running in supervisor status
- ✅ Health checks return 200 OK
- ✅ UI interfaces load correctly
- ✅ API documentation accessible at `/docs` endpoints
- ✅ Models respond to chat queries
- ✅ Document search returns results

## 🔗 Repository Links

- **Main Repository**: https://github.com/puneetrinity/laughing-guacamole-runpod
- **Deployment Scripts**: `/deploy/runpod/` directory
- **Documentation**: Individual README.md files in each service

## 💡 Next Steps

1. **Test all features** using the UI interfaces
2. **Configure API keys** for external services
3. **Upload documents** to test search functionality
4. **Monitor performance** using the health endpoints
5. **Customize settings** in the `.env` file

---

**Need help?** Check the logs, ensure all services are running, and verify port access. The deployment includes comprehensive error handling and status checks.