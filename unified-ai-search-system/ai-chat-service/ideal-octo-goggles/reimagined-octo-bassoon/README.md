# Unified AI Platform

A comprehensive AI platform that integrates search, chat, and research capabilities with a modern web interface.

## 🎯 Features

- **Unified Chat Interface** - Web-based chat with multiple interaction modes
- **Advanced Search** - Intelligent document search with LLM processing
- **Research Mode** - Deep analysis and research capabilities  
- **Real-time Processing** - Streaming responses and live updates
- **Docker Deployment** - Containerized architecture for easy deployment
- **Health Monitoring** - Comprehensive system health checks

## 🏗️ Architecture

The platform consists of:

1. **Frontend**: Modern web interface (`unified_chat.html`)
2. **Chat Service**: FastAPI service on port 8000 (`ubiquitous-octo-invention`)
3. **Search Service**: FastAPI service on port 8001 (`ideal-octo-goggles`)
4. **Infrastructure**: Redis, nginx, supervisor for orchestration

## 🚀 Quick Start

### Using Docker Compose (Recommended)

```bash
# Start the unified platform
docker-compose -f docker-compose.unified.yml up --build

# Access the interface
open http://localhost
```

### Manual Deployment

```bash
# Start individual services
cd ubiquitous-octo-invention && uvicorn app.main:app --host 0.0.0.0 --port 8000
cd ideal-octo-goggles && uvicorn main:app --host 0.0.0.0 --port 8001
```

## 📚 Usage

### Web Interface

Navigate to `http://localhost` to access the unified chat interface with four modes:

1. **Unified Mode** - Combined chat and search
2. **Chat Mode** - Pure conversational AI
3. **Search Mode** - Document search and retrieval
4. **Research Mode** - Deep analysis and insights

### API Endpoints

- **Chat API**: `POST /chat` - Conversational AI interactions
- **Search API**: `POST /search` - Document search and analysis
- **Health Check**: `GET /health` - System status monitoring

## 🔧 Configuration

Key configuration files:
- `docker-compose.unified.yml` - Docker orchestration
- `nginx-unified.conf` - Reverse proxy configuration
- `app/config.py` - Application settings

## 📊 Monitoring

The platform includes comprehensive health monitoring:
- Service availability checks
- Response time monitoring
- Error rate tracking
- Resource utilization metrics

## 🛠️ Development

### Local Development Setup

```bash
# Clone the repository
git clone <repo-url>
cd unified-ai-platform

# Install dependencies
pip install -r requirements.txt

# Start development servers
python start_development.py
```

### Testing

```bash
# Run comprehensive tests
python test_unified_deployment.py

# Health checks
curl http://localhost/health
```

## 📝 Documentation

Additional documentation available:
- [Deployment Guide](DOCKER_DEPLOYMENT_GUIDE.md)
- [Connection Strategy](DIRECT_CONNECTION_STRATEGY.md)
- [System Architecture](SYSTEM_CONNECTION_COMPLETE.md)

## 🏢 Production Deployment

For production deployments:

1. Review and update environment variables
2. Configure SSL certificates
3. Set up monitoring and logging
4. Configure backup strategies
5. Implement security hardening

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
