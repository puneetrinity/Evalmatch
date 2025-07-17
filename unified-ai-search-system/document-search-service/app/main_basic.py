from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import os
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Log environment variables for debugging
logger.info(f"PORT environment variable: {os.getenv('PORT', 'NOT SET')}")
logger.info(f"RAILWAY_ENVIRONMENT: {os.getenv('RAILWAY_ENVIRONMENT', 'NOT SET')}")
logger.info(f"All environment variables: {dict(os.environ)}")

app = FastAPI(
    title="Search API - Railway Deployed",
    description="Search API deployed on Railway - incrementally adding features",
    version="1.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mock data for testing
mock_documents = [
    {"id": 1, "title": "Introduction to AI", "content": "Artificial Intelligence basics and fundamentals"},
    {"id": 2, "title": "Machine Learning Guide", "content": "Complete guide to machine learning algorithms"},
    {"id": 3, "title": "Data Science Overview", "content": "Overview of data science methodologies and tools"}
]

class SearchRequest(BaseModel):
    query: str
    limit: Optional[int] = 10

@app.get("/")
async def root():
    return {
        "message": "Search API is running on Railway!",
        "environment": os.getenv("RAILWAY_ENVIRONMENT", "unknown"),
        "port": os.getenv("PORT", "8000")
    }

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "message": "Search API is operational",
        "service": "search-api",
        "documents_count": len(mock_documents),
        "port": os.getenv("PORT", "NOT SET"),
        "railway_env": os.getenv("RAILWAY_ENVIRONMENT", "NOT SET")
    }

@app.post("/search")
async def search(request: SearchRequest):
    """Basic text search in mock documents"""
    results = []
    query_lower = request.query.lower()
    
    for doc in mock_documents:
        if query_lower in doc["title"].lower() or query_lower in doc["content"].lower():
            results.append({
                "id": doc["id"],
                "title": doc["title"],
                "content": doc["content"],
                "score": 0.85  # Mock score
            })
    
    return {
        "query": request.query,
        "results": results[:request.limit],
        "total_found": len(results)
    }

@app.get("/documents")
async def list_documents():
    """List all available documents"""
    return {
        "documents": mock_documents,
        "total": len(mock_documents)
    }