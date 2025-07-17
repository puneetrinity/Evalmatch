# Local Development Setup

## Overview
This setup allows you to continue development locally without relying on RunPod.

## Prerequisites
- Docker and Docker Compose
- Git
- curl (for testing)

## Quick Start

### 1. Start Development Environment
```bash
./start-local-dev.sh
```

### 2. Test the Environment
```bash
./test-local-dev.sh
```

### 3. Stop Development Environment
```bash
./stop-local-dev.sh
```

## Services

### Document Search Service (Port 8001)
- **Health**: http://localhost:8001/health
- **API Docs**: http://localhost:8001/docs
- **Upload**: http://localhost:8001/api/v2/rag/documents
- **Search**: http://localhost:8001/api/v2/rag/query

### AI Chat Service (Port 8003)
- **Health**: http://localhost:8003/health
- **API Docs**: http://localhost:8003/docs
- **Chat**: http://localhost:8003/api/v1/chat/complete

### Unified UI (Port 8000)
- **Main UI**: http://localhost:8000/
- **Chat UI**: http://localhost:8000/unified_chat.html
- **Upload UI**: http://localhost:8000/index.html

## Development Workflow

### 1. Make Changes
- Edit files in `ai-chat-service/` or `document-search-service/`
- Changes are automatically reflected via volume mounts

### 2. Test Changes
- Use `./test-local-dev.sh` for quick testing
- Or test manually with curl commands

### 3. Commit Changes
```bash
git add .
git commit -m "Your changes"
git push
```

## Features Available Locally

### ✅ Working Features
- Document upload and indexing
- Vector search (FAISS, HNSW, LSH)
- Chat with LLM responses
- Redis caching
- Multi-service routing
- Thompson sampling explanations
- Bandit algorithm discussions

### 🔧 Configuration
- **Redis**: Persistent storage with volume
- **Ollama**: phi3:mini model for chat
- **Nginx**: Reverse proxy and static file serving
- **Environment**: Development-friendly with hot reload

## Troubleshooting

### Services Not Starting
```bash
docker-compose -f docker-compose.local.yml logs
```

### Ollama Model Issues
```bash
docker-compose -f docker-compose.local.yml exec ollama ollama pull phi3:mini
```

### Cache Issues
```bash
docker-compose -f docker-compose.local.yml restart redis
```

## Migration from RunPod

### Changes Applied
1. **Cache Manager Fix**: Fixed UnboundLocalError in chat.py
2. **RAG Integration**: Enhanced chat_graph.py with document search
3. **UI Fixes**: Fixed API endpoints and CORS issues
4. **Nginx Config**: Updated proxy configuration

### RunPod Sync Status
- All critical files synced from RunPod
- Local environment mirrors RunPod functionality
- Development can continue without RunPod dependency

## Next Steps
1. Test the local environment thoroughly
2. Implement additional features locally
3. Set up CI/CD pipeline
4. Deploy to production when ready
