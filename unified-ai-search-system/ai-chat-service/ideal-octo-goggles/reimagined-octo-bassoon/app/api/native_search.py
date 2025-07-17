"""
Native ultra-fast search API - fully integrated search engine
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import time
import tempfile
import os
from datetime import datetime, timezone
import asyncio

from app.search.ultra_fast_engine import UltraFastSearchEngine, SearchResult
from app.document_processing.processor import DocumentProcessor, ProcessedDocument
from app.core.logging import get_logger
from app.core.config import get_settings

logger = get_logger(__name__)
settings = get_settings()

router = APIRouter(prefix="/api/v1/native-search", tags=["native-search"])

# Global search engine instance
search_engine: Optional[UltraFastSearchEngine] = None
document_processor: Optional[DocumentProcessor] = None

class SearchRequest(BaseModel):
    query: str
    num_results: int = 10
    filters: Optional[Dict] = None
    search_type: str = "hybrid"

class SearchResponse(BaseModel):
    success: bool
    results: List[Dict]
    total_found: int
    response_time_ms: float
    search_type: str
    metadata: Optional[Dict] = None

class DocumentUploadResponse(BaseModel):
    success: bool
    document_id: str
    message: str
    chunks_created: int
    processing_time_ms: float

class DocumentInfo(BaseModel):
    document_id: str
    title: str
    content_preview: str
    upload_time: str
    file_size: int
    chunks_count: int
    metadata: Dict

@router.post("/search", response_model=SearchResponse)
async def native_search(request: SearchRequest):
    """Native ultra-fast search with integrated FAISS/HNSW/LSH"""
    if search_engine is None:
        raise HTTPException(status_code=503, detail="Search engine not initialized")
    
    start_time = time.time()
    
    try:
        logger.info(f"Native search request: {request.query[:100]}")
        
        # Perform search using native engine
        results = await search_engine.search(
            query=request.query,
            num_results=request.num_results,
            filters=request.filters
        )
        
        response_time = (time.time() - start_time) * 1000
        
        # Format results
        formatted_results = []
        for result in results:
            formatted_result = {
                "id": result.doc_id,
                "title": result.metadata.get('title', result.metadata.get('name', 'Untitled')),
                "content": result.metadata.get('content', '')[:500] + "..." if len(result.metadata.get('content', '')) > 500 else result.metadata.get('content', ''),
                "score": result.combined_score,
                "similarity_score": result.similarity_score,
                "bm25_score": result.bm25_score,
                "metadata": result.metadata,
                "source": "native_search"
            }
            formatted_results.append(formatted_result)
        
        logger.info(f"Native search completed in {response_time:.2f}ms with {len(results)} results")
        
        return SearchResponse(
            success=True,
            results=formatted_results,
            total_found=len(results),
            response_time_ms=response_time,
            search_type=request.search_type,
            metadata={
                "engine": "native_ultra_fast",
                "algorithm": "FAISS+HNSW+LSH+BM25",
                "embedding_model": settings.EMBEDDING_MODEL_NAME or "all-MiniLM-L6-v2"
            }
        )
        
    except Exception as e:
        logger.error(f"Native search failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

@router.post("/documents/upload", response_model=DocumentUploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None)
):
    """Upload and index a document using native search engine"""
    if search_engine is None or document_processor is None:
        raise HTTPException(status_code=503, detail="Search engine not initialized")
    
    start_time = time.time()
    
    try:
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix=f"_{file.filename}") as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file_path = tmp_file.name
        
        try:
            # Process document
            doc_title = title or file.filename or "Untitled Document"
            processed_doc = await document_processor.process_file(
                tmp_file_path, 
                title=doc_title,
                content_type=file.content_type
            )
            
            # Create document for search engine
            search_doc = {
                'id': processed_doc.id,
                'title': processed_doc.title,
                'name': processed_doc.title,
                'content': processed_doc.content,
                'description': processed_doc.content[:200] + "..." if len(processed_doc.content) > 200 else processed_doc.content,
                'skills': [],
                'technologies': [],
                'experience_years': 0,
                'seniority_level': 'unknown',
                'metadata': {
                    **processed_doc.metadata,
                    'upload_time': datetime.now(timezone.utc).isoformat(),
                    'file_size': len(content),
                    'original_filename': file.filename,
                    'chunks_count': len(processed_doc.chunks)
                }
            }
            
            # Add to search engine
            await search_engine.add_document(processed_doc.id, search_doc)
            
            processing_time = (time.time() - start_time) * 1000
            
            logger.info(f"Document uploaded and indexed: {processed_doc.id}")
            
            return DocumentUploadResponse(
                success=True,
                document_id=processed_doc.id,
                message=f"Document '{doc_title}' uploaded and indexed successfully",
                chunks_created=len(processed_doc.chunks),
                processing_time_ms=processing_time
            )
            
        finally:
            # Clean up temporary file
            os.unlink(tmp_file_path)
            
    except Exception as e:
        logger.error(f"Document upload failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@router.post("/documents/upload-text", response_model=DocumentUploadResponse)
async def upload_text_document(
    title: str = Form(...),
    content: str = Form(...),
    content_type: str = Form("text/plain")
):
    """Upload text content directly"""
    if search_engine is None or document_processor is None:
        raise HTTPException(status_code=503, detail="Search engine not initialized")
    
    start_time = time.time()
    
    try:
        # Process content
        processed_doc = await document_processor.process_content(
            content=content,
            title=title,
            content_type=content_type
        )
        
        # Create document for search engine
        search_doc = {
            'id': processed_doc.id,
            'title': processed_doc.title,
            'name': processed_doc.title,
            'content': processed_doc.content,
            'description': processed_doc.content[:200] + "..." if len(processed_doc.content) > 200 else processed_doc.content,
            'skills': [],
            'technologies': [],
            'experience_years': 0,
            'seniority_level': 'unknown',
            'metadata': {
                **processed_doc.metadata,
                'upload_time': datetime.now(timezone.utc).isoformat(),
                'content_length': len(content),
                'chunks_count': len(processed_doc.chunks)
            }
        }
        
        # Add to search engine
        await search_engine.add_document(processed_doc.id, search_doc)
        
        processing_time = (time.time() - start_time) * 1000
        
        logger.info(f"Text document uploaded and indexed: {processed_doc.id}")
        
        return DocumentUploadResponse(
            success=True,
            document_id=processed_doc.id,
            message=f"Document '{title}' uploaded and indexed successfully",
            chunks_created=len(processed_doc.chunks),
            processing_time_ms=processing_time
        )
        
    except Exception as e:
        logger.error(f"Text document upload failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@router.get("/documents/list", response_model=List[DocumentInfo])
async def list_documents():
    """List all indexed documents"""
    if search_engine is None:
        raise HTTPException(status_code=503, detail="Search engine not initialized")
    
    try:
        documents = []
        
        for doc_id, metadata in search_engine.document_metadata.items():
            doc_info = DocumentInfo(
                document_id=doc_id,
                title=metadata.get('title', metadata.get('name', 'Untitled')),
                content_preview=metadata.get('content', '')[:200] + "..." if len(metadata.get('content', '')) > 200 else metadata.get('content', ''),
                upload_time=metadata.get('metadata', {}).get('upload_time', datetime.now(timezone.utc).isoformat()),
                file_size=metadata.get('metadata', {}).get('file_size', 0),
                chunks_count=metadata.get('metadata', {}).get('chunks_count', 1),
                metadata=metadata
            )
            documents.append(doc_info)
        
        return documents
        
    except Exception as e:
        logger.error(f"Failed to list documents: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to list documents: {str(e)}")

@router.delete("/documents/{document_id}")
async def delete_document(document_id: str):
    """Delete a document from the index"""
    if search_engine is None:
        raise HTTPException(status_code=503, detail="Search engine not initialized")
    
    try:
        await search_engine.remove_document(document_id)
        logger.info(f"Document deleted: {document_id}")
        return {"message": f"Document {document_id} deleted successfully"}
        
    except Exception as e:
        logger.error(f"Failed to delete document {document_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete document: {str(e)}")

@router.get("/documents/{document_id}")
async def get_document(document_id: str):
    """Get details of a specific document"""
    if search_engine is None:
        raise HTTPException(status_code=503, detail="Search engine not initialized")
    
    try:
        if document_id not in search_engine.document_metadata:
            raise HTTPException(status_code=404, detail="Document not found")
        
        metadata = search_engine.document_metadata[document_id]
        
        return {
            "document_id": document_id,
            "title": metadata.get('title', metadata.get('name', 'Untitled')),
            "content": metadata.get('content', ''),
            "metadata": metadata,
            "indexed": True,
            "vector_dimension": search_engine.embedding_dim
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get document {document_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get document: {str(e)}")

@router.get("/stats")
async def get_search_stats():
    """Get search engine statistics"""
    if search_engine is None:
        raise HTTPException(status_code=503, detail="Search engine not initialized")
    
    try:
        stats = search_engine.get_performance_stats()
        return {
            "engine_type": "native_ultra_fast",
            "algorithms": ["FAISS", "HNSW", "LSH", "BM25"],
            "embedding_model": settings.EMBEDDING_MODEL_NAME or "all-MiniLM-L6-v2",
            "embedding_dimension": search_engine.embedding_dim,
            **stats
        }
        
    except Exception as e:
        logger.error(f"Failed to get stats: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get stats: {str(e)}")

@router.post("/rebuild-index")
async def rebuild_index(background_tasks: BackgroundTasks):
    """Rebuild the search index with all documents"""
    if search_engine is None:
        raise HTTPException(status_code=503, detail="Search engine not initialized")
    
    try:
        async def rebuild_task():
            documents = []
            for doc_id, metadata in search_engine.document_metadata.items():
                documents.append({
                    'id': doc_id,
                    **metadata
                })
            
            if documents:
                await search_engine.build_indexes(documents)
                logger.info(f"Index rebuilt with {len(documents)} documents")
        
        background_tasks.add_task(rebuild_task)
        return {"message": "Index rebuild started in background"}
        
    except Exception as e:
        logger.error(f"Failed to rebuild index: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to rebuild index: {str(e)}")

@router.get("/health")
async def health_check():
    """Health check for native search engine"""
    if search_engine is None:
        return {"status": "unhealthy", "message": "Search engine not initialized"}
    
    try:
        stats = search_engine.get_performance_stats()
        return {
            "status": "healthy",
            "message": "Native search engine is running",
            "total_documents": stats.get('total_documents', 0),
            "total_searches": stats.get('total_searches', 0),
            "avg_response_time_ms": stats.get('avg_response_time_ms', 0),
            "cache_hit_rate": stats.get('cache_hit_rate', 0)
        }
        
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return {"status": "unhealthy", "message": f"Health check failed: {str(e)}"}

# Initialize search engine and document processor
def initialize_native_search(embedding_dim: int = 384, use_gpu: bool = False):
    """Initialize the native search engine"""
    global search_engine, document_processor
    
    try:
        search_engine = UltraFastSearchEngine(embedding_dim=embedding_dim, use_gpu=use_gpu)
        document_processor = DocumentProcessor()
        logger.info("Native search engine initialized successfully")
        return search_engine, document_processor
        
    except Exception as e:
        logger.error(f"Failed to initialize native search engine: {str(e)}")
        raise

# Get search engine instance
def get_search_engine() -> UltraFastSearchEngine:
    """Get the global search engine instance"""
    if search_engine is None:
        raise HTTPException(status_code=503, detail="Search engine not initialized")
    return search_engine