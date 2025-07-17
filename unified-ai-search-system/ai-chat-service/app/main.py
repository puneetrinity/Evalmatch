# app/main.py
"""
Production-ready main application with comprehensive initialization and monitoring.
Integrates all components for the complete AI search system with standardized providers.
"""
import asyncio
import json
import os
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncGenerator, Dict

import uvicorn
from fastapi import FastAPI, Request, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import chat, research, search
from app.api import adaptive_routes as adaptive
from app.api import analytics_routes as analytics
from app.api import evaluation_routes as evaluation
from app.api import models_routes as models
from app.api import monitoring_routes as monitoring
from app.api.security import SecurityMiddleware
from app.cache.redis_client import CacheManager
from app.core.config import get_settings
from app.core.logging import LoggingMiddleware, get_correlation_id, get_logger
from app.core.startup_monitor import StartupMonitor
from app.dependencies import (
    set_initialized_cache_manager,
    set_initialized_model_manager,
)
from app.graphs.chat_graph import ChatGraph
from app.graphs.search_graph import SearchGraph, execute_search
from app.models.manager import ModelManager
from app.models.ollama_client import ModelStatus
from app.performance.optimization import OptimizedSearchSystem
from app.schemas.responses import HealthStatus, create_error_response

# Add project root to Python path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

settings = get_settings()

# Global state for application components
app_state: Dict[str, Any] = {}
logger = get_logger("main")


class SearchSystemWrapper:
    def __init__(self, model_manager, cache_manager):
        self.model_manager = model_manager
        self.cache_manager = cache_manager

    async def search(
        self, query, budget=2.0, quality="balanced", max_results=10, **kwargs
    ):
        return await execute_search(
            query=query,
            model_manager=self.model_manager,
            cache_manager=self.cache_manager,
            budget=budget,
            quality=quality,
            max_results=max_results,
        )


async def shutdown_resources(app_state: dict):
    """Gracefully shut down resources on app shutdown."""
    logger.info("🔄 Starting graceful shutdown of resources...")
    # Shutdown model manager
    model_manager = app_state.get("model_manager")
    if model_manager:
        try:
            if hasattr(model_manager, "shutdown"):
                await model_manager.shutdown()
            elif hasattr(model_manager, "cleanup"):
                await model_manager.cleanup()
            else:
                logger.info("ModelManager has no shutdown/cleanup method")
            logger.info("✅ ModelManager shutdown completed")
        except Exception as e:
            logger.warning(f"⚠️ ModelManager shutdown failed: {e}")
    # Shutdown cache manager
    cache_manager = app_state.get("cache_manager")
    if cache_manager:
        try:
            if hasattr(cache_manager, "shutdown"):
                await cache_manager.shutdown()
            elif hasattr(cache_manager, "close"):
                await cache_manager.close()
            else:
                logger.info("CacheManager has no shutdown/close method")
            logger.info("✅ CacheManager shutdown completed")
        except Exception as e:
            logger.warning(f"⚠️ CacheManager shutdown failed: {e}")
    # Shutdown other components
    for component_name in [
        "search_system",
        "chat_graph",
        "search_graph",
        "adaptive_router",
    ]:
        component = app_state.get(component_name)
        if component and hasattr(component, "shutdown"):
            try:
                await component.shutdown()
                logger.info(f"✅ {component_name} shutdown completed")
            except Exception as e:
                logger.warning(f"⚠️ {component_name} shutdown failed: {e}")
    logger.info("🎯 Resource shutdown completed")


async def wait_for_model_ready(
    model_manager, model_name: str, timeout: float = 120.0, poll_interval: float = 2.0
):
    """Wait until the specified model is READY in Ollama, or timeout."""
    logger = get_logger("main")
    start = time.time()
    while time.time() - start < timeout:
        try:
            # Force refresh model list
            await model_manager._discover_available_models()
            info = model_manager.models.get(model_name)
            if info and getattr(info, "status", None) == ModelStatus.READY:
                logger.info(f"Model '{model_name}' is READY.")
                return True
            logger.info(
                f"Waiting for model '{model_name}' to be READY. Current status: {getattr(info, 'status', None)}"
            )
        except Exception as e:
            logger.warning(f"Error while checking model readiness: {e}")
        await asyncio.sleep(poll_interval)
    logger.error(f"Timeout: Model '{model_name}' not READY after {timeout} seconds.")
    return False


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Enhanced lifespan with startup monitoring."""
    monitor = StartupMonitor()
    app_state = {}
    try:
        logger.info("[LIFESPAN] Starting up with monitoring...")
        # Model Manager (singleton)

        async def init_model_manager():
            # Use standardized Ollama host configuration
            ollama_host = settings.ollama_host
            logger.info(f"🤖 Initializing ModelManager with Ollama: {ollama_host}")
            model_manager = ModelManager(ollama_host=ollama_host)
            await model_manager.initialize()
            # Wait for a model to be ready before continuing
            return model_manager

        model_manager = await monitor.initialize_component(
            "model_manager", init_model_manager
        )
        app_state["model_manager"] = model_manager
        # Set the initialized instance for dependency injection
        set_initialized_model_manager(model_manager)
        # Cache Manager

        async def init_cache_manager():
            cache_manager = CacheManager(
                settings.redis_url, settings.redis_max_connections
            )
            await cache_manager.initialize()
            return cache_manager

        cache_manager = await monitor.initialize_component(
            "cache_manager", init_cache_manager
        )
        app_state["cache_manager"] = cache_manager
        # Set the initialized instance for dependency injection
        set_initialized_cache_manager(cache_manager)
        # Chat Graph (depends on model_manager and cache_manager)

        def init_chat_graph():
            return ChatGraph(app_state["model_manager"], app_state["cache_manager"])

        chat_graph = await monitor.initialize_component("chat_graph", init_chat_graph)
        app_state["chat_graph"] = chat_graph
        # Search Graph (depends on model_manager and cache_manager)

        def init_search_graph():
            return SearchGraph(app_state["model_manager"], app_state["cache_manager"])

        search_graph = await monitor.initialize_component(
            "search_graph", init_search_graph
        )
        app_state["search_graph"] = search_graph
        # Optimization System ((
        #     depends on model_manager,
        #     cache_manager,
        #     search_graph
        # )

        def init_search_system():
            search_router = SearchSystemWrapper(
                app_state["model_manager"], app_state["cache_manager"]
            )
            return OptimizedSearchSystem(
                search_router=search_router, search_graph=app_state["search_graph"]
            )

        search_system = await monitor.initialize_component(
            "search_system", init_search_system
        )
        app_state["search_system"] = search_system

        # Adaptive Router (depends on model_manager and cache_manager)
        async def init_adaptive_router():
            from app.adaptive.adaptive_router import AdaptiveIntelligentRouter

            router = AdaptiveIntelligentRouter(
                model_manager=app_state["model_manager"],
                cache_manager=app_state["cache_manager"],
                enable_adaptive=True,
                shadow_rate=0.3,
            )
            await router.initialize()
            return router

        adaptive_router = await monitor.initialize_component(
            "adaptive_router", init_adaptive_router
        )
        app_state["adaptive_router"] = adaptive_router

        # Initialize API key status for provider health checks
        def init_api_key_status():
            """Check for API keys and set their status in app_state."""
            api_key_status = {}
            
            # Check Brave Search API key
            brave_key = os.getenv("BRAVE_API_KEY")
            if brave_key and brave_key.strip():
                api_key_status["brave_search"] = True
                logger.info("✅ Brave Search API key configured")
            else:
                api_key_status["brave_search"] = False
                logger.info("⚠️ Brave Search API key not configured")
            
            # Check ScrapingBee API key
            scrapingbee_key = os.getenv("SCRAPINGBEE_API_KEY")
            if scrapingbee_key and scrapingbee_key.strip():
                api_key_status["scrapingbee"] = True
                logger.info("✅ ScrapingBee API key configured")
            else:
                api_key_status["scrapingbee"] = False
                logger.info("⚠️ ScrapingBee API key not configured")
            
            return api_key_status

        api_key_status = await monitor.initialize_component(
            "api_key_status", init_api_key_status
        )
        app_state["api_key_status"] = api_key_status

        # Add startup time for uptime calculation
        app_state["startup_time"] = time.time()

        # Add more components as your system grows
        # Generate and store startup report
        startup_report = monitor.get_startup_report()
        app_state["startup_report"] = startup_report
        # Log startup summary
        summary = startup_report["startup_summary"]
        logger.info(
            f"🚀 Startup completed: {summary['successful']}/{summary['total_components']} components in {summary['total_duration']:.2f}s"
        )
        for recommendation in startup_report["recommendations"]:
            logger.info(f"💡 {recommendation}")
        # Log full report at debug level
        logger.debug(f"Full startup report: {startup_report}")
        app.state.app_state = app_state
        yield
    finally:
        logger.info("[LIFESPAN] Shutting down...")
        # Shutdown ModelManager instance
        try:
            if "model_manager" in app_state and app_state["model_manager"]:
                await app_state["model_manager"].shutdown()
        except Exception as e:
            logger.warning(f"ModelManager shutdown failed: {e}")
        await shutdown_resources(app_state)
        logger.info("[LIFESPAN] Shutdown complete.")


# Create FastAPI application
app = FastAPI(
    title="AI Search System",
    description="Intelligent AI-powered search with Brave Search and ScrapingBee integration",
    version="1.0.0",
    docs_url="/docs",  # Always enable docs for development/testing
    redoc_url="/redoc",  # Always enable redoc
    lifespan=lifespan,
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

# Add security middleware (rate limiting disabled for deployment)
app.add_middleware(SecurityMiddleware, enable_rate_limiting=False)

# Add logging middleware
app.add_middleware(LoggingMiddleware)


@app.middleware("http")
async def app_state_middleware(request: Request, call_next):
    """Ensure app.state has access to components."""
    if hasattr(request.app, "state"):
        # Get the app_state that was set during lifespan startup
        app_state = getattr(request.app.state, "app_state", {})
        # These are already accessible via request.app.state.app_state,
        # but we can also set direct references for convenience
        request.app.state.search_system = app_state.get("search_system")
        request.app.state.model_manager = app_state.get("model_manager")
        request.app.state.cache_manager = app_state.get("cache_manager")
        request.app.state.chat_graph = app_state.get("chat_graph")
        request.app.state.search_graph = app_state.get("search_graph")
    response = await call_next(request)
    return response


# Performance monitoring middleware
@app.middleware("http")
async def performance_tracking_middleware(request: Request, call_next):
    """Middleware to track request performance."""
    start_time = time.time()

    try:
        response = await call_next(request)
        response_time = time.time() - start_time

        # Add performance headers
        response.headers["X-Response-Time"] = str(round(response_time * 1000, 2))
        response.headers["X-Request-ID"] = get_correlation_id()

        # Log slow requests
        if response_time > 5.0:  # 5 seconds
            logger.warning(
                "Slow request detected",
                method=request.method,
                url=str(request.url),
                response_time=response_time,
                status_code=response.status_code,
            )

        return response

    except Exception as e:
        response_time = time.time() - start_time
        logger.error(
            "Request failed",
            method=request.method,
            url=str(request.url),
            response_time=response_time,
            error=str(e),
        )
        raise


# Health check endpoints
@app.get("/health", response_model=HealthStatus)
async def health_check():
    """Comprehensive health check endpoint."""
    try:
        components = {}
        overall_healthy = True

        # Get the actual app state where components are stored
        actual_app_state = getattr(app.state, "app_state", {})

        # Check model manager
        if "model_manager" in actual_app_state:
            try:
                model_stats = actual_app_state["model_manager"].get_model_stats()
                components["models"] = "healthy"
                logger.debug(
                    f"Models: {model_stats['total_models']} total, {model_stats['loaded_models']} loaded"
                )
            except Exception as e:
                components["models"] = f"unhealthy: {e}"
                overall_healthy = False
                logger.error(f"Model manager health check failed: {e}")
        else:
            components["models"] = "not_initialized"
            overall_healthy = False

        # Check cache manager
        if "cache_manager" in actual_app_state and actual_app_state["cache_manager"]:
            try:
                test_key = f"health_check_{int(time.time())}"
                await actual_app_state["cache_manager"].set(test_key, "test", ttl=5)
                test_value = await actual_app_state["cache_manager"].get(test_key)
                if test_value == "test":
                    components["cache"] = "healthy"
                else:
                    components["cache"] = "degraded"
                    overall_healthy = False
            except Exception as e:
                components["cache"] = f"unhealthy: {e}"
                overall_healthy = False
                logger.error(f"Cache health check failed: {e}")
        else:
            components["cache"] = "not_available"

        # Check chat graph
        if "chat_graph" in actual_app_state:
            try:
                if actual_app_state["chat_graph"] is not None:
                    components["chat_graph"] = "healthy"
                else:
                    components["chat_graph"] = "unhealthy: not initialized"
                    overall_healthy = False
            except Exception as e:
                components["chat_graph"] = f"unhealthy: {e}"
                overall_healthy = False
        else:
            components["chat_graph"] = "not_initialized"
            overall_healthy = False

        # Check search graph
        if "search_graph" in actual_app_state:
            try:
                if actual_app_state["search_graph"] is not None:
                    components["search_graph"] = "healthy"
                else:
                    components["search_graph"] = "unhealthy: not initialized"
                    overall_healthy = False
            except Exception as e:
                components["search_graph"] = f"unhealthy: {e}"
                overall_healthy = False
        else:
            components["search_graph"] = "not_initialized"
            overall_healthy = False

        # Check optimization system
        if "search_system" in actual_app_state:
            try:
                if actual_app_state["search_system"] is not None:
                    components["optimization_system"] = "healthy"
                else:
                    components["optimization_system"] = "unhealthy: not initialized"
                    overall_healthy = False
            except Exception as e:
                components["optimization_system"] = f"unhealthy: {e}"
                overall_healthy = False
        else:
            components["optimization_system"] = "not_initialized"
            overall_healthy = False

        # Check provider API keys
        api_key_status = actual_app_state.get("api_key_status", {})
        if api_key_status.get("brave_search", False):
            components["brave_search"] = "configured"
        else:
            components["brave_search"] = "not_configured"

        if api_key_status.get("scrapingbee", False):
            components["scrapingbee"] = "configured"
        else:
            components["scrapingbee"] = "not_configured"

        # Calculate uptime
        uptime = None
        if "startup_time" in actual_app_state:
            uptime = time.time() - actual_app_state["startup_time"]

        return HealthStatus(
            status="healthy" if overall_healthy else "degraded",
            components=components,
            version="1.0.0",
            uptime=uptime,
        )

    except Exception as e:
        logger.error(f"Health check failed: {e}", exc_info=True)
        return HealthStatus(
            status="unhealthy", components={"error": str(e)}, version="1.0.0"
        )


@app.get("/health/ready")
async def readiness_check():
    """Kubernetes readiness probe endpoint."""
    required_components = ["model_manager", "chat_graph", "search_graph"]

    # Get actual app state where components are stored
    actual_app_state = getattr(app.state, "app_state", {})

    for component in required_components:
        if component not in actual_app_state:
            raise HTTPException(
                status_code=503, detail=f"Component {component} not ready"
            )

    return {"status": "ready"}


@app.get("/health/live")
async def liveness_check():
    """Kubernetes liveness probe endpoint."""
    return {"status": "alive"}


@app.get("/system/status")
async def system_status():
    """Detailed system status endpoint."""
    try:
        # Component status
        redis_status = "disconnected"
        ollama_status = "disconnected"

        # Get actual app state where components are stored
        actual_app_state = getattr(app.state, "app_state", {})

        if "cache_manager" in actual_app_state and actual_app_state["cache_manager"]:
            redis_status = "connected"

        if "model_manager" in actual_app_state:
            try:
                _stats = actual_app_state["model_manager"].get_model_stats()
                ollama_status = "connected"
            except Exception:
                ollama_status = "error"

        # Provider status
        api_key_status = actual_app_state.get("api_key_status", {})

        # Calculate uptime
        uptime = None
        if "startup_time" in actual_app_state:
            uptime = time.time() - actual_app_state["startup_time"]

        return {
            "status": "operational",
            "components": {
                "redis": redis_status,
                "ollama": ollama_status,
                "api": "healthy",
                "search_graph": (
                    "initialized"
                    if "search_graph" in actual_app_state
                    else "not_initialized"
                ),
                "chat_graph": (
                    "initialized"
                    if "chat_graph" in actual_app_state
                    else "not_initialized"
                ),
            },
            "providers": {
                "brave_search": (
                    "configured"
                    if api_key_status.get("brave_search", False)
                    else "not_configured"
                ),
                "scrapingbee": (
                    "configured"
                    if api_key_status.get("scrapingbee", False)
                    else "not_configured"
                ),
            },
            "version": "1.0.0",
            "uptime": uptime,
            "timestamp": time.time(),
            "architecture": "standardized_providers",
        }
    except Exception as e:
        return {"status": "degraded", "error": str(e), "timestamp": time.time()}


def safe_serialize(obj, max_depth=3, current_depth=0):
    """
    Safely serialize objects to prevent recursion and Mock serialization issues.
    """
    if current_depth > max_depth:
        return "max_depth_reached"
    if obj is None:
        return None
    if isinstance(obj, (str, int, float, bool)):
        return obj
    from unittest.mock import AsyncMock, Mock

    if isinstance(obj, (Mock, AsyncMock)):
        return {"type": "mock_object", "class_name": obj.__class__.__name__}
    if isinstance(obj, list):
        return [safe_serialize(item, max_depth, current_depth + 1) for item in obj[:10]]
    if isinstance(obj, dict):
        result = {}
        for key, value in list(obj.items())[:20]:
            try:
                result[str(key)] = safe_serialize(value, max_depth, current_depth + 1)
            except Exception:
                result[str(key)] = "serialization_error"
        return result
    if hasattr(obj, "get_model_stats"):
        try:
            _stats = obj.get_model_stats()
            return safe_serialize(_stats, max_depth, current_depth + 1)
        except Exception:
            return "get_model_stats_error"
    if hasattr(obj, "get_performance_stats"):
        try:
            _stats = obj.get_performance_stats()
            return safe_serialize(_stats, max_depth, current_depth + 1)
        except Exception:
            return "get_performance_stats_error"
    try:
        return {"type": str(type(obj).__name__), "available": True}
    except Exception:
        return "unknown_object"


@app.get("/metrics")
async def get_metrics():
    """
    COMPLETELY FIXED metrics endpoint with proper serialization and no recursion.
    """

    try:
        correlation_id = get_correlation_id()
        metrics = {
            "status": "operational",
            "timestamp": time.time(),
            "correlation_id": correlation_id,
            "version": "1.0.0",
        }
        # Get actual app state
        actual_app_state = getattr(app.state, "app_state", {})

        startup_time = actual_app_state.get("startup_time")
        if startup_time and isinstance(startup_time, (int, float)):
            metrics["uptime_seconds"] = time.time() - startup_time
        components = {}
        for component_name, component in actual_app_state.items():
            if component_name == "startup_time":
                continue
            try:
                components[component_name] = safe_serialize(component)
            except Exception as e:
                components[component_name] = {
                    "status": "serialization_error",
                    "error": str(e),
                }
        metrics["components"] = components
        api_status = actual_app_state.get("api_key_status", {})
        if isinstance(api_status, dict):
            metrics["api_keys"] = {
                k: v
                for k, v in api_status.items()
                if isinstance(v, (bool, str, int, float, type(None)))
            }
        metrics["system"] = {
            "total_components": len(app_state),
            "environment": settings.environment,
            "python_version": f"{sys.version_info.major}.{sys.version_info.minor}",
        }
        try:
            json.dumps(metrics)
        except TypeError as e:
            logger.error(f"Metrics not JSON serializable: {e}")
            return {
                "status": "error",
                "timestamp": time.time(),
                "error": "Metrics serialization failed",
                "correlation_id": correlation_id,
            }
        logger.debug(
            "Metrics generated successfully",
            component_count=len(components),
            correlation_id=correlation_id,
        )
        return metrics
    except Exception as e:
        logger.error(f"Metrics endpoint error: {e}", exc_info=True)
        return {
            "status": "error",
            "timestamp": time.time(),
            "error": str(e),
            "correlation_id": get_correlation_id(),
        }


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler for unhandled errors."""
    correlation_id = get_correlation_id()

    logger.error(
        "Unhandled exception in request",
        method=request.method,
        url=str(request.url),
        error=str(exc),
        correlation_id=correlation_id,
        exc_info=True,
    )

    # Don't expose internal error details in production
    if settings.environment == "production":
        error_detail = "An internal error occurred"
    else:
        error_detail = str(exc)

    error_response = create_error_response(
        message="Internal server error",
        error_code="INTERNAL_SERVER_ERROR",
        correlation_id=correlation_id,
        technical_details=(
            error_detail if settings.environment != "production" else None
        ),
    )

    return JSONResponse(status_code=500, content=error_response.model_dump())


# Rate limit exceeded handler
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Handle HTTP exceptions with proper logging."""
    correlation_id = get_correlation_id()

    if exc.status_code == 429:  # Rate limit exceeded
        logger.warning(
            "Rate limit exceeded",
            method=request.method,
            url=str(request.url),
            client_ip=request.client.host if request.client else "unknown",
            correlation_id=correlation_id,
        )
    elif exc.status_code >= 500:
        logger.error(
            "Server error in request",
            method=request.method,
            url=str(request.url),
            status_code=exc.status_code,
            error=exc.detail,
            correlation_id=correlation_id,
        )
    else:
        logger.info(
            "Client error in request",
            method=request.method,
            url=str(request.url),
            status_code=exc.status_code,
            error=exc.detail,
            correlation_id=correlation_id,
        )

    # Return structured error response
    if isinstance(exc.detail, dict):
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    else:
        error_response = create_error_response(
            message=exc.detail,
            error_code=f"HTTP_{exc.status_code}",
            correlation_id=correlation_id,
        )

        return JSONResponse(
            status_code=exc.status_code, content=error_response.model_dump()
        )


# Include API routers
app.include_router(
    search.router, prefix="/api/v1/search", tags=["Search"], dependencies=[]
)

app.include_router(chat.router, prefix="/api/v1/chat", tags=["Chat"], dependencies=[])

app.include_router(research.router, prefix="/api/v1/research", tags=["research"])

# Production API routers
app.include_router(
    adaptive.router, prefix="/api/v1/adaptive", tags=["Adaptive Routing"]
)

app.include_router(monitoring.router, prefix="/api/v1/monitoring", tags=["Monitoring"])

app.include_router(analytics.router, prefix="/api/v1/analytics", tags=["Analytics"])

app.include_router(evaluation.router, prefix="/api/v1/evaluation", tags=["Evaluation"])

app.include_router(models.router, prefix="/api/v1/models", tags=["Models"])


# Root endpoint
@app.get("/")
async def root():
    """Root endpoint with system information."""
    actual_app_state = getattr(app.state, "app_state", {})
    api_key_status = actual_app_state.get("api_key_status", {})

    return {
        "name": "AI Search System",
        "version": "1.0.0",
        "status": "operational",
        "environment": settings.environment,
        "architecture": "standardized_providers",
        "docs_url": "/docs" if settings.environment != "production" else None,
        "health_url": "/health",
        "api_endpoints": {
            "search_basic": "/api/v1/search/basic",
            "search_advanced": "/api/v1/search/advanced",
            "model_download": "/api/v1/models/download",
            "model_list": "/api/v1/models/list",
            "health": "/health",
            "metrics": "/metrics",
            "system_status": "/system/status",
        },
        "features": [
            "Intelligent conversation management",
            "Multi-model AI orchestration",
            "Real-time streaming responses",
            "Brave Search integration",
            "ScrapingBee content enhancement",
            "Smart cost optimization",
            "Context-aware processing",
            "Performance monitoring",
        ],
        "providers": {
            "brave_search": (
                "configured"
                if api_key_status.get("brave_search", False)
                else "not_configured"
            ),
            "scrapingbee": (
                "configured"
                if api_key_status.get("scrapingbee", False)
                else "not_configured"
            ),
            "local_models": "ollama",
        },
    }


# Development endpoints (only in non-production)
if settings.environment != "production":

    @app.get("/debug/state")
    async def debug_application_state():
        """Debug endpoint to inspect application state."""
        debug_state = {}

        for key, value in app_state.items():
            if key == "model_manager":
                debug_state[key] = {
                    "type": "ModelManager",
                    "stats": (
                        value.get_model_stats()
                        if hasattr(value, "get_model_stats")
                        else None
                    ),
                }
            elif key == "cache_manager":
                debug_state[key] = {
                    "type": "CacheManager",
                    "available": value is not None,
                    "connected": value is not None,
                }
            elif key == "chat_graph":
                debug_state[key] = {"type": "ChatGraph", "initialized": True}
            elif key == "search_graph":
                debug_state[key] = {
                    "type": "SearchGraph",
                    "initialized": True,
                    "providers": "brave_search + scrapingbee",
                }
            elif key == "api_key_status":
                debug_state[key] = value
            else:
                debug_state[key] = str(type(value))

        return {
            "application_state": debug_state,
            "settings": {
                "environment": settings.environment,
                "debug": settings.debug,
                "ollama_host": settings.ollama_host,
                # Hide credentials
                "redis_url": (
                    settings.redis_url.split("@")[-1]
                    if "@" in settings.redis_url
                    else settings.redis_url
                ),
                "log_level": settings.log_level,
            },
        }

    @app.post("/debug/test-chat")
    async def debug_test_chat(message: str = "Hello, this is a test"):
        """Debug endpoint to test chat functionality."""
        try:
            actual_app_state = getattr(app.state, "app_state", {})
            if "chat_graph" not in actual_app_state:
                return {"error": "Chat graph not initialized"}

            from app.graphs.base import GraphState

            test_state = GraphState(
                original_query=message, session_id="debug_test", user_id="debug_user"
            )

            result = await actual_app_state["chat_graph"].execute(test_state)

            return {
                "success": True,
                "response": getattr(result, "final_response", "No response generated"),
                "execution_time": getattr(result, "execution_time", 0),
                "cost": (
                    result.calculate_total_cost()
                    if hasattr(result, "calculate_total_cost")
                    else 0
                ),
                "execution_path": getattr(result, "execution_path", []),
            }

        except Exception as e:
            return {"success": False, "error": str(e)}

    @app.post("/debug/test-search")
    async def debug_test_search(query: str = "latest AI developments"):
        """Debug endpoint to test search functionality."""
        try:
            actual_app_state = getattr(app.state, "app_state", {})
            if "search_graph" not in actual_app_state:
                return {"error": "Search graph not initialized"}

            from app.graphs.search_graph import execute_search

            result = await execute_search(
                query=query,
                model_manager=actual_app_state["model_manager"],
                cache_manager=actual_app_state["cache_manager"],
                budget=2.0,
                quality="balanced",
                max_results=5,
            )

            return {
                "success": result.get("success", False),
                "query": query,
                "response": result.get("response", "No response"),
                "metadata": result.get("metadata", {}),
                "providers_used": result.get(
                    ("metadata", {}).get("providers_used", [])
                ),
            }

        except Exception as e:
            return {"success": False, "error": str(e)}

    # Add startup report endpoint, only in non-production
    from fastapi import status

    @app.get("/startup-report", status_code=status.HTTP_200_OK)
    async def get_startup_report(request: Request):
        """Get detailed startup diagnostics (non-production only)."""
        if getattr(settings, "environment", "production") == "production":
            return JSONResponse(
                status_code=404, content={"error": "Not available in production"}
            )
        app_state = getattr(request.app.state, "app_state", {})
        startup_report = app_state.get(
            "startup_report", {"error": "No startup report available"}
        )
        return startup_report


# Static files (if needed)
# app.mount("/static", StaticFiles(directory="static"), name="static")


def create_app() -> FastAPI:
    """Factory function to create the FastAPI application."""
    return app


# Development server
if __name__ == "__main__":
    # Development server configuration
    dev_config = {
        "host": settings.api_host,
        "port": settings.api_port,
        "reload": settings.debug,
        "log_level": "info" if not settings.debug else "debug",
        "access_log": True,
        "reload_dirs": ["app"] if settings.debug else None,
    }

    print(f"🚀 Starting AI Search System in {settings.environment} mode")
    print("🏗️  Architecture: Standardized Providers (Brave + ScrapingBee)")
    print(
        f"📍 Server will be available at http://{settings.api_host}:{settings.api_port}"
    )
    print(f"📚 API documentation at http://{settings.api_host}:{settings.api_port}/docs")
    print(f"🏥 Health check at http://{settings.api_host}:{settings.api_port}/health")
    print(
        f"📊 System status at http://{settings.api_host}:{settings.api_port}/system/status"
    )

    # API key status
    brave_key = (
        getattr(settings, "brave_search_api_key", None)
        or getattr(settings, "BRAVE_API_KEY", None)
        or os.getenv("BRAVE_API_KEY")
    )
    scrapingbee_key = (
        getattr(settings, "scrapingbee_api_key", None)
        or getattr(settings, "SCRAPINGBEE_API_KEY", None)
        or os.getenv("SCRAPINGBEE_API_KEY")
    )

    print(f"🔑 Brave Search: {'✅ Configured' if brave_key else '❌ Not configured'}")
    print(f"🔑 ScrapingBee: {'✅ Configured' if scrapingbee_key else '❌ Not configured'}")

    if not brave_key:
        print(
            "⚠️  Warning: No Brave Search API key found. Set BRAVE_API_KEY environment variable."
        )
    if not scrapingbee_key:
        print(
            "⚠️  Warning: No ScrapingBee API key found. Set SCRAPINGBEE_API_KEY environment variable."
        )

    # Run the server
    uvicorn.run("app.main:app", **dev_config)


# Production ASGI application
def get_asgi_application():
    """Get ASGI application for production deployment."""
    return app


# Export for testing
__all__ = ["app", "create_app", "get_asgi_application", "app_state"]


# Docker health check
def docker_health_check():
    """Health check function for Docker containers."""

    import requests

    try:
        response = requests.get("http://localhost:8000/health/live", timeout=5)
        if response.status_code == 200:
            sys.exit(0)
        else:
            sys.exit(1)
    except Exception:
        sys.exit(1)


# Kubernetes deployment configuration
def get_health_check_config():
    """Get health check configuration for Kubernetes."""
    return {
        "readiness_probe": {
            "http_get": {"path": "/health/ready", "port": 8000},
            "initial_delay_seconds": 30,
            "period_seconds": 10,
            "timeout_seconds": 5,
            "failure_threshold": 3,
        },
        "liveness_probe": {
            "http_get": {"path": "/health/live", "port": 8000},
            "initial_delay_seconds": 60,
            "period_seconds": 30,
            "timeout_seconds": 10,
            "failure_threshold": 3,
        },
        "startup_probe": {
            "http_get": {"path": "/health/ready", "port": 8000},
            "initial_delay_seconds": 10,
            "period_seconds": 10,
            "timeout_seconds": 5,
            "failure_threshold": 10,
        },
    }


"""
Production deployment configuration:

For Gunicorn (gunicorn.conf.py):
```python
bind = "0.0.0.0:8000"
workers = 4
worker_class = "uvicorn.workers.UvicornWorker"
worker_connections = 1000
max_requests = 1000
max_requests_jitter = 100
timeout = 60
keepalive = 2
preload_app = True

# Logging
accesslog = "-"
errorlog = "-"
loglevel = "info"

# Process naming
proc_name = "ai-search-system"

# Worker tuning
worker_tmp_dir = "/dev/shm"
```

Run with: gunicorn -c gunicorn.conf.py app.main:app

Environment Variables Required:
- BRAVE_API_KEY=your_brave_search_api_key
- SCRAPINGBEE_API_KEY=your_scrapingbee_api_key
- REDIS_URL=redis://localhost:6379
- OLLAMA_HOST=http://localhost:11434
"""

# Adaptive Performance Monitoring Middleware
@app.middleware("http")
async def adaptive_performance_middleware(request: Request, call_next):
    """Enhanced monitoring specifically for adaptive routing performance"""
    start_time = time.time()
    
    # Track if this is an adaptive routing request
    is_adaptive_request = request.url.path.startswith("/api/chat")
    
    response = await call_next(request)
    process_time = time.time() - start_time
    
    # Track adaptive system specific metrics
    if is_adaptive_request:
        await track_adaptive_routing_performance(
            endpoint=request.url.path,
            method=request.method,
            response_time=process_time,
            status_code=response.status_code,
            user_agent=request.headers.get("user-agent", "unknown")
        )
        
        # Log slow adaptive requests specifically
        if process_time > 5.0:  # Slower than target
            logger.warning(
                "slow_adaptive_request",
                endpoint=request.url.path,
                response_time=process_time,
                target_time=5.0
            )
    
    response.headers["X-Process-Time"] = str(process_time)
    response.headers["X-Adaptive-Route"] = "true" if is_adaptive_request else "false"
    return response

async def track_adaptive_routing_performance(
    endpoint: str,
    method: str, 
    response_time: float,
    status_code: int,
    user_agent: str
):
    """Track adaptive routing specific performance metrics"""
    try:
        # Performance data structure
        performance_data = {
            "timestamp": time.time(),
            "endpoint": endpoint,
            "method": method,
            "response_time": response_time,
            "status_code": status_code,
            "success": 200 <= status_code < 400,
            "user_agent": user_agent
        }
        
        # Log performance metrics
        logger.info("adaptive_performance", **performance_data)
        
        # Store in cache for analysis (if cache is available)
        try:
            from app.api.dependencies import get_cache_manager
            cache_manager = get_cache_manager()
            if cache_manager:
                cache_key = f"adaptive_perf:{int(time.time())}"
                await cache_manager.set(
                    cache_key, 
                    performance_data, 
                    ttl=3600  # 1 hour retention
                )
        except Exception:
            pass  # Cache unavailable, continue without it
            
    except Exception as e:
        logger.error("adaptive_performance_tracking_failed", error=str(e))
