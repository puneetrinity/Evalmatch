"""
Reimagined Octo Bassoon - Integration Platform Server
Provides a unified API gateway and integration layer for AI services
"""

import asyncio
import logging
import time
from contextlib import asynccontextmanager
from typing import Dict, Any, List, Optional

import uvicorn
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import aiohttp
import structlog

# Configure structured logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer()
    ],
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()

# Pydantic models for API
class HealthResponse(BaseModel):
    status: str
    services: Dict[str, str]
    timestamp: float
    version: str = "1.0.0"

class SearchRequest(BaseModel):
    query: str = Field(..., description="Search query")
    num_results: int = Field(default=10, ge=1, le=100)
    filters: Optional[Dict[str, Any]] = None
    search_type: str = Field(default="hybrid", pattern="^(semantic|keyword|hybrid)$")

class ChatRequest(BaseModel):
    query: str = Field(..., description="Chat query")
    context: Optional[str] = None
    use_search: bool = False
    search_provider: str = Field(default="brave", pattern="^(brave|serper|duckduckgo)$")

class IntelligentSearchRequest(BaseModel):
    query: str = Field(..., description="Intelligent search query")
    include_documents: bool = True
    include_web: bool = True
    num_results: int = Field(default=10, ge=1, le=50)

# Global state
class AppState:
    conversation_url: str = "http://host.docker.internal:8000"
    document_search_url: str = "http://host.docker.internal:8001" 
    session: Optional[aiohttp.ClientSession] = None
    health_stats: Dict[str, Any] = {}
    startup_time: float = time.time()

app_state = AppState()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    # Startup
    logger.info("Starting Reimagined Octo Bassoon Integration Platform")
    app_state.session = aiohttp.ClientSession()
    app_state.startup_time = time.time()
    
    # Background health monitoring
    async def health_monitor():
        while True:
            try:
                await update_health_stats()
                await asyncio.sleep(30)  # Check every 30 seconds
            except Exception as e:
                logger.error("Health monitor error", error=str(e))
                await asyncio.sleep(60)
    
    # Start background task
    health_task = asyncio.create_task(health_monitor())
    
    yield
    
    # Shutdown
    logger.info("Shutting down Integration Platform")
    health_task.cancel()
    if app_state.session:
        await app_state.session.close()

# Create FastAPI app
app = FastAPI(
    title="Reimagined Octo Bassoon Integration Platform",
    description="Unified AI platform integration adapter",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

async def update_health_stats():
    """Update health statistics for all services"""
    stats = {
        "last_check": time.time(),
        "services": {}
    }
    
    # Check conversation AI
    try:
        async with app_state.session.get(
            f"{app_state.conversation_url}/health",
            timeout=aiohttp.ClientTimeout(total=5)
        ) as response:
            stats["services"]["conversation_ai"] = {
                "status": "healthy" if response.status == 200 else "unhealthy",
                "response_time": response.headers.get("X-Response-Time", "unknown"),
                "last_check": time.time()
            }
    except Exception as e:
        stats["services"]["conversation_ai"] = {
            "status": "error",
            "error": str(e),
            "last_check": time.time()
        }
    
    # Check document search
    try:
        async with app_state.session.get(
            f"{app_state.document_search_url}/api/v2/health",
            timeout=aiohttp.ClientTimeout(total=5)
        ) as response:
            stats["services"]["document_search"] = {
                "status": "healthy" if response.status == 200 else "unhealthy",
                "response_time": response.headers.get("X-Response-Time", "unknown"),
                "last_check": time.time()
            }
    except Exception as e:
        stats["services"]["document_search"] = {
            "status": "error", 
            "error": str(e),
            "last_check": time.time()
        }
    
    app_state.health_stats = stats

@app.get("/", response_class=JSONResponse)
async def root():
    """Root endpoint with platform information"""
    return {
        "name": "Reimagined Octo Bassoon Integration Platform",
        "version": "1.0.0",
        "description": "Unified AI platform integration adapter",
        "status": "operational",
        "uptime": time.time() - app_state.startup_time,
        "endpoints": {
            "health": "/health",
            "search": "/api/v1/search/documents",
            "chat": "/api/v1/chat/complete",
            "intelligent_search": "/api/v1/search/intelligent",
            "docs": "/docs"
        }
    }

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Comprehensive health check endpoint"""
    overall_status = "healthy"
    services = {}
    
    # Get cached health stats
    if app_state.health_stats:
        for service_name, service_info in app_state.health_stats.get("services", {}).items():
            services[service_name] = service_info.get("status", "unknown")
            if service_info.get("status") not in ["healthy"]:
                overall_status = "degraded"
    else:
        overall_status = "initializing"
        services = {
            "conversation_ai": "unknown",
            "document_search": "unknown"
        }
    
    services["integration_platform"] = "healthy"
    
    return HealthResponse(
        status=overall_status,
        services=services,
        timestamp=time.time()
    )

@app.post("/api/v1/search/documents")
async def search_documents(request: SearchRequest):
    """Search documents via the ultra-fast search system"""
    try:
        payload = {
            "query": request.query,
            "num_results": request.num_results,
            "filters": request.filters or {},
            "search_type": request.search_type
        }
        
        async with app_state.session.post(
            f"{app_state.document_search_url}/api/v2/search/ultra-fast",
            json=payload,
            timeout=aiohttp.ClientTimeout(total=30)
        ) as response:
            if response.status == 200:
                data = await response.json()
                return {
                    "success": True,
                    "results": data.get("results", []),
                    "metadata": {
                        "query": request.query,
                        "num_results": len(data.get("results", [])),
                        "search_type": request.search_type,
                        "response_time": data.get("response_time"),
                        "source": "document_search"
                    }
                }
            else:
                error_text = await response.text()
                raise HTTPException(
                    status_code=response.status,
                    detail=f"Document search failed: {error_text}"
                )
    except Exception as e:
        logger.error("Document search error", error=str(e), query=request.query)
        raise HTTPException(status_code=500, detail=f"Search error: {str(e)}")

@app.post("/api/v1/chat/complete")
async def chat_complete(request: ChatRequest):
    """Complete chat conversation via the conversation AI system"""
    try:
        payload = {
            "query": request.query,
            "context": request.context,
            "use_search": request.use_search,
            "search_provider": request.search_provider
        }
        
        async with app_state.session.post(
            f"{app_state.conversation_url}/api/v1/chat/complete",
            json=payload,
            timeout=aiohttp.ClientTimeout(total=60)
        ) as response:
            if response.status == 200:
                data = await response.json()
                return {
                    "success": True,
                    "response": data.get("response", ""),
                    "context": data.get("context"),
                    "sources": data.get("sources", []),
                    "metadata": {
                        "query": request.query,
                        "use_search": request.use_search,
                        "search_provider": request.search_provider,
                        "response_time": data.get("response_time"),
                        "source": "conversation_ai"
                    }
                }
            else:
                error_text = await response.text()
                raise HTTPException(
                    status_code=response.status,
                    detail=f"Chat completion failed: {error_text}"
                )
    except Exception as e:
        logger.error("Chat completion error", error=str(e), query=request.query)
        raise HTTPException(status_code=500, detail=f"Chat error: {str(e)}")

@app.post("/api/v1/search/intelligent")
async def intelligent_search(request: IntelligentSearchRequest):
    """Intelligent search combining document search and web search with AI analysis"""
    try:
        results = {
            "query": request.query,
            "document_results": [],
            "web_results": [],
            "ai_analysis": "",
            "metadata": {
                "timestamp": time.time(),
                "include_documents": request.include_documents,
                "include_web": request.include_web,
                "num_results": request.num_results
            }
        }
        
        # Parallel execution for better performance
        tasks = []
        
        # Document search task
        if request.include_documents:
            async def doc_search():
                try:
                    doc_request = SearchRequest(
                        query=request.query,
                        num_results=request.num_results,
                        search_type="hybrid"
                    )
                    doc_response = await search_documents(doc_request)
                    return doc_response.get("results", [])
                except Exception as e:
                    logger.error("Document search task error", error=str(e))
                    return []
            
            tasks.append(doc_search())
        
        # Web search task via conversation AI
        if request.include_web:
            async def web_search():
                try:
                    chat_request = ChatRequest(
                        query=request.query,
                        use_search=True,
                        search_provider="brave"
                    )
                    chat_response = await chat_complete(chat_request)
                    return {
                        "response": chat_response.get("response", ""),
                        "sources": chat_response.get("sources", [])
                    }
                except Exception as e:
                    logger.error("Web search task error", error=str(e))
                    return {"response": "", "sources": []}
            
            tasks.append(web_search())
        
        # Execute tasks
        task_results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Process results
        if request.include_documents and len(task_results) > 0:
            if not isinstance(task_results[0], Exception):
                results["document_results"] = task_results[0]
        
        if request.include_web:
            web_idx = 1 if request.include_documents else 0
            if len(task_results) > web_idx and not isinstance(task_results[web_idx], Exception):
                web_result = task_results[web_idx]
                results["web_results"] = web_result.get("sources", [])
                results["ai_analysis"] = web_result.get("response", "")
        
        # If we have both document and web results, synthesize
        if (request.include_documents and request.include_web and 
            results["document_results"] and results["web_results"]):
            
            synthesis_query = f"""
            Based on the following information, provide a comprehensive analysis of: {request.query}
            
            Document Results Summary: {len(results['document_results'])} relevant documents found
            Web Search Results: {len(results['web_results'])} web sources found
            
            Please provide a synthesized analysis combining both sources.
            """
            
            try:
                synthesis_request = ChatRequest(
                    query=synthesis_query,
                    use_search=False
                )
                synthesis_response = await chat_complete(synthesis_request)
                results["ai_analysis"] = synthesis_response.get("response", "")
            except Exception as e:
                logger.error("Synthesis error", error=str(e))
                results["ai_analysis"] = f"Synthesis error: {str(e)}"
        
        return {
            "success": True,
            **results
        }
        
    except Exception as e:
        logger.error("Intelligent search error", error=str(e), query=request.query)
        raise HTTPException(status_code=500, detail=f"Intelligent search error: {str(e)}")

@app.get("/api/v1/status")
async def detailed_status():
    """Get detailed status information"""
    return {
        "platform": "Reimagined Octo Bassoon",
        "version": "1.0.0",
        "uptime": time.time() - app_state.startup_time,
        "health_stats": app_state.health_stats,
        "configuration": {
            "conversation_url": app_state.conversation_url,
            "document_search_url": app_state.document_search_url
        },
        "timestamp": time.time()
    }

# Background task for periodic health updates
@app.post("/api/v1/admin/update-health")
async def manual_health_update(background_tasks: BackgroundTasks):
    """Manually trigger health update (admin endpoint)"""
    background_tasks.add_task(update_health_stats)
    return {"message": "Health update triggered"}

if __name__ == "__main__":
    uvicorn.run(
        "integration_server:app",
        host="0.0.0.0",
        port=8888,
        log_level="info",
        access_log=True,
        reload=False
    )