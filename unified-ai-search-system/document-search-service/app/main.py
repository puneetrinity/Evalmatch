
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import sys
from contextlib import asynccontextmanager

# Only import uvloop on non-Windows systems
if sys.platform != "win32":
    import uvloop

from app.api.ultra_fast_search import router as search_router
from app.api import ultra_fast_search as api_module
from app.search.ultra_fast_engine import UltraFastSearchEngine
from app.processing.batch_processor import MathematicalBatchProcessor
from app.logger import get_enhanced_logger
from app.config import settings
from app.monitoring.health import HealthChecker

# RAG imports
from app.rag.integration import initialize_rag_system, shutdown_rag_system, get_rag_health
from app.rag.api import router as rag_router

logger = get_enhanced_logger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up Ultra-Fast Search System with RAG capabilities...")
    
    try:
        # Initialize the search engine and batch processor
        search_engine = UltraFastSearchEngine(
            embedding_dim=settings.embedding_dim, 
            use_gpu=settings.use_gpu
        )
        batch_processor = MathematicalBatchProcessor()
        
        # Initialize health checker
        health_checker_instance = HealthChecker(search_engine)
        
        # Initialize RAG system
        await initialize_rag_system(
            embedding_dim=settings.embedding_dim,
            use_gpu=settings.use_gpu
        )
        
        # Make components available to the API router
        api_module.search_engine = search_engine
        api_module.health_checker = health_checker_instance
        
        # Start incremental indexing background processing
        await search_engine.incremental_manager.start_background_processing()
        
        logger.info("System startup completed successfully", extra_fields={
            'embedding_dim': settings.embedding_dim,
            'use_gpu': settings.use_gpu,
            'rag_enabled': True
        })
        
        yield
        
    except Exception as e:
        logger.error("Failed to start system", extra_fields={'error': str(e)})
        raise
    finally:
        logger.info("Shutting down...")
        
        try:
            # Cleanup incremental manager
            if hasattr(search_engine, 'incremental_manager'):
                await search_engine.incremental_manager.stop_background_processing()
            
            # Cleanup batch processor
            await batch_processor.shutdown()
            
            # Shutdown RAG system
            await shutdown_rag_system()
            
            logger.info("System shutdown completed")
        except Exception as e:
            logger.error("Error during shutdown", extra_fields={'error': str(e)})


app = FastAPI(
    title="Ultra-Fast Data Analysis System with RAG",
    description="A high-performance search system using advanced algorithms with RAG capabilities.",
    version="2.1.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(search_router)
app.include_router(rag_router)

@app.get("/")
async def root():
    from fastapi.responses import FileResponse
    import os
    
    # Try to serve the static HTML file
    static_path = os.path.join(os.path.dirname(__file__), "static", "index.html")
    if os.path.exists(static_path):
        return FileResponse(static_path)
    
    # Fallback to API info if static file doesn't exist
    return {"message": "Welcome to the Ultra-Fast Data Analysis System with RAG"}

@app.get("/health")
async def health_check():
    """Enhanced health check including RAG system"""
    try:
        rag_health = await get_rag_health()
        return {
            "status": "healthy",
            "message": "Ultra-Fast Search System with RAG is running",
            "rag_system": rag_health
        }
    except Exception as e:
        return {
            "status": "partial",
            "message": "Search system running, RAG system may have issues",
            "error": str(e)
        }

# Install uvloop for high-performance (Unix/Linux only)
if sys.platform != "win32":
    uvloop.install()
