# Deployment Guide - AI Search System

## Overview

Streamlined deployment configurations for the AI Search System with LangGraph orchestration and local-first Ollama processing.

## Deployment Options

### 1. Local Development
```bash
docker-compose up --build
```

### 2. Production 
```bash
docker-compose -f docker-compose.production.yml up --build
```

### 3. RunPod GPU Cloud
```bash
docker-compose -f docker-compose.runpod.yml up --build
```

## Quick Start

### Prerequisites
- Docker & Docker Compose
- For RunPod: GPU-enabled container environment
- API Keys: `BRAVE_API_KEY`, `SCRAPINGBEE_API_KEY` (optional but recommended)

### Environment Variables
Create `.env` file:
```bash
# Core Services
REDIS_URL=redis://localhost:6379
OLLAMA_HOST=http://localhost:11434

# API Keys (optional for basic functionality)
BRAVE_API_KEY=your_brave_search_api_key
SCRAPINGBEE_API_KEY=your_scrapingbee_api_key

# System Configuration
ENVIRONMENT=production
DEFAULT_MODEL=phi3:mini
LOG_LEVEL=INFO
```

### Health Check
```bash
curl http://localhost:8000/health
```

### API Documentation
- Local: http://localhost:8000/docs
- RunPod: https://your-pod-url/docs

## Service URLs

| Service | Local | RunPod |
|---------|-------|---------|
| API | http://localhost:8000 | https://pod-url-8000.proxy.runpod.net |
| Ollama | http://localhost:11434 | https://pod-url-11434.proxy.runpod.net |
| Redis | localhost:6379 | Internal only |

## Key Features

✅ **Model Management API** - Download models via HTTP  
✅ **Terminal-Safe RunPod Deployment** - Proper TTY and PID 1 handling  
✅ **Multi-Provider Search** - Brave Search + ScrapingBee integration  
✅ **Cost-Optimized** - 85% local inference with API fallbacks  
✅ **LangGraph Orchestration** - Intelligent workflow management  
✅ **Production Ready** - Health checks, logging, monitoring