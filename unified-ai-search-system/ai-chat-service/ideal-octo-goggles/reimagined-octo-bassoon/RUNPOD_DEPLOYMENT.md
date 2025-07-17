# AI Search System - RunPod A5000 Deployment Guide

## 🚀 **Quick Start**

### **Option 1: Pre-built DockerHub Image (Recommended)**
```bash
# Pull and run the pre-built image
docker run -d --gpus all \
  -p 8000:8000 \
  -p 11434:11434 \
  -p 6379:6379 \
  --name ai-search-system \
  --shm-size=2g \
  advancellmsearch/ai-search-system:runpod-latest
```

### **Option 2: Docker Compose (Full Setup)**
```bash
# Clone the repository
git clone <your-repo-url>
cd advancellmsearch

# Deploy with docker-compose
docker-compose -f docker-compose.runpod.yml up -d
```

---

## 📋 **Prerequisites**

### **RunPod Template Setup**
1. **GPU**: A5000 (24GB VRAM) or equivalent
2. **RAM**: 16GB+ recommended
3. **Storage**: 50GB+ for models and data
4. **Base Image**: CUDA 12.1 compatible

### **Required Ports**
- **8000**: FastAPI application (main API)
- **11434**: Ollama service (LLM models)
- **6379**: Redis cache
- **22**: SSH access (RunPod standard)

---

## 🔧 **Detailed Deployment Steps**

### **Step 1: Create RunPod Instance**
1. Go to RunPod console
2. Create new Pod with A5000 GPU
3. Use CUDA 12.1 base template
4. Set minimum 16GB RAM, 50GB storage

### **Step 2: Initial Setup**
```bash
# Update system
apt update && apt upgrade -y

# Install Docker if not present
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-linux-x86_64" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
```

### **Step 3: Deploy AI Search System**
```bash
# Option A: Direct Docker run
docker run -d --gpus all \
  -p 8000:8000 \
  -p 11434:11434 \
  -p 6379:6379 \
  --name ai-search-system \
  --shm-size=2g \
  --restart unless-stopped \
  -e CUDA_VISIBLE_DEVICES=0 \
  -e ENVIRONMENT=production \
  advancellmsearch/ai-search-system:runpod-latest

# Option B: Using repository
git clone https://github.com/yourusername/advancellmsearch.git
cd advancellmsearch
cp .env.example .env
# Edit .env with your API keys
docker-compose -f docker-compose.runpod.yml up -d
```

### **Step 4: Verify Deployment**
```bash
# Check container status
docker ps

# View logs
docker logs ai-search-system

# Test health endpoint
curl http://localhost:8000/health/live

# Check GPU usage
nvidia-smi
```

---

## 🔍 **Service Management**

### **Container Management**
```bash
# View all services status
docker exec ai-search-system supervisorctl status

# Restart individual services
docker exec ai-search-system supervisorctl restart ollama
docker exec ai-search-system supervisorctl restart ai-search-app
docker exec ai-search-system supervisorctl restart redis

# View service logs
docker exec ai-search-system tail -f /workspace/logs/app.out.log
docker exec ai-search-system tail -f /workspace/logs/ollama.out.log
```

### **Model Management**
```bash
# List available models
docker exec ai-search-system ollama list

# Pull additional models
docker exec ai-search-system ollama pull llama3:8b

# Check GPU memory usage
docker exec ai-search-system nvidia-smi
```

---

## 📊 **Performance Monitoring**

### **Health Checks**
```bash
# Application health
curl http://localhost:8000/health/live
curl http://localhost:8000/health/ready

# System status
curl http://localhost:8000/system/status

# Metrics
curl http://localhost:8000/metrics
```

### **Resource Monitoring**
```bash
# GPU utilization
watch nvidia-smi

# Container resources
docker stats ai-search-system

# Service logs (real-time)
docker exec ai-search-system tail -f /workspace/logs/*.log
```

---

## 🎯 **API Endpoints**

### **Core APIs**
- **Health**: `GET /health/live`
- **Status**: `GET /system/status`
- **Chat**: `POST /api/v1/chat/complete`
- **Search**: `POST /api/v1/search/basic`
- **Research**: `POST /api/v1/research/deep-dive`

### **Documentation**
- **Interactive Docs**: `http://localhost:8000/docs`
- **OpenAPI Spec**: `http://localhost:8000/openapi.json`

---

## 🔧 **Configuration**

### **Environment Variables**
Key environment variables for RunPod deployment:

```bash
# GPU Configuration
CUDA_VISIBLE_DEVICES=0
NVIDIA_VISIBLE_DEVICES=all

# Service URLs
REDIS_URL=redis://localhost:6379
OLLAMA_HOST=http://localhost:11434

# Application Settings
ENVIRONMENT=production
API_HOST=0.0.0.0
API_PORT=8000
LOG_LEVEL=INFO

# Model Settings
DEFAULT_MODEL=phi3:mini
FALLBACK_MODEL=tinyllama:latest
```

### **Adding API Keys**
```bash
# Edit environment file
docker exec -it ai-search-system nano /workspace/.env

# Add your API keys
BRAVE_SEARCH_API_KEY=your_key_here
SCRAPINGBEE_API_KEY=your_key_here

# Restart application
docker exec ai-search-system supervisorctl restart ai-search-app
```

---

## 📈 **Expected Performance**

### **A5000 Capacity Projections**
| Task Type | Model | Response Time | Capacity/Hour |
|-----------|-------|---------------|---------------|
| Resume Parsing | DeepSeek-LLM 7B | 5-7s | 1,000-1,400 |
| Bias Detection | Mistral 7B | 3-4s | 1,800-2,400 |
| Matching Logic | LLaMA3 8B | 6-8s | 900-1,200 |
| Script Generation | LLaMA3 8B | 8-10s | 700-900 |
| Report Generation | Phi3 Mini | 1-2s | 10,800-21,600 |

### **Resource Usage**
- **VRAM**: 18-22GB (peak with all models)
- **RAM**: 8-12GB system memory
- **CPU**: 20-40% utilization
- **Storage**: 30-40GB for models and data

---

## 🛠️ **Troubleshooting**

### **Common Issues**

#### **Container Won't Start**
```bash
# Check Docker logs
docker logs ai-search-system

# Check GPU availability
nvidia-smi

# Verify image
docker images | grep ai-search-system
```

#### **Models Not Loading**
```bash
# Check Ollama service
docker exec ai-search-system curl http://localhost:11434/api/version

# Manually pull models
docker exec ai-search-system ollama pull phi3:mini

# Check model directory
docker exec ai-search-system ls -la /root/.ollama/models
```

#### **High Memory Usage**
```bash
# Check model memory usage
docker exec ai-search-system ollama ps

# Restart services to clear memory
docker exec ai-search-system supervisorctl restart ollama
```

#### **API Not Responding**
```bash
# Check application logs
docker exec ai-search-system tail -f /workspace/logs/app.out.log

# Verify service status
docker exec ai-search-system supervisorctl status

# Test Redis connection
docker exec ai-search-system redis-cli ping
```

### **Performance Optimization**
```bash
# Enable model swapping for memory management
docker exec ai-search-system nano /workspace/.env
# Set: ENABLE_MODEL_SWAPPING=true

# Restart application
docker exec ai-search-system supervisorctl restart ai-search-app
```

---

## 💰 **Cost Optimization**

### **Usage-Based Billing**
For optimal cost efficiency on RunPod:

1. **Monitor Usage**: Track actual processing time vs 24/7 runtime
2. **Auto-Shutdown**: Configure idle shutdown when not in use
3. **Model Selection**: Use appropriate model sizes for tasks
4. **Batch Processing**: Process multiple requests efficiently

### **Expected Costs**
- **A5000 on RunPod**: $0.50-0.80/hour
- **90K resumes/month**: ~150 hours = $75-120/month (usage-based)
- **24/7 availability**: $360-576/month

---

## 🔐 **Security Considerations**

### **Production Security**
1. **Change default passwords** in `.env`
2. **Use strong JWT secrets**
3. **Configure CORS** properly
4. **Enable HTTPS** with reverse proxy
5. **Regular security updates**

### **Firewall Configuration**
```bash
# Only expose necessary ports
ufw allow 8000/tcp  # API
ufw allow 22/tcp    # SSH
ufw enable
```

---

## 📞 **Support**

### **Getting Help**
- **Logs**: Check `/workspace/logs/` for detailed error messages
- **Status**: Use `/system/status` endpoint for system health
- **Performance**: Monitor with `/metrics` endpoint

### **Maintenance**
```bash
# Update image
docker pull advancellmsearch/ai-search-system:runpod-latest
docker-compose -f docker-compose.runpod.yml up -d

# Backup data
docker cp ai-search-system:/workspace/data ./backup/

# Clean up old containers
docker system prune -f
```

This guide provides everything needed for successful RunPod A5000 deployment of the AI Search System!