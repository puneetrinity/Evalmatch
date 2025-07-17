"""
Unified AI Platform - Combined ideal-octo-goggles + ubiquitous-octo-invention
Provides a single endpoint for both document search and conversation AI
"""

import asyncio
import os
import sys
import logging
from pathlib import Path
from typing import Dict, Any

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Add project paths
current_dir = Path(__file__).parent
sys.path.insert(0, str(current_dir))
sys.path.insert(0, str(current_dir.parent / "ubiquitous-octo-invention"))

from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

# Global state
unified_state = {
    "search_engine": None,
    "conversation_ready": False,
    "redis_available": False
}

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan"""
    logger.info("🚀 Starting Unified AI Platform...")
    
    try:
        # Initialize search engine from ideal-octo-goggles
        logger.info("📚 Initializing document search engine...")
        from app.search.ultra_fast_engine import UltraFastSearchEngine
        from app.config import settings
        
        search_engine = UltraFastSearchEngine(
            embedding_dim=int(os.getenv('EMBEDDING_DIM', '384')),
            use_gpu=False  # Disable GPU for Fly.io
        )
        unified_state["search_engine"] = search_engine
        logger.info("✅ Document search engine initialized")
        
        # Test Redis connection
        try:
            import redis
            redis_client = redis.Redis.from_url(os.getenv('REDIS_URL', 'redis://localhost:6379'))
            redis_client.ping()
            unified_state["redis_available"] = True
            logger.info("✅ Redis connection established")
        except Exception as e:
            logger.warning(f"⚠️ Redis not available: {e}")
        
        unified_state["conversation_ready"] = True
        logger.info("🎯 Unified AI Platform ready!")
        
    except Exception as e:
        logger.error(f"❌ Failed to initialize platform: {e}")
    
    yield
    
    logger.info("🛑 Shutting down Unified AI Platform...")

# Create unified app
app = FastAPI(
    title="Unified AI Platform",
    description="Combined Document Search + Conversation AI Platform",
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

# Mount static files
try:
    static_path = current_dir / "app" / "static"
    if static_path.exists():
        app.mount("/static", StaticFiles(directory=str(static_path)), name="static")
        logger.info(f"✅ Static files mounted from {static_path}")
except Exception as e:
    logger.warning(f"⚠️ Could not mount static files: {e}")

@app.get("/")
async def root():
    """Serve the unified platform UI"""
    try:
        index_path = current_dir / "app" / "static" / "index.html"
        if index_path.exists():
            return FileResponse(str(index_path))
        else:
            return {
                "platform": "Unified AI Platform",
                "message": "Welcome to the combined Document Search + Conversation AI platform",
                "services": {
                    "document_search": "/api/search",
                    "document_upload": "/api/documents/upload", 
                    "conversation": "/api/chat",
                    "health": "/health"
                }
            }
    except Exception as e:
        return {"error": f"Could not serve UI: {e}"}

@app.get("/health")
async def health():
    """Unified health check"""
    return {
        "status": "healthy",
        "timestamp": asyncio.get_event_loop().time(),
        "services": {
            "document_search": "active" if unified_state["search_engine"] else "initializing",
            "conversation_ai": "active" if unified_state["conversation_ready"] else "initializing",
            "redis": "connected" if unified_state["redis_available"] else "disconnected"
        },
        "platform": "unified_ai",
        "version": "1.0.0"
    }

# Document Search APIs (from ideal-octo-goggles)
@app.get("/api/search")
async def search(q: str, limit: int = 10):
    """Document search endpoint"""
    try:
        if not unified_state["search_engine"]:
            raise HTTPException(status_code=503, detail="Search engine not ready")
        
        # Import and use the search functionality
        from app.main_ml_full import search_get
        return await search_get(q=q, limit=limit)
        
    except Exception as e:
        logger.error(f"Search error: {e}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

@app.post("/api/documents/upload")
async def upload_document(file, title: str = None, description: str = None, tags: str = ""):
    """Document upload endpoint"""
    try:
        # Import and use the upload functionality
        from app.main_ml_full import upload_file
        return await upload_file(file=file, title=title, description=description, tags=tags)
        
    except Exception as e:
        logger.error(f"Upload error: {e}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@app.get("/api/documents")
async def list_documents(limit: int = 50, offset: int = 0):
    """List documents endpoint"""
    try:
        from app.main_ml_full import list_documents as list_docs_func
        return await list_docs_func(limit=limit, offset=offset)
        
    except Exception as e:
        logger.error(f"List documents error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list documents: {str(e)}")

# Conversation AI APIs (placeholder for ubiquitous integration)
@app.post("/api/chat")
async def chat(request: Dict[str, Any]):
    """Conversation endpoint"""
    try:
        # For now, return a placeholder response
        # TODO: Integrate with ubiquitous-octo-invention conversation API
        return {
            "response": "Conversation AI integration in progress. Document search is fully functional.",
            "status": "partial_implementation",
            "available_features": ["document_search", "document_upload"],
            "coming_soon": ["conversation_ai", "langgraph_orchestration"]
        }
        
    except Exception as e:
        logger.error(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")

@app.get("/api/platform/status")
async def platform_status():
    """Comprehensive platform status"""
    return {
        "platform": "Unified AI Platform",
        "version": "1.0.0",
        "deployment": "fly.io",
        "services": {
            "document_search": {
                "status": "active" if unified_state["search_engine"] else "initializing",
                "endpoints": [
                    "/api/search",
                    "/api/documents/upload", 
                    "/api/documents"
                ],
                "description": "Ultra-fast document search with ML capabilities",
                "features": ["pdf_upload", "bulk_upload", "real_time_search"]
            },
            "conversation_ai": {
                "status": "development", 
                "endpoints": ["/api/chat"],
                "description": "LangGraph-based conversation and research AI",
                "features": ["coming_soon"]
            }
        },
        "infrastructure": {
            "redis": unified_state["redis_available"],
            "search_engine": unified_state["search_engine"] is not None,
            "static_files": True
        }
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)