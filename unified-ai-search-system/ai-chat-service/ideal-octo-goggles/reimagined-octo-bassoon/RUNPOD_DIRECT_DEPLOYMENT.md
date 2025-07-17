# Direct RunPod Docker Deployment Guide

## 🚀 **Quick RunPod Deployment (No DockerHub Required)**

### **Option 1: Build Directly on RunPod (Recommended)**

#### **Step 1: Create RunPod Instance**
1. Go to RunPod.io
2. Create new Pod with **A5000 GPU**
3. Use **RunPod PyTorch** or any base template with Docker
4. Set: 16GB+ RAM, 50GB+ storage

#### **Step 2: Clone and Build on RunPod**
```bash
# SSH into your RunPod instance
ssh root@your-runpod-ip

# Clone your repository
git clone https://github.com/puneetrinity/advancedllmsearch1.git
cd advancedllmsearch1

# Build Docker image directly on RunPod (fast GPU instance internet)
docker build -f Dockerfile.runpod-direct -t ai-search-system:local .

# Run the container
docker run -d --gpus all \
  -p 8000:8000 \
  -p 11434:11434 \
  -p 6379:6379 \
  --name ai-search \
  --restart unless-stopped \
  ai-search-system:local
```

#### **Step 3: Verify Deployment**
```bash
# Check container status
docker ps

# Check logs
docker logs ai-search

# Test health endpoint
curl http://localhost:8000/health/live

# Pull additional models if needed
docker exec ai-search ./pull-models.sh
```

---

### **Option 2: Direct File Copy Method**

#### **Step 1: Manual Setup on RunPod**
```bash
# On RunPod instance
mkdir -p /workspace/ai-search
cd /workspace/ai-search

# Install dependencies
apt update && apt install -y curl wget git redis-server python3-pip
curl -fsSL https://ollama.ai/install.sh | sh

# Copy your application files
# (Upload via SCP, SFTP, or git clone)
git clone https://github.com/puneetrinity/advancedllmsearch1.git .

# Install Python dependencies
pip install -r requirements.txt

# Copy environment
cp .env.example .env
```

#### **Step 2: Start Services Manually**
```bash
# Start Redis
redis-server --daemonize yes

# Start Ollama
ollama serve &

# Wait and pull models
sleep 10
ollama pull phi3:mini
ollama pull tinyllama:latest

# Start FastAPI app
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

---

### **Option 3: Docker Compose on RunPod**

#### **Create docker-compose.runpod-simple.yml:**
```yaml
version: '3.8'
services:
  ai-search:
    build:
      context: .
      dockerfile: Dockerfile.runpod-direct
    container_name: ai-search-system
    ports:
      - "8000:8000"
      - "11434:11434" 
      - "6379:6379"
    environment:
      - NVIDIA_VISIBLE_DEVICES=all
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    restart: unless-stopped
    volumes:
      - ./logs:/workspace/logs
      - ollama_data:/root/.ollama
      
volumes:
  ollama_data:
```

#### **Deploy with Compose:**
```bash
# On RunPod
git clone https://github.com/puneetrinity/advancedllmsearch1.git
cd advancedllmsearch1
docker-compose -f docker-compose.runpod-simple.yml up -d
```

---

## 🔧 **RunPod Specific Configuration**

### **Environment Variables for RunPod:**
```bash
export RUNPOD_POD_ID=$(hostname)
export RUNPOD_PUBLIC_IP=$(curl -s ifconfig.me)
export CUDA_VISIBLE_DEVICES=0
export OLLAMA_HOST=http://localhost:11434
export REDIS_URL=redis://localhost:6379
```

### **Firewall/Port Setup:**
```bash
# Expose ports (if needed)
ufw allow 8000/tcp  # API
ufw allow 11434/tcp # Ollama
ufw allow 6379/tcp  # Redis
```

---

## 📊 **Expected Performance**

### **Startup Time:**
- Container build: 5-10 minutes
- Service startup: 2-3 minutes
- Model downloads: 5-15 minutes (depending on models)

### **Resource Usage:**
- **CPU**: 2-4 cores active
- **RAM**: 8-12GB system memory
- **VRAM**: 2-22GB (depending on loaded models)
- **Storage**: 30-50GB total

### **API Endpoints Available:**
```bash
# Health and status
http://localhost:8000/health/live
http://localhost:8000/system/status

# Main APIs
http://localhost:8000/api/v1/chat/complete
http://localhost:8000/api/v1/search/basic
http://localhost:8000/api/v1/research/deep-dive

# Documentation
http://localhost:8000/docs
```

---

## 🛠️ **Troubleshooting**

### **If Container Won't Start:**
```bash
# Check Docker logs
docker logs ai-search

# Check system resources
nvidia-smi
free -h
df -h

# Restart container
docker restart ai-search
```

### **If Models Don't Load:**
```bash
# Check Ollama service
docker exec ai-search curl http://localhost:11434/api/version

# Manually pull models
docker exec ai-search ollama pull phi3:mini

# Check VRAM usage
docker exec ai-search nvidia-smi
```

### **If API Not Responding:**
```bash
# Check if processes are running
docker exec ai-search ps aux

# Check Redis
docker exec ai-search redis-cli ping

# Restart FastAPI
docker exec ai-search pkill -f uvicorn
docker exec ai-search python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 &
```

---

## 🎯 **Quick Test Commands**

### **Test Chat API:**
```bash
curl -X POST http://localhost:8000/api/v1/chat/complete \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello, test the AI search system",
    "session_id": "test123",
    "user_id": "testuser"
  }'
```

### **Test Search API:**
```bash
curl -X POST http://localhost:8000/api/v1/search/basic \
  -H "Content-Type: application/json" \
  -d '{
    "query": "artificial intelligence trends",
    "max_results": 5
  }'
```

---

## 💰 **Cost Optimization**

### **For Development/Testing:**
- Use **Community Cloud** instances when available
- Stop instance when not in use
- Use smaller models (phi3:mini, tinyllama)

### **For Production:**
- Use **Secure Cloud** for guaranteed availability
- Consider **Spot instances** for cost savings
- Implement auto-scaling based on demand

---

## ✅ **Deployment Checklist**

- [ ] RunPod A5000 instance created
- [ ] Repository cloned on RunPod
- [ ] Docker image built successfully
- [ ] Container running and healthy
- [ ] All ports accessible
- [ ] Models downloaded and loaded
- [ ] API endpoints responding
- [ ] Health checks passing
- [ ] GPU memory usage normal

This approach gives you a **production-ready AI Search System** running directly on RunPod without needing DockerHub or external dependencies!