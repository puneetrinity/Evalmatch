# Ultra Fast Search System - Quick Start Guide

## 🚀 Get Up and Running in 5 Minutes

This guide will help you clone, set up, and start using the ultra fast search system quickly.

## Prerequisites

Before you begin, ensure you have the following installed:

1. **Git** - To clone the repository
2. **Docker** - Download from [docker.com](https://www.docker.com/get-started)
3. **Docker Compose** - Usually included with Docker Desktop

## Step-by-Step Setup

### 1. Clone the Repository

```powershell
# Navigate to your desired directory
cd C:\Users\YourUsername\Documents

# Clone the repository
git clone https://github.com/puneetrinity/ideal-octo-goggles.git

# Navigate into the project directory
cd ideal-octo-goggles
```

### 2. Configure Environment Variables

```powershell
# Copy the example environment file
copy .env.example .env

# Optional: Edit the .env file to customize settings
# Default settings work for most users
notepad .env
```

**Default Configuration:**
- Uses CPU-only processing (works on all systems)
- Stores indexes in `./indexes` directory
- Uses the lightweight `all-MiniLM-L6-v2` embedding model

### 3. Start the System

```powershell
# Build and start all services (this will take a few minutes the first time)
docker-compose up --build

# If you want to run in the background, use:
# docker-compose up --build -d
```

**What happens during startup:**
- Downloads the embedding model (~90MB) - first time only
- Starts the FastAPI application on port 8000
- Starts Nginx proxy on port 80
- Creates necessary directories

### 4. Build Search Indexes

Open a **new PowerShell window** and run:

```powershell
# Build indexes using the sample resume data
curl -X POST -H "Content-Type: application/json" -d '{\"data_source\": \"data/resumes.json\"}' http://localhost/api/v2/admin/build-indexes
```

**Expected output:**
```json
{
  "message": "Indexes built successfully",
  "processing_time": "45.2s",
  "documents_processed": 1000
}
```

### 5. Test the Search

```powershell
# Simple search query
curl -X POST -H "Content-Type: application/json" -d '{\"query\": \"python developer\"}' http://localhost/api/v2/search/ultra-fast

# Advanced search with filters
curl -X POST -H "Content-Type: application/json" -d '{\"query\": \"senior engineer\", \"num_results\": 5, \"filters\": {\"min_experience\": 5}}' http://localhost/api/v2/search/ultra-fast
```

## Key Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v2/admin/build-indexes` | POST | Build search indexes |
| `/api/v2/search/ultra-fast` | POST | Perform searches |
| `/api/v2/search/performance` | GET | Get performance stats |
| `/api/v2/health` | GET | System health check |
| `/api/v2/metrics` | GET | System metrics |

## Web Interface

Once running, you can also access:
- **API Documentation**: http://localhost/docs (Swagger UI)
- **Alternative API Docs**: http://localhost/redoc (ReDoc)

## Common Issues & Solutions

### Issue: Docker build fails
**Solution:** Ensure Docker is running and you have internet access for package downloads.

### Issue: Port 80 already in use
**Solution:** 
```powershell
# Find what's using port 80
netstat -ano | findstr :80

# Stop the conflicting service or modify docker-compose.yml to use a different port
```

### Issue: Curl command not found
**Solution:** 
```powershell
# Install curl for Windows or use PowerShell's Invoke-RestMethod
Invoke-RestMethod -Uri "http://localhost/api/v2/search/ultra-fast" -Method POST -ContentType "application/json" -Body '{"query": "python developer"}'
```

### Issue: Index building takes too long
**Solution:** The first build processes the entire dataset and trains the quantizer. Subsequent builds are much faster due to index persistence.

## Development Mode

If you want to develop and make changes:

```powershell
# Run in development mode with auto-reload
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

## Stopping the System

```powershell
# Stop all services
docker-compose down

# Stop and remove all data (including indexes)
docker-compose down -v
```

## Next Steps

1. **Add Your Own Data**: Replace `data/resumes.json` with your own JSON data
2. **Customize Configuration**: Modify `.env` file for your specific needs
3. **Scale Up**: See `TERABYTE_SCALE_ANALYSIS.md` for scaling guidance
4. **Integrate**: Check `INTEGRATION_STEP_BY_STEP.md` for integration examples

## Performance Expectations

- **Index Building**: 30-60 seconds for 1,000 documents
- **Search Latency**: 50-200ms per query
- **Memory Usage**: ~200MB base + ~1MB per 1,000 documents
- **Throughput**: 100+ queries per second

## Support

If you encounter issues:
1. Check the logs: `docker-compose logs app`
2. Verify health: http://localhost/api/v2/health
3. Check system metrics: http://localhost/api/v2/metrics
4. Review the troubleshooting section in `README.md`

---

🎉 **Congratulations!** You now have a production-ready, ultra-fast search system running locally.
