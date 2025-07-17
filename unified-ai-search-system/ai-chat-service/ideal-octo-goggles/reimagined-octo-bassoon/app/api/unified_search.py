"""
Unified Search API
Provides endpoints for integrated document and web search
"""

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request, Body, File, UploadFile, Form
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional, Union
import asyncio
import time

from app.api.security import get_current_user
from app.core.logging import get_logger, get_correlation_id, set_correlation_id
from app.core.timeout_utils import timeout_manager
from app.graphs.unified_search_graph import UnifiedSearchGraph
from app.graphs.base import GraphState
from app.schemas.responses import create_error_response
from app.dependencies import get_model_manager, get_cache_manager

logger = get_logger("api.unified_search")
router = APIRouter()

# Global instances (initialized in main.py)
unified_search_graph: Optional[UnifiedSearchGraph] = None


class UnifiedSearchRequest(BaseModel):
    """Request for unified search (documents + web)"""
    query: str = Field(..., description="Search query", min_length=1, max_length=1000)
    search_type: Optional[str] = Field("auto", description="Search type: auto, document, web, hybrid")
    max_results: Optional[int] = Field(10, description="Maximum results to return", ge=1, le=50)
    filters: Optional[Dict[str, Any]] = Field(None, description="Search filters")
    include_content: Optional[bool] = Field(True, description="Include full content in results")


class DocumentUploadRequest(BaseModel):
    """Request for document upload"""
    content: str = Field(..., description="Document content", min_length=1)
    title: str = Field(..., description="Document title", min_length=1, max_length=200)
    metadata: Optional[Dict[str, Any]] = Field(None, description="Document metadata")


class SearchResult(BaseModel):
    """Individual search result"""
    title: str
    content: str
    score: float
    source: str
    source_type: str  # 'document', 'web', 'hybrid'
    metadata: Dict[str, Any]


class UnifiedSearchResponse(BaseModel):
    """Response from unified search"""
    success: bool
    results: List[SearchResult]
    total_found: int
    search_type: str
    query_analysis: Dict[str, Any]
    performance: Dict[str, Any]
    cost: float


class DocumentUploadResponse(BaseModel):
    """Response from document upload"""
    success: bool
    message: str
    document_id: Optional[str] = None
    chunks_created: Optional[int] = None


@router.post("/search/unified", response_model=UnifiedSearchResponse)
@timeout_manager.with_operation_timeout("unified_search")
async def unified_search(
    search_request: UnifiedSearchRequest = Body(...),
    current_user: dict = Depends(get_current_user),
    request: Request = None,
):
    """
    Unified search endpoint that intelligently routes between document and web search
    """
    correlation_id = get_correlation_id()
    start_time = time.time()
    
    try:
        # Initialize graph if needed
        global unified_search_graph
        if unified_search_graph is None:
            model_manager = get_model_manager()
            cache_manager = get_cache_manager()
            unified_search_graph = UnifiedSearchGraph(model_manager, cache_manager)
            unified_search_graph.build_graph()
        
        # Create graph state
        state = GraphState(
            query_id=f"search_{int(time.time())}",
            correlation_id=correlation_id,
            user_id=current_user.get("user_id", "anonymous"),
            original_query=search_request.query,
            max_results=search_request.max_results
        )
        
        # Add custom fields to state
        state.search_type = search_request.search_type
        state.filters = search_request.filters or {}
        
        # Execute the search
        result = await unified_search_graph.execute(state)
        
        if not result.success:
            raise HTTPException(
                status_code=500,
                detail=f"Search failed: {result.data.get('error', 'Unknown error')}"
            )
        
        # Extract results
        result_data = result.data
        search_results = result_data.get("search_results", [])
        
        # Format response
        formatted_results = []
        for item in search_results:
            formatted_results.append(SearchResult(
                title=item.get("title", ""),
                content=item.get("content", "") if search_request.include_content else "",
                score=item.get("score", 0.0),
                source=item.get("source", ""),
                source_type=item.get("source_type", "unknown"),
                metadata=item.get("metadata", {})
            ))
        
        response_time = time.time() - start_time
        
        return UnifiedSearchResponse(
            success=True,
            results=formatted_results,
            total_found=result_data.get("total_found", len(formatted_results)),
            search_type=result_data.get("search_type", "unknown"),
            query_analysis=result_data.get("analysis", {}),
            performance={
                "response_time": response_time,
                "provider_time": result_data.get("performance", {}).get("response_time", 0)
            },
            cost=result.cost
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"Unified search error: {str(e)}",
            extra_fields={
                "query": search_request.query[:100],
                "user_id": current_user.get("user_id"),
                "correlation_id": correlation_id
            },
            exc_info=True
        )
        raise HTTPException(
            status_code=500,
            detail=f"Search failed: {str(e)}"
        )


@router.post("/documents/upload", response_model=DocumentUploadResponse)
@timeout_manager.with_operation_timeout("document_upload")
async def upload_document(
    upload_request: DocumentUploadRequest = Body(...),
    current_user: dict = Depends(get_current_user),
    background_tasks: BackgroundTasks = None,
):
    """
    Upload a document to the search index
    """
    correlation_id = get_correlation_id()
    
    try:
        # Initialize graph if needed
        global unified_search_graph
        if unified_search_graph is None:
            model_manager = get_model_manager()
            cache_manager = get_cache_manager()
            unified_search_graph = UnifiedSearchGraph(model_manager, cache_manager)
            unified_search_graph.build_graph()
        
        # Create graph state for upload
        state = GraphState(
            query_id=f"upload_{int(time.time())}",
            correlation_id=correlation_id,
            user_id=current_user.get("user_id", "anonymous")
        )
        
        # Add custom fields to state
        state.operation = "upload"
        state.document_content = upload_request.content
        state.document_title = upload_request.title
        state.document_metadata = upload_request.metadata or {}
        
        # Execute the upload
        result = await unified_search_graph.upload_node.execute(state)
        
        if not result.success:
            raise HTTPException(
                status_code=500,
                detail=f"Upload failed: {result.data.get('error', 'Unknown error')}"
            )
        
        # Format response
        result_data = result.data
        
        return DocumentUploadResponse(
            success=True,
            message=result_data.get("message", "Document uploaded successfully"),
            document_id=result_data.get("document_id"),
            chunks_created=result_data.get("chunks_created")
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"Document upload error: {str(e)}",
            extra_fields={
                "title": upload_request.title,
                "user_id": current_user.get("user_id"),
                "correlation_id": correlation_id
            },
            exc_info=True
        )
        raise HTTPException(
            status_code=500,
            detail=f"Upload failed: {str(e)}"
        )


@router.get("/search/health")
async def search_health():
    """
    Health check for unified search system
    """
    try:
        global unified_search_graph
        
        health_status = {
            "unified_search": "healthy",
            "document_search": "unknown",
            "web_search": "healthy"
        }
        
        # Check document search if available
        if unified_search_graph and unified_search_graph.document_node:
            doc_healthy = await unified_search_graph.document_node.health_check()
            health_status["document_search"] = "healthy" if doc_healthy else "unhealthy"
        
        overall_healthy = all(
            status in ["healthy", "unknown"] 
            for status in health_status.values()
        )
        
        return {
            "status": "healthy" if overall_healthy else "degraded",
            "components": health_status,
            "timestamp": time.time()
        }
        
    except Exception as e:
        logger.error(f"Health check error: {str(e)}", exc_info=True)
        return {
            "status": "unhealthy",
            "error": str(e),
            "timestamp": time.time()
        }


@router.get("/search/stats")
async def search_stats(current_user: dict = Depends(get_current_user)):
    """
    Get search system statistics
    """
    try:
        # Basic stats for now
        # In a full implementation, you'd collect real metrics
        
        return {
            "total_searches": 0,  # TODO: Implement metrics collection
            "document_searches": 0,
            "web_searches": 0,
            "hybrid_searches": 0,
            "average_response_time": 0.0,
            "cache_hit_rate": 0.0,
            "user_id": current_user.get("user_id")
        }
        
    except Exception as e:
        logger.error(f"Stats error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# Simple proxy endpoint for web UI document upload
@router.post("/documents", response_model=Dict[str, Any])
async def upload_document_form(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user),
):
    """
    Simple document upload endpoint for web UI compatibility
    Accepts form data and converts to JSON for the main upload endpoint
    """
    try:
        # Read file content
        content = await file.read()
        file_content = content.decode('utf-8', errors='ignore')
        
        # Create document upload request
        doc_request = DocumentUploadRequest(
            content=file_content,
            title=title or file.filename or "Untitled",
            metadata={
                "filename": file.filename,
                "content_type": file.content_type,
                "size": len(content)
            }
        )
        
        # Call the main upload endpoint
        response = await upload_document(
            upload_request=doc_request,
            current_user=current_user,
            background_tasks=None
        )
        
        # Convert response to format expected by UI
        return {
            "success": response.success,
            "id": response.document_id,
            "message": response.message,
            "chunks_created": response.chunks_created
        }
        
    except Exception as e:
        logger.error(f"Form upload error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
