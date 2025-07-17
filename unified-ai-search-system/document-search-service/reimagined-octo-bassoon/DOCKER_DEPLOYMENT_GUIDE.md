# 🐳 Docker Deployment Guide - Unified AI Platform

## 🎯 **Overview**

This guide covers building, testing, and deploying the unified AI platform using Docker with the following components:

- **🧠 Conversation AI** (ubiquitous-octo-invention) 
- **⚡ Document Search** (ideal-octo-goggles)
- **🌐 Unified Proxy** (Nginx)
- **🗄️ Shared Cache** (Redis)
- **📊 Monitoring** (Prometheus)

## 🏗️ **Build Process**

### **Step 1: Local Build and Test**

```powershell
# Build and test locally
.\build-and-test.ps1
```

This script will:
1. ✅ Check Docker environment
2. 🧹 Clean previous builds
3. 🏗️ Build both optimized Docker images
4. 🚀 Start all services
5. 🧪 Run comprehensive health checks
6. 📊 Display service URLs

### **Step 2: Push to Docker Hub**

```powershell
# Login to Docker Hub first
docker login

# Push images (replace 'yourusername' with your Docker Hub username)
.\push-to-dockerhub.ps1 -DockerHubUsername "yourusername"
```

This script will:
1. 🔐 Verify Docker Hub login
2. 🏷️ Tag images for Docker Hub
3. 📤 Push both images
4. 📝 Create deployment compose file
5. 🎉 Provide deployment instructions

## 📋 **Available Docker Compose Files**

| File | Purpose | Usage |
|------|---------|-------|
| `docker-compose.local.yml` | Local development/testing | Build from source |
| `docker-compose.dockerhub.yml` | Production deployment | Use Docker Hub images |
| `docker-compose.unified.yml` | Original unified config | Legacy/reference |

## 🚀 **Deployment Options**

### **Option 1: Local Development**
```bash
# Build and run locally
docker-compose -f docker-compose.local.yml up -d

# View logs
docker-compose -f docker-compose.local.yml logs -f

# Stop services
docker-compose -f docker-compose.local.yml down
```

### **Option 2: Production (Docker Hub)**
```bash
# Deploy from Docker Hub (no build required)
docker-compose -f docker-compose.dockerhub.yml up -d

# Monitor services
docker-compose -f docker-compose.dockerhub.yml ps

# Update services
docker-compose -f docker-compose.dockerhub.yml pull
docker-compose -f docker-compose.dockerhub.yml up -d
```

### **Option 3: Quick Test**
```bash
# Just test the connection demo
python connection_demo.py

# Run comprehensive tests
python test_system_connection.py
```

## 🔍 **Service Health Checks**

All services include comprehensive health checks:

### **Health Check URLs:**
- **🧠 Conversation AI**: http://localhost:8000/health/live
- **⚡ Document Search**: http://localhost:8080/api/v2/health  
- **🌐 Nginx Proxy**: http://localhost/status
- **🗄️ Redis**: `redis-cli ping`

### **Expected Response Times:**
- **Conversation AI**: ~2-5 seconds startup
- **Document Search**: ~5-10 seconds startup
- **Redis**: ~1-2 seconds startup
- **Nginx**: ~1 second startup

## 📊 **Access Points**

| Service | URL | Description |
|---------|-----|-------------|
| **Main Interface** | http://localhost/ | Unified web interface |
| **Conversation API** | http://localhost:8000/ | Chat and web search |
| **Document Search** | http://localhost:8080/ | Vector search API |
| **Monitoring** | http://localhost:9090/ | Prometheus metrics |
| **Test Interface** | http://localhost/test | Built-in testing |

## 🧪 **Testing Commands**

### **Health Check All Services:**
```powershell
# Test Redis
docker exec ai-redis redis-cli ping

# Test Conversation AI
curl http://localhost:8000/health/live

# Test Document Search
curl http://localhost:8080/api/v2/health

# Test Nginx Proxy
curl http://localhost/status
```

### **API Testing:**
```bash
# Test conversation
curl -X POST http://localhost:8000/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"query": "Hello, how are you?"}'

# Test document search
curl -X POST http://localhost:8080/api/v2/search/ultra-fast \
  -H "Content-Type: application/json" \
  -d '{"query": "machine learning", "num_results": 5}'

# Test unified proxy
curl -X POST http://localhost/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"query": "Tell me about AI"}'
```

## 🔧 **Troubleshooting**

### **Common Issues:**

#### **Port Conflicts**
```bash
# Check port usage
netstat -tlnp | grep -E ":(80|8000|8080|6379|9090)"

# Stop conflicting services
docker-compose down
```

#### **Build Failures**
```bash
# Clean Docker system
docker system prune -a

# Rebuild specific service
docker-compose -f docker-compose.local.yml build --no-cache conversation-ai
```

#### **Memory Issues**
```bash
# Check Docker resources
docker system df

# Increase Docker memory in Docker Desktop settings
# Recommended: 8GB RAM, 4GB Swap
```

#### **Service Won't Start**
```bash
# Check logs
docker-compose -f docker-compose.local.yml logs conversation-ai

# Check container status
docker ps -a

# Restart specific service
docker-compose -f docker-compose.local.yml restart conversation-ai
```

## 📈 **Performance Optimization**

### **Resource Requirements:**
- **Minimum**: 8GB RAM, 2 CPU cores, 20GB storage
- **Recommended**: 16GB RAM, 4 CPU cores, 50GB storage
- **Optimal**: 32GB RAM, 8 CPU cores, 100GB storage

### **Scaling Options:**
```yaml
# Scale document search (in compose file)
document-search:
  deploy:
    replicas: 3
    resources:
      limits:
        memory: 4G
      reservations:
        memory: 2G
```

## 🔐 **Security Configuration**

### **Production Environment Variables:**
```env
# Add to .env file
ENVIRONMENT=production
LOG_LEVEL=info
REDIS_PASSWORD=your-secure-password
JWT_SECRET=your-jwt-secret
API_RATE_LIMIT=100
```

### **SSL/HTTPS Setup:**
```nginx
# Add to nginx-unified.conf
server {
    listen 443 ssl;
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    # ... rest of config
}
```

## 🚀 **Production Deployment Checklist**

### **Pre-Deployment:**
- [ ] Docker Hub images pushed and verified
- [ ] Environment variables configured
- [ ] SSL certificates installed (if needed)
- [ ] Firewall rules configured
- [ ] Backup strategy implemented

### **Deployment:**
- [ ] Pull latest images: `docker-compose pull`
- [ ] Start services: `docker-compose up -d`
- [ ] Verify health checks: All services healthy
- [ ] Run integration tests: `python test_system_connection.py`
- [ ] Monitor logs: `docker-compose logs -f`

### **Post-Deployment:**
- [ ] Set up monitoring alerts
- [ ] Configure log rotation
- [ ] Schedule regular backups
- [ ] Document runbook procedures

## 📞 **Support & Monitoring**

### **Log Locations:**
- **Conversation AI**: `/app/logs/`
- **Document Search**: `/app/logs/`
- **Nginx**: `/var/log/nginx/`
- **Redis**: Docker logs

### **Monitoring Metrics:**
- **Response times**: All services < 5s
- **Memory usage**: < 80% of allocated
- **CPU usage**: < 70% average
- **Disk usage**: < 85% of allocated

### **Backup Commands:**
```bash
# Backup Redis data
docker exec ai-redis redis-cli save
docker cp ai-redis:/data/dump.rdb ./backup/

# Backup document indexes
docker cp document-search:/app/indexes ./backup/

# Backup configuration
cp docker-compose.dockerhub.yml ./backup/
cp nginx-unified.conf ./backup/
```

---

## 🎉 **Success Criteria**

When everything is working correctly:

✅ **All health checks return HTTP 200**  
✅ **Services start within expected timeframes**  
✅ **API endpoints respond correctly**  
✅ **Integration tests pass**  
✅ **Monitoring shows healthy metrics**  
✅ **Users can access unified interface**  

**🎯 Your unified AI platform is now production-ready and scalable!**
