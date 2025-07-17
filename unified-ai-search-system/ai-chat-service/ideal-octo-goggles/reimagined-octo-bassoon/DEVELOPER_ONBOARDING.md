# AI Search System - Developer Onboarding Guide

## 🚀 Welcome to the AI Search System

**Core Philosophy**: Intelligence lives in APIs, not interfaces. This system treats LLMs as interchangeable graph nodes within LangGraph orchestration, prioritizing 85% local inference for cost efficiency.

## 📋 Quick Start Checklist

- [ ] **Prerequisites**: Python 3.11+, Docker, Git
- [ ] **Clone Repository**: `git clone <repo-url> && cd advancellmsearch`
- [ ] **Environment Setup**: Copy `.env.example` to `.env` and configure
- [ ] **Start Services**: `docker-compose up --build`
- [ ] **Verify Health**: `curl http://localhost:8000/health`
- [ ] **Run Tests**: `pytest tests/integration/`
- [ ] **Access Docs**: Visit `http://localhost:8000/docs`

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Interface Layer                          │
│  Web Chat │ Mobile App │ Slack Bot │ API Integrations      │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                  LangGraph Intelligence APIs                │
│  /chat/stream │ /search/analyze │ /research/deep-dive      │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│               Graph Orchestration Layer                     │
│  Chat Graph │ Search Graph │ Analysis Graph │ Synthesis    │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                Model Execution Layer                        │
│  Ollama (Local) │ OpenAI/Claude (Fallback) │ Specialized   │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│              Dual-Layer Metadata System                     │
│  Hot Cache (Redis) │ Cold Storage (ClickHouse)             │
└─────────────────────────────────────────────────────────────┘
```

### Technology Stack
```yaml
Backend: FastAPI + Python 3.11+
Orchestration: LangGraph
Local LLMs: Ollama (phi3:mini default)
Hot Cache: Redis
API LLMs: OpenAI, Anthropic (fallback)
Containerization: Docker + Compose
Testing: pytest + httpx
Monitoring: Prometheus + structured logging
```

---

## ⚡ Development Environment Setup

### 1. Prerequisites

```bash
# Required
python >= 3.11
docker >= 20.10
docker-compose >= 2.0
git >= 2.30

# Recommended
curl, jq (for API testing)
Redis CLI (for cache debugging)
```

### 2. Initial Setup

```bash
# Clone and enter project
git clone <repository-url>
cd advancellmsearch

# Create and configure environment
cp .env.example .env
# Edit .env with your preferred settings

# Start all services
docker-compose up --build

# In another terminal, verify services
curl http://localhost:8000/health
curl http://localhost:6379  # Redis
curl http://localhost:11434  # Ollama
```

### 3. Environment Variables

Key variables to configure in `.env`:

```bash
# Core Configuration
ENVIRONMENT=development
DEBUG=true
LOG_LEVEL=DEBUG

# Service URLs
REDIS_URL=redis://localhost:6379
OLLAMA_HOST=http://localhost:11434

# Model Configuration
DEFAULT_MODEL=phi3:mini
FALLBACK_MODEL=phi3:mini

# Performance Targets
TARGET_RESPONSE_TIME=2.5
TARGET_LOCAL_PROCESSING=0.85

# Optional API Keys (for enhanced features)
BRAVE_API_KEY=your_brave_search_api_key
SCRAPINGBEE_API_KEY=your_scrapingbee_api_key
OPENAI_API_KEY=your_openai_key  # Fallback only
```

### 4. Local Development Setup

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
pip install -r requirements-dev.txt  # Development tools

# Run locally (without Docker)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

---

## 🧪 Testing & Development Workflow

### Running Tests

```bash
# All tests
pytest

# With coverage
pytest --cov=app tests/

# Integration tests only
pytest tests/integration/ -m integration

# Specific test
pytest tests/test_chat_api.py::test_chat_complete_basic

# Verbose with logs
pytest -v -s
```

### Test Categories

- **Unit Tests** (`tests/unit/`): Individual components
- **Integration Tests** (`tests/integration/`): Full API workflows
- **System Tests** (`scripts/test_*.py`): End-to-end scenarios

### Code Quality

```bash
# Format code
black app/ tests/
isort app/ tests/

# Type checking
mypy app/

# Linting
flake8 app/ tests/

# Run all quality checks
pytest && black --check app/ && mypy app/
```

---

## 📁 Project Structure Deep Dive

```
advancellmsearch/
├── app/                          # Main application
│   ├── main.py                  # FastAPI entry point
│   ├── dependencies.py         # Dependency injection
│   │
│   ├── api/                     # API layer
│   │   ├── chat.py             # Chat endpoints
│   │   ├── search.py           # Search endpoints  
│   │   ├── research.py         # Research endpoints
│   │   └── security.py         # Auth middleware
│   │
│   ├── core/                    # Core infrastructure
│   │   ├── config.py           # Settings management
│   │   ├── logging.py          # Structured logging
│   │   └── startup_monitor.py  # Boot diagnostics
│   │
│   ├── graphs/                  # LangGraph orchestration
│   │   ├── base.py             # Base classes
│   │   ├── chat_graph.py       # Conversation flow
│   │   └── search_graph.py     # Search workflows
│   │
│   ├── models/                  # LLM management
│   │   ├── manager.py          # Model lifecycle
│   │   └── ollama_client.py    # Ollama integration
│   │
│   ├── providers/               # External APIs
│   │   ├── brave_search_provider.py
│   │   └── scrapingbee_provider.py
│   │
│   └── schemas/                 # API contracts
│       ├── requests.py         # Input validation
│       └── responses.py        # Output formatting
│
├── tests/                       # Test suite
├── docker/                      # Container configs
├── scripts/                     # Development tools
└── docs/                        # Documentation
```

---

## 🔧 Core Development Patterns

### 1. Configuration Pattern

Always use the centralized settings:

```python
from app.core.config import get_settings
settings = get_settings()  # Environment-specific config
```

### 2. Dependency Injection Pattern

Use FastAPI's dependency system:

```python
from app.dependencies import get_model_manager, get_cache_manager

async def my_endpoint(
    model_manager: ModelManager = Depends(get_model_manager),
    cache_manager: CacheManager = Depends(get_cache_manager)
):
    # Your endpoint logic
    pass
```

### 3. Graph Node Pattern

Create new processing nodes:

```python
from app.graphs.base import BaseGraphNode, GraphState, NodeResult

class MyProcessingNode(BaseGraphNode):
    def __init__(self, service_dependency):
        super().__init__("my_processor", "processing")
        self.service = service_dependency
    
    async def execute(self, state: GraphState, **kwargs) -> NodeResult:
        try:
            # Your processing logic
            result = await self.service.process(state.original_query)
            
            return NodeResult(
                success=True,
                confidence=0.8,
                data={"processed": result},
                cost=0.001,
                execution_time=0.5
            )
        except Exception as e:
            return NodeResult(
                success=False,
                error=f"Processing failed: {str(e)}"
            )
```

### 4. Error Handling Pattern

Structured error responses:

```python
from app.schemas.responses import create_error_response

error_response = create_error_response(
    message="Operation failed",
    error_code="OPERATION_FAILED",
    correlation_id=get_correlation_id()
)
```

### 5. Caching Pattern

Consistent cache usage:

```python
async def expensive_operation(key: str, cache_manager: CacheManager):
    # Check cache first
    cached = await cache_manager.get(f"operation:{key}")
    if cached:
        return cached
    
    # Compute and cache
    result = await compute_expensive_result(key)
    await cache_manager.set(f"operation:{key}", result, ttl=3600)
    return result
```

---

## 🐛 Common Issues & Solutions

### Issue: Ollama Connection Failed

**Symptoms**: `ConnectionError: Cannot connect to Ollama`

**Solutions**:
```bash
# Check Ollama status
curl http://localhost:11434/api/tags

# Restart Ollama service
docker-compose restart ollama

# Pull required models
docker-compose exec ollama ollama pull phi3:mini

# Check logs
docker-compose logs ollama
```

### Issue: Redis Connection Failed

**Symptoms**: `ConnectionError: Cannot connect to Redis`

**Solutions**:
```bash
# Check Redis status
docker-compose ps redis

# Restart Redis
docker-compose restart redis

# Test connection
redis-cli ping

# Clear cache if needed
redis-cli FLUSHALL
```

### Issue: Model Not Found

**Symptoms**: `Model 'phi3:mini' not found`

**Solutions**:
```bash
# List available models
docker-compose exec ollama ollama list

# Pull missing model
docker-compose exec ollama ollama pull phi3:mini

# Check model status in API
curl http://localhost:8000/debug/state
```

### Issue: Graph Execution Timeout

**Symptoms**: Requests hang or timeout

**Solutions**:
1. Check LangGraph configuration in `app/graphs/base.py:264-316`
2. Verify all graph paths lead to END node
3. Enable debug logging: `LOG_LEVEL=DEBUG`
4. Check for infinite loops in conditional routing

### Issue: Tests Failing

**Common fixes**:
```bash
# Clear test cache
pytest --cache-clear

# Run single failing test
pytest tests/test_chat_api.py::test_chat_complete -v -s

# Check test environment
docker-compose exec app python -c "from app.core.config import get_settings; print(get_settings().environment)"

# Reset test database
docker-compose restart redis
```

---

## 🔍 Debugging Tools

### Health Endpoints

```bash
# Overall system health
curl http://localhost:8000/health

# Detailed metrics
curl http://localhost:8000/metrics

# System status
curl http://localhost:8000/system/status

# Debug state (development only)
curl http://localhost:8000/debug/state
```

### Logging

Enable debug logging for troubleshooting:

```bash
# In .env
LOG_LEVEL=DEBUG

# Watch logs in real-time
docker-compose logs -f app

# Structured log analysis
docker-compose logs app | jq '.'
```

### Development URLs

```
API Documentation: http://localhost:8000/docs
Health Check:      http://localhost:8000/health
Redis Commander:   http://localhost:8081
Metrics:          http://localhost:8000/metrics
```

---

## 🚀 Adding New Features

### 1. Adding a New API Endpoint

```python
# app/api/my_feature.py
from fastapi import APIRouter, Depends
from app.schemas.requests import MyFeatureRequest
from app.schemas.responses import MyFeatureResponse

router = APIRouter()

@router.post("/my-feature", response_model=MyFeatureResponse)
async def my_feature_endpoint(
    request: MyFeatureRequest,
    # Add dependencies as needed
):
    # Implementation
    return MyFeatureResponse(status="success", data=result)

# Register in app/main.py
app.include_router(
    my_feature.router, 
    prefix="/api/v1/my-feature", 
    tags=["my-feature"]
)
```

### 2. Adding Request/Response Schemas

```python
# app/schemas/requests.py
class MyFeatureRequest(BaseModel):
    input_data: str = Field(..., min_length=1, max_length=1000)
    options: Optional[Dict[str, Any]] = None

# app/schemas/responses.py  
class MyFeatureResponse(BaseResponse):
    data: Dict[str, Any] = Field(..., description="Feature response data")
```

### 3. Adding a New Graph

```python
# app/graphs/my_graph.py
from app.graphs.base import BaseGraph, GraphType

class MyGraph(BaseGraph):
    def __init__(self, dependencies):
        super().__init__(GraphType.ANALYSIS, "my_graph")
        self.dependencies = dependencies
        
    def define_nodes(self):
        return {
            "start": StartNode(),
            "processor": MyProcessorNode(self.dependencies),
            "end": EndNode(),
        }
        
    def define_edges(self):
        return [
            ("start", "processor"),
            ("processor", "end"),
        ]
```

### 4. Adding Tests

```python
# tests/test_my_feature.py
import pytest
from fastapi.testclient import TestClient

@pytest.mark.asyncio
async def test_my_feature():
    """Test my new feature"""
    # Arrange
    payload = {"input_data": "test"}
    
    # Act
    response = client.post("/api/v1/my-feature/endpoint", json=payload)
    
    # Assert
    assert response.status_code == 200
    assert response.json()["status"] == "success"
```

---

## 📋 Development Checklist

### Before Committing

- [ ] **Code Quality**: Run `black`, `isort`, `mypy`, `flake8`
- [ ] **Tests Pass**: `pytest` with no failures
- [ ] **Type Hints**: All new functions have proper type annotations
- [ ] **Documentation**: Update docstrings and comments
- [ ] **Error Handling**: Proper exception handling with structured errors
- [ ] **Logging**: Appropriate log levels and structured logging
- [ ] **Performance**: Consider caching and async patterns

### Before Pull Request

- [ ] **Integration Tests**: All integration tests pass
- [ ] **Manual Testing**: Test API endpoints manually
- [ ] **Environment Variables**: Document any new environment variables
- [ ] **Migration Notes**: Document any breaking changes
- [ ] **Performance Impact**: Consider impact on response times
- [ ] **Security Review**: Check for security implications

---

## 📖 Key Resources

### Essential Files to Understand

1. **`CLAUDE.md`** - Claude Code assistant guide
2. **`app/core/config.py`** - Configuration system
3. **`app/graphs/base.py`** - Graph foundation
4. **`app/main.py`** - Application setup
5. **`tests/conftest.py`** - Test configuration

### Development Commands

```bash
# Start development
docker-compose up --build

# Run tests  
pytest

# Code quality
black app/ tests/ && isort app/ tests/ && mypy app/

# Check health
curl http://localhost:8000/health

# View logs
docker-compose logs -f app
```

### Useful Environment Variables

```bash
# Quick development setup
DEBUG=true
LOG_LEVEL=DEBUG
ENVIRONMENT=development

# Skip external APIs for local testing
FORCE_LOCAL_ONLY=true
```

---

## 🤝 Getting Help

### Internal Resources

1. **Architecture Guide**: See existing `Developer Onboarding Guide.md`
2. **API Documentation**: `http://localhost:8000/docs`
3. **Configuration Guide**: `CONFIGURATION.md`
4. **Project Status**: `PROJECT_STATUS.md`

### Debugging Steps

1. **Check Services**: `docker-compose ps`
2. **View Logs**: `docker-compose logs <service>`
3. **Test Health**: `curl http://localhost:8000/health`
4. **Check Models**: `curl http://localhost:8000/debug/state`
5. **Test Basic API**: `curl -X POST http://localhost:8000/api/v1/chat/complete -H "Content-Type: application/json" -d '{"message":"hello"}'`

### Common Commands

```bash
# Full system restart
docker-compose down && docker-compose up --build

# Reset cache
docker-compose exec redis redis-cli FLUSHALL

# Pull new models
docker-compose exec ollama ollama pull llama2:7b

# Run specific test
pytest tests/test_chat_api.py -v -s
```

---

**Welcome to the team! 🚀**

This system's modular architecture and LangGraph orchestration make it easy to extend while maintaining the core philosophy of intelligent APIs. Start with the Quick Start checklist and dive into the code - the abstractions are designed to be developer-friendly.

For additional questions, check the existing documentation files or create an issue in the repository.