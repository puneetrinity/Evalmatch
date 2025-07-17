from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import sys
import os
import logging
from contextlib import asynccontextmanager

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Log environment variables for debugging
logger.info(f"Environment: {os.getenv('PYTHON_ENV', 'NOT SET')}")
logger.info(f"PORT: {os.getenv('PORT', 'NOT SET')}")
logger.info(f"INDEX_PATH: {os.getenv('INDEX_PATH', 'NOT SET')}")
logger.info(f"UPLOAD_PATH: {os.getenv('UPLOAD_PATH', 'NOT SET')}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up Ultra-Fast Search System (Fly.io Edition)...")
    
    # Create storage directories if they don't exist
    try:
        index_path = os.getenv('INDEX_PATH', '/app/data/indexes')
        data_path = os.getenv('UPLOAD_PATH', '/app/data/uploads')
        
        os.makedirs(index_path, exist_ok=True)
        os.makedirs(data_path, exist_ok=True)
        os.makedirs('/app/data', exist_ok=True)
        
        logger.info(f"Storage directories created: {index_path}, {data_path}")
    except Exception as e:
        logger.error(f"Failed to create directories: {e}")
    
    yield
    
    logger.info("Shutting down Ultra-Fast Search System...")

app = FastAPI(
    title="Ultra-Fast Search System",
    description="High-performance search engine with RAG capabilities - Fly.io Edition",
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

@app.get("/")
async def root():
    return {
        "message": "Ultra-Fast Search System - Fly.io Edition",
        "version": "1.0.0",
        "status": "running",
        "port": os.getenv("PORT", "8000"),
        "environment": os.getenv("PYTHON_ENV", "development"),
        "storage": {
            "index_path": os.getenv('INDEX_PATH', '/app/data/indexes'),
            "data_path": os.getenv('UPLOAD_PATH', '/app/data/uploads')
        }
    }

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": asyncio.get_event_loop().time(),
        "environment": os.getenv("PYTHON_ENV", "development"),
        "storage_ready": True,
        "port": os.getenv("PORT", "8000")
    }

# Basic API endpoints
@app.get("/api/search")
async def search(q: str = "", limit: int = 10):
    """Basic search endpoint"""
    return {
        "query": q,
        "results": [
            {
                "id": f"result_{i}",
                "content": f"Search result {i} for query: {q}",
                "score": 1.0 - (i * 0.1)
            }
            for i in range(min(limit, 5))
        ],
        "total": min(limit, 5),
        "message": "Basic search - full search engine not initialized yet"
    }

@app.get("/api/status")
async def status():
    """System status endpoint"""
    return {
        "system": "operational",
        "search_engine": "basic",
        "storage": {
            "index_path": os.getenv('INDEX_PATH', '/app/data/indexes'),
            "data_path": os.getenv('UPLOAD_PATH', '/app/data/uploads')
        },
        "features": ["basic_search", "health_check", "status"],
        "environment": os.getenv("PYTHON_ENV", "development")
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("app.main_working:app", host="0.0.0.0", port=port, reload=False)