# 🚀 Ultra Fast Search System - Complete Setup Guide

## Overview

This guide provides multiple ways to clone and set up the Ultra Fast Search System, from automated scripts to manual step-by-step instructions.

## 📋 Prerequisites

Before starting, ensure you have:

1. **Git** - For cloning the repository
   - Download from [git-scm.com](https://git-scm.com/)
   - Verify: `git --version`

2. **Docker Desktop** - For running the containerized application
   - Download from [docker.com](https://www.docker.com/get-started)
   - Verify: `docker --version` and `docker-compose --version`

3. **PowerShell** or **Command Prompt** - For running commands
   - PowerShell is recommended for Windows 10/11

## 🎯 Quick Setup (Recommended)

### Option 1: Automated Setup with Scripts

1. **Clone the repository:**
   ```powershell
   git clone https://github.com/puneetrinity/ideal-octo-goggles.git
   cd ideal-octo-goggles
   ```

2. **Run the automated setup:**
   
   **PowerShell (Recommended):**
   ```powershell
   # Allow script execution (run as Administrator if needed)
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   
   # Run setup script
   .\setup.ps1
   ```
   
   **Command Prompt:**
   ```cmd
   setup.bat
   ```

The script will:
- ✅ Check Docker installation
- ✅ Create environment configuration
- ✅ Build and start all services
- ✅ Build search indexes
- ✅ Verify system is working

### Option 2: Manual Setup

If you prefer to set up manually or the scripts don't work for your environment:

1. **Clone and navigate:**
   ```powershell
   git clone https://github.com/puneetrinity/ideal-octo-goggles.git
   cd ideal-octo-goggles
   ```

2. **Create environment file:**
   ```powershell
   # Copy example to create your config
   copy .env.example .env
   
   # Optional: Edit configuration
   notepad .env
   ```

3. **Start the system:**
   ```powershell
   # Build and start (first time takes 5-10 minutes)
   docker-compose up --build
   
   # Or run in background:
   docker-compose up --build -d
   ```

4. **Build indexes (in new terminal):**
   ```powershell
   # Wait for system to fully start, then run:
   curl -X POST -H "Content-Type: application/json" -d '{\"data_source\": \"data/resumes.json\"}' http://localhost/api/v2/admin/build-indexes
   
   # Or with PowerShell:
   Invoke-RestMethod -Uri "http://localhost/api/v2/admin/build-indexes" -Method POST -ContentType "application/json" -Body '{"data_source": "data/resumes.json"}'
   ```

## 🔧 Configuration Options

### Environment Variables (.env file)

```bash
# Embedding model configuration
EMBEDDING_MODEL_NAME=all-MiniLM-L6-v2  # Lightweight, fast model
EMBEDDING_DIM=384                       # Model dimension

# Performance settings
USE_GPU=false                          # Set to true if you have CUDA GPU

# Storage paths
INDEX_PATH=./indexes                   # Where to store search indexes
```

### Advanced Configuration

**For better performance:**
- Set `USE_GPU=true` if you have an NVIDIA GPU with CUDA
- Use a larger model like `all-mpnet-base-v2` for better accuracy

**For development:**
- Mount your own data directory in `docker-compose.yml`
- Modify port mappings if needed

## 🧪 Verification Steps

After setup, verify everything works:

1. **Check system health:**
   ```powershell
   curl http://localhost/api/v2/health
   ```

2. **Test search functionality:**
   ```powershell
   curl -X POST -H "Content-Type: application/json" -d '{\"query\": \"python developer\"}' http://localhost/api/v2/search/ultra-fast
   ```

3. **View system metrics:**
   ```powershell
   curl http://localhost/api/v2/metrics
   ```

4. **Access web interface:**
   - API Documentation: http://localhost/docs
   - Alternative docs: http://localhost/redoc

## 🔍 What Each Component Does

### Docker Services

- **app**: Main FastAPI application (Python)
- **nginx**: Reverse proxy and load balancer
- **volumes**: Persistent storage for indexes and data

### Key Directories

- `app/`: Main application source code
- `data/`: Sample data (resumes.json)
- `indexes/`: Built search indexes (created automatically)
- `tests/`: Test suite

### Important Files

- `docker-compose.yml`: Service orchestration
- `requirements.txt`: Python dependencies
- `.env`: Environment configuration
- `Dockerfile`: Application container definition

## 📊 Expected Performance

After successful setup:

- **Index Build Time**: 30-60 seconds (1,000 documents)
- **Search Response Time**: 50-200ms
- **Memory Usage**: ~200MB base + ~1MB per 1,000 documents
- **Throughput**: 100+ concurrent searches/second

## 🛠️ Troubleshooting

### Common Issues

**1. Docker not running**
```
Error: Cannot connect to the Docker daemon
Solution: Start Docker Desktop
```

**2. Port conflicts**
```
Error: Port 80 already in use
Solution: Check what's using the port:
  netstat -ano | findstr :80
  Stop the conflicting service or change ports in docker-compose.yml
```

**3. Curl not found**
```powershell
# Use PowerShell instead:
Invoke-RestMethod -Uri "http://localhost/api/v2/health"
```

**4. Long startup time**
```
First run downloads embedding model (~90MB)
Subsequent runs start in 10-30 seconds
```

**5. Index build fails**
```
Check logs: docker-compose logs app
Ensure system has started completely before building indexes
```

### Debugging Commands

```powershell
# View logs
docker-compose logs app

# Check running containers
docker-compose ps

# Restart services
docker-compose restart

# Clean restart
docker-compose down
docker-compose up --build
```

## 🎯 Next Steps

Once your system is running:

1. **Add Your Own Data**: Replace `data/resumes.json` with your data
2. **Scale Configuration**: See `TERABYTE_SCALE_ANALYSIS.md`
3. **Integration**: Check `INTEGRATION_STEP_BY_STEP.md`
4. **Development**: See `DEVELOPER_ONBOARDING.md`

## 📚 Additional Resources

- **API Documentation**: http://localhost/docs (when running)
- **Performance Tuning**: `README.md` → Performance section
- **Scaling Guide**: `TERABYTE_SCALE_ANALYSIS.md`
- **Integration Examples**: `INTEGRATION_STEP_BY_STEP.md`
- **Email Search**: `EMAIL_SEARCH_ENHANCEMENT_PLAN.md`

## 🆘 Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review logs: `docker-compose logs app`
3. Verify prerequisites are installed correctly
4. Check system resources (Docker needs 2GB+ RAM)
5. Ensure internet connectivity for initial downloads

---

## 📝 Summary

**Fastest Setup**: Run `setup.ps1` or `setup.bat`
**Manual Setup**: Clone → Create .env → docker-compose up → Build indexes
**Verification**: Check health endpoint and run a test search
**Next**: Add your own data and start searching!

The system is designed to be production-ready out of the box with reasonable defaults. Most users can get started with the automated setup scripts without any configuration changes.
