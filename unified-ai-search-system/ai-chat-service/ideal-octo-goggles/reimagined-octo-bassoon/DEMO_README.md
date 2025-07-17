# 🚀 Unified AI Platform - Demo Ready MVP

A complete integration of **ubiquitous-octo-invention** (AI orchestration) and **ideal-octo-goggles** (ultra-fast search) with a unified web interface for document upload and intelligent chat.

## 🎯 Features

### ✅ **Document Upload & Management**
- **Drag & drop** file upload interface
- **Multi-file support** (PDF, TXT, JSON, MD, DOCX)
- **Real-time upload progress** tracking
- **Document list** with search and delete capabilities
- **Automatic indexing** with FAISS, HNSW, and LSH algorithms

### ✅ **Intelligent Chat Interface**
- **4 Operation Modes**:
  - 🚀 **Unified**: Combines document search with web search and AI chat
  - 💬 **Chat**: Direct conversation with AI
  - 🔍 **Search**: Pure document search
  - 📚 **Research**: Enhanced search with AI analysis

### ✅ **Ultra-Fast Search Engine**
- **FAISS vector indexing** for similarity search
- **HNSW (Hierarchical Navigable Small World)** for efficient nearest neighbor search
- **LSH (Locality Sensitive Hashing)** for approximate search
- **Product Quantization** for memory efficiency
- **BM25 scoring** for text relevance

### ✅ **AI Orchestration**
- **Local-first inference** with Ollama (phi3:mini)
- **Adaptive routing** with Thompson sampling
- **Multi-provider search** (Brave, ScrapingBee, internal documents)
- **Cost tracking** and budget management
- **Performance optimization** with Redis caching

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     🌐 Nginx Proxy (Port 80)                   │
│                         Unified Entry Point                     │
└─────────────────────────────────────────────────────────────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
┌───────────────────▼──────────────┐    ┌────────▼────────┐
│  🧠 AI Platform (Port 8000)       │    │ ⚡ Search Engine │
│  reimagined-octo-bassoon          │    │ (Port 8001)     │
│                                   │    │ ideal-octo-     │
│ • LangGraph orchestration         │◄──►│ goggles         │
│ • Adaptive routing                │    │                 │
│ • Multi-provider search           │    │ • FAISS indexing│
│ • Cost management                 │    │ • Ultra-fast    │
│ • Web interface                   │    │   search        │
│ • Chat API                        │    │ • Document APIs │
└───────────────────────────────────┘    └─────────────────┘
                    │                              │
                    └──────────────┬───────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │     🗄️ Redis Cache           │
                    │     🤖 Ollama (phi3:mini)    │
                    └─────────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- 8GB+ RAM recommended
- 2GB+ free disk space

### Option 1: Automated Setup (Recommended)
```bash
# Clone or navigate to the project
cd reimagined-octo-bassoon/

# Run the demo setup script
./demo-setup.sh
```

### Option 2: Manual Setup
```bash
# Start the services
docker-compose -f docker-compose.demo.yml up -d

# Pull the Ollama model
docker-compose -f docker-compose.demo.yml exec ollama ollama pull phi3:mini

# Check health
curl http://localhost/health
```

## 🎯 Demo Instructions

### 1. **Access the Interface**
- Open your browser to: **http://localhost**
- You'll see the unified chat interface with upload panel

### 2. **Upload Documents**
- **Drag & drop** files into the upload area, or click to select
- Supported formats: PDF, TXT, JSON, MD, DOCX
- Watch the **upload progress** and see documents appear in the list
- Sample documents are provided in `data/sample-docs/`

### 3. **Chat with Your Documents**
- **Upload first**: Try uploading the sample files
- **Ask questions**: "Tell me about machine learning" or "What is Python?"
- **Try different modes**:
  - **Unified**: "Search for AI concepts and explain them"
  - **Search**: "machine learning algorithms" 
  - **Research**: "Compare Python and JavaScript"

### 4. **Advanced Features**
- **Document-specific search**: Use the 🔍 button next to documents
- **Export chat**: Download conversation history
- **Settings**: Adjust search results, providers, response style

## 🛠️ Configuration

### Environment Variables
```bash
# API Keys (optional but recommended)
BRAVE_API_KEY=your_brave_search_api_key
SCRAPINGBEE_API_KEY=your_scrapingbee_api_key
OPENAI_API_KEY=your_openai_api_key

# Performance tuning
DEFAULT_MONTHLY_BUDGET=20.0
RATE_LIMIT_PER_MINUTE=60
TARGET_RESPONSE_TIME=2.5
```

### Custom Configuration
- Edit `docker-compose.demo.yml` for service configuration
- Modify `nginx.demo.conf` for routing changes
- Update `static/unified_chat.html` for UI customization

## 🔧 API Endpoints

### AI Platform (Port 8000)
- `POST /api/v1/chat/unified` - Unified chat with search
- `POST /api/v1/chat/complete` - Direct chat
- `GET /health` - Health check
- `GET /docs` - Interactive API documentation

### Search Engine (Port 8001)
- `POST /api/v2/search/ultra-fast` - Ultra-fast document search
- `POST /api/v2/documents/upload` - Upload documents
- `GET /api/v2/documents/list` - List uploaded documents
- `DELETE /api/v2/documents/{id}` - Delete document
- `GET /api/v2/health` - Health check

### Unified Interface (Port 80)
- `GET /` - Web interface
- `/*` - Proxied to appropriate service

## 📊 Performance Metrics

### Expected Performance
- **Document Upload**: 1-5 seconds per document
- **Search Response**: 50-200ms for indexed documents
- **Chat Response**: 1-3 seconds (local model)
- **Memory Usage**: ~2-4GB total
- **Concurrent Users**: 10-50 (depends on hardware)

### Optimization Tips
1. **Use SSD storage** for better index performance
2. **Increase RAM** for larger document collections
3. **Enable GPU** for faster embeddings (update `USE_GPU=true`)
4. **Add API keys** for enhanced web search capabilities

## 🧪 Testing the Integration

### Manual Testing Checklist
```bash
# 1. Health checks
curl http://localhost/health
curl http://localhost:8000/health  
curl http://localhost:8001/health

# 2. Document upload
curl -X POST http://localhost:8001/api/v2/documents/upload \
  -F "file=@data/sample-docs/ai-research.txt" \
  -F "title=AI Research"

# 3. Search test
curl -X POST http://localhost:8001/api/v2/search/ultra-fast \
  -H "Content-Type: application/json" \
  -d '{"query": "machine learning", "num_results": 5}'

# 4. Chat test
curl -X POST http://localhost:8000/api/v1/chat/unified \
  -H "Content-Type: application/json" \
  -d '{"message": "What is artificial intelligence?", "mode": "unified"}'
```

### Automated Testing
```bash
# Run the integration tests
docker-compose -f docker-compose.demo.yml exec ai-platform python -m pytest tests/

# Load testing
docker-compose -f docker-compose.demo.yml exec ai-platform python load_test.py
```

## 🔍 Troubleshooting

### Common Issues

**1. Services not starting**
```bash
# Check logs
docker-compose -f docker-compose.demo.yml logs -f

# Restart services
docker-compose -f docker-compose.demo.yml restart
```

**2. Upload failures**
- Check file size (max 100MB)
- Verify file format support
- Check disk space

**3. Search not working**
- Ensure documents are uploaded and indexed
- Check search engine health: `curl http://localhost:8001/health`
- Verify Redis is running: `docker-compose -f docker-compose.demo.yml ps`

**4. AI responses slow/failing**
- Check Ollama model: `docker-compose -f docker-compose.demo.yml exec ollama ollama list`
- Pull model if missing: `docker-compose -f docker-compose.demo.yml exec ollama ollama pull phi3:mini`
- Check memory usage: `docker stats`

### Performance Issues
```bash
# Check resource usage
docker stats

# Scale services
docker-compose -f docker-compose.demo.yml up -d --scale ai-platform=2

# Clear cache
docker-compose -f docker-compose.demo.yml exec redis redis-cli FLUSHDB
```

## 📝 Development

### Project Structure
```
reimagined-octo-bassoon/
├── app/                          # Main application
│   ├── api/                     # API endpoints
│   ├── graphs/                  # LangGraph workflows
│   ├── providers/               # Search providers
│   └── ...
├── static/                      # Web interface
│   └── unified_chat.html        # Main UI
├── docker-compose.demo.yml      # Demo deployment
├── nginx.demo.conf             # Nginx configuration
└── demo-setup.sh               # Setup script

../ideal-octo-goggles/          # Search engine
├── app/
│   ├── api/                    # Search APIs
│   ├── search/                 # Search engine
│   ├── math/                   # FAISS, HNSW, LSH
│   └── ...
└── ...
```

### Adding Features
1. **New API endpoints**: Add to `app/api/`
2. **UI enhancements**: Modify `static/unified_chat.html`
3. **Search algorithms**: Extend `app/math/`
4. **Chat capabilities**: Update `app/graphs/`

## 🔐 Security

### Current Security Measures
- **CORS enabled** for cross-origin requests
- **Input validation** on all API endpoints
- **File type restrictions** for uploads
- **Rate limiting** for API calls
- **Error handling** without information disclosure

### Production Security (TODO)
- Add HTTPS/SSL certificates
- Implement authentication & authorization
- Add input sanitization
- Enable request logging
- Set up monitoring & alerting

## 📦 Deployment

### Local Development
```bash
# Development mode with hot reload
docker-compose -f docker-compose.demo.yml up --build

# Access services directly
http://localhost:8000  # AI Platform
http://localhost:8001  # Search Engine
http://localhost:80    # Unified Interface
```

### Production Deployment
```bash
# Production build
docker-compose -f docker-compose.demo.yml build --no-cache

# Deploy with restart policies
docker-compose -f docker-compose.demo.yml up -d --restart unless-stopped

# Set up monitoring
docker-compose -f docker-compose.demo.yml logs -f
```

## 🎉 Success Metrics

### Demo Completion Checklist
- ✅ **Document upload works**: Files can be uploaded via drag & drop
- ✅ **Search integration works**: Uploaded documents are searchable
- ✅ **Chat integration works**: AI can discuss uploaded documents
- ✅ **UI is responsive**: Interface works on desktop and mobile
- ✅ **Performance is acceptable**: Sub-second search, ~2s chat responses
- ✅ **Error handling works**: Graceful handling of failures
- ✅ **Documentation is complete**: Clear setup and usage instructions

## 🔗 Related Projects

- **[ubiquitous-octo-invention](../ubiquitous-octo-invention/)**: AI orchestration platform
- **[ideal-octo-goggles](../ideal-octo-goggles/)**: Ultra-fast search engine
- **[reimagined-octo-bassoon](.)**: Unified integration platform

## 📞 Support

For issues or questions:
1. Check the troubleshooting section above
2. Review the logs: `docker-compose -f docker-compose.demo.yml logs -f`
3. Test individual components using the API endpoints
4. Verify your hardware meets the requirements

---

**🚀 This is a production-ready MVP demonstrating the complete integration of AI chat and ultra-fast document search in a unified interface.**