# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a production-ready AI Search System built with **LangGraph orchestration**, **local-first processing via Ollama**, and **dual-layer metadata infrastructure**. The core philosophy is "intelligence lives in APIs, not interfaces" - LLMs are workers orchestrated by LangGraph, with 85% local inference for cost efficiency.

## Architecture

The system follows a layered architecture:

1. **Interface Layer** - Web chat, mobile app, Slack bot, API integrations
2. **LangGraph Intelligence APIs** - `/chat/stream`, `/search/analyze`, `/research/deep-dive`
3. **Graph Orchestration Layer** - Chat Graph, Search Graph, Analysis Graph
4. **Model Execution Layer** - Ollama (local) with OpenAI/Claude fallbacks
5. **Dual-Layer Metadata System** - Hot cache (Redis) + Cold storage (ClickHouse)

### Key Components

- **ModelManager** (`app/models/manager.py`) - Singleton managing Ollama models with hot/warm/cold tiers
- **CacheManager** (`app/cache/redis_client.py`) - Redis-based caching with TTL management
- **ChatGraph** (`app/graphs/chat_graph.py`) - LangGraph-based conversation orchestration
- **SearchGraph** (`app/graphs/search_graph.py`) - Multi-provider search orchestration
- **Provider System** (`app/providers/`) - Standardized Brave Search + ScrapingBee integration

## Development Commands

### Core Development
```bash
# Quick start with Makefile
cd deploy && make dev

# OR manual docker-compose
cd deploy && docker-compose up --build

# Access services
# API: http://localhost:8000
# Docs: http://localhost:8000/docs  
# Redis: localhost:6379
# Health: http://localhost:8000/health
```

### Testing
```bash
# Run all tests
pytest

# Run with coverage  
pytest --cov=app tests/

# Run specific test
pytest tests/test_chat_api.py

# Run integration tests
pytest tests/integration/

# Test markers available: integration
```

### Model Management
The system uses **phi3:mini** as the default local model for cost efficiency. Models are organized in tiers:
- **T0**: Always loaded (phi3:mini)
- **T1**: Loaded on first use, kept warm
- **T2**: Load/unload per request

### Environment Configuration
Key environment variables (see `app/core/config.py`):

```bash
# Core
ENVIRONMENT=development  # development/production/testing
DEBUG=true

# Services
REDIS_URL=redis://localhost:6379
OLLAMA_HOST=http://localhost:11434

# API Keys (required for full functionality)
BRAVE_API_KEY=your_brave_search_api_key
SCRAPINGBEE_API_KEY=your_scrapingbee_api_key

# Model defaults
DEFAULT_MODEL=phi3:mini
FALLBACK_MODEL=phi3:mini

# Cost & Performance
DEFAULT_MONTHLY_BUDGET=20.0
RATE_LIMIT_PER_MINUTE=60
TARGET_RESPONSE_TIME=2.5
```

## Code Patterns

### Configuration Access
Always use the settings pattern:
```python
from app.core.config import get_settings
settings = get_settings()  # Returns environment-specific config
```

### Dependency Injection
Components use FastAPI dependency injection:
```python
from app.dependencies import get_model_manager, get_cache_manager

async def endpoint(
    model_manager: ModelManager = Depends(get_model_manager),
    cache_manager: CacheManager = Depends(get_cache_manager)
):
```

### Error Handling
All endpoints use structured error responses:
```python
from app.schemas.responses import create_error_response

error_response = create_error_response(
    message="Operation failed",
    error_code="OPERATION_FAILED", 
    correlation_id=get_correlation_id()
)
```

### LangGraph Integration
Graph execution follows this pattern:
```python
from app.graphs.base import GraphState

state = GraphState(
    original_query=query,
    session_id=session_id,
    user_id=user_id
)
result = await graph.execute(state)
```

## Testing Patterns

### FastAPI Testing
Tests use `pytest-asyncio` and `TestClient`:
```python
@pytest.mark.asyncio
async def test_endpoint(client: TestClient):
    response = client.post("/api/v1/chat/complete", json=payload)
    assert response.status_code == 200
```

### Integration Tests  
Integration tests are marked and can be run separately:
```python
@pytest.mark.integration
async def test_full_search_flow():
    # Test complete search workflow
```

## Performance Considerations

### Cost Optimization
- Local models (phi3:mini) for 85%+ of requests
- API fallbacks only for complex reasoning
- Budget tracking per user/session
- Tiered rate limiting (free/pro/enterprise)

### Caching Strategy
- Routing decisions: 5 minutes TTL
- API responses: 30 minutes TTL  
- Model inference: 1 hour TTL
- Cache keys include model version for invalidation

### Model Management
- Models auto-unload after inactivity
- Memory threshold monitoring (80% max)
- Health checks ensure model availability
- Graceful fallback to API providers

## Common Debugging

### Health Endpoints
- `/health` - Overall system health
- `/health/ready` - Kubernetes readiness
- `/health/live` - Kubernetes liveness  
- `/metrics` - Prometheus metrics
- `/system/status` - Detailed component status

### Debug Endpoints (development only)
- `/debug/state` - Application state inspection
- `/debug/test-chat` - Test chat functionality
- `/debug/test-search` - Test search functionality  
- `/startup-report` - Startup diagnostics

### Logging
Structured logging with correlation IDs:
```python
from app.core.logging import get_logger, get_correlation_id

logger = get_logger("component")
logger.info("Operation completed", 
           correlation_id=get_correlation_id(),
           extra_context="value")
```

## Deployment

### Docker Development
```bash
cd deploy && make dev      # Start all services
cd deploy && make logs     # View application logs
cd deploy && make clean    # Stop and clean services
```

### Production (Gunicorn)
```bash
gunicorn -w 4 -k uvicorn.workers.UvicornWorker app.main:app
```

Required services: Redis, Ollama with phi3:mini model pulled.