"""
RAG API Endpoints for Document Processing and Retrieval
"""

from fastapi import APIRouter, HTTPException, UploadFile, File, BackgroundTasks, Depends
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import time
import asyncio
import json
from pathlib import Path
import tempfile
import os

from app.rag.models import DocumentProcessor, DocumentChunker, DocumentStore, Document, DocumentChunk
from app.rag.enhanced_engine import RAGUltraFastEngine, RAGSearchResult
from app.logger import get_enhanced_logger
from app.validation.validators import ErrorResponse
from app.error_handling.exceptions import SearchSystemException, handle_and_log_error

router = APIRouter(prefix="/api/v2/rag", tags=["rag"])
logger = get_enhanced_logger(__name__)

# Global instances (will be set during app startup)
rag_engine: Optional[RAGUltraFastEngine] = None
document_processor: Optional[DocumentProcessor] = None
document_chunker: Optional[DocumentChunker] = None
document_store: Optional[DocumentStore] = None


class RAGQueryRequest(BaseModel):
    """Request model for RAG queries"""
    query: str = Field(..., description="Query for RAG system")
    max_chunks: int = Field(5, ge=1, le=20, description="Maximum chunks to retrieve")
    document_filter: Optional[List[str]] = Field(None, description="Filter by document IDs")
    include_citations: bool = Field(True, description="Include citations in response")
    confidence_threshold: float = Field(0.3, ge=0.0, le=1.0, description="Minimum confidence for chunks")
    search_type: str = Field("hybrid", description="Search type: hybrid, semantic, or keyword")


class RAGQueryResponse(BaseModel):
    """Response model for RAG queries"""
    query_id: str
    query: str
    chunks: List[Dict[str, Any]]
    total_chunks_found: int
    confidence_score: float
    processing_time: float
    search_type: str
    metadata: Dict[str, Any]


class DocumentUploadRequest(BaseModel):
    """Request model for document uploads"""
    title: Optional[str] = None
    description: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    chunking_strategy: str = Field("semantic", description="Chunking strategy: semantic, fixed, or paragraph")
    chunk_size: int = Field(512, ge=100, le=2000, description="Size of each chunk")
    chunk_overlap: int = Field(50, ge=0, le=500, description="Overlap between chunks")


class DocumentUploadResponse(BaseModel):
    """Response model for document uploads"""
    document_id: str
    filename: str
    status: str
    processing_started: bool
    estimated_processing_time: float


class DocumentListResponse(BaseModel):
    """Response model for document listing"""
    documents: List[Dict[str, Any]]
    total: int
    page: int
    page_size: int


class DocumentDetailResponse(BaseModel):
    """Response model for document details"""
    document: Dict[str, Any]
    chunks: List[Dict[str, Any]]
    stats: Dict[str, Any]


@router.post("/query", response_model=RAGQueryResponse)
async def rag_query(request: RAGQueryRequest) -> RAGQueryResponse:
    """
    Execute RAG query with document retrieval
    
    Args:
        request: RAG query request
        
    Returns:
        RAG query response with retrieved chunks
    """
    if not rag_engine:
        raise HTTPException(status_code=503, detail="RAG engine not initialized")
    
    start_time = time.time()
    query_id = f"rag_{int(time.time() * 1000)}"
    
    try:
        logger.info(f"Processing RAG query: {request.query[:100]}...")
        
        # Retrieve relevant chunks based on search type
        if request.search_type == "semantic":
            results = await rag_engine.similarity_search(
                query=request.query,
                top_k=request.max_chunks,
                similarity_threshold=request.confidence_threshold
            )
        elif request.search_type == "keyword":
            # Use parent class search with keyword focus
            search_results = await rag_engine.search(
                query=request.query,
                num_results=request.max_chunks
            )
            results = _convert_search_results_to_rag(search_results)
        else:  # hybrid (default)
            results = await rag_engine.retrieve_for_rag(
                query=request.query,
                top_k=request.max_chunks,
                document_filter=request.document_filter,
                confidence_threshold=request.confidence_threshold
            )
        
        # Convert results to response format
        chunk_dicts = []
        for result in results:
            chunk_dict = {
                'chunk_id': result.chunk_id,
                'content': result.content,
                'relevance_score': result.relevance_score,
                'source_document_id': result.source_document_id,
                'chunk_index': result.chunk_index,
                'metadata': result.metadata,
                'embedding_score': result.embedding_score,
                'keyword_score': result.keyword_score,
                'combined_score': result.combined_score
            }
            
            # Add citation if requested
            if request.include_citations:
                chunk_dict['citation'] = _generate_citation(result)
            
            chunk_dicts.append(chunk_dict)
        
        # Calculate overall confidence
        confidence_score = sum(r.combined_score for r in results) / len(results) if results else 0.0
        
        processing_time = (time.time() - start_time) * 1000
        
        # Prepare metadata
        metadata = {
            'search_type': request.search_type,
            'filters_applied': request.document_filter is not None,
            'confidence_threshold': request.confidence_threshold,
            'processing_time_ms': processing_time
        }
        
        response = RAGQueryResponse(
            query_id=query_id,
            query=request.query,
            chunks=chunk_dicts,
            total_chunks_found=len(results),
            confidence_score=confidence_score,
            processing_time=processing_time,
            search_type=request.search_type,
            metadata=metadata
        )
        
        logger.info(f"RAG query completed in {processing_time:.2f}ms, found {len(results)} chunks")
        return response
        
    except Exception as e:
        logger.error(f"Error in RAG query: {e}")
        raise HTTPException(status_code=500, detail=f"RAG query failed: {str(e)}")


@router.post("/documents", response_model=DocumentUploadResponse)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: Optional[str] = None,
    description: Optional[str] = None,
    tags: str = "",  # Comma-separated tags
    chunking_strategy: str = "semantic",
    chunk_size: int = 512,
    chunk_overlap: int = 50
) -> DocumentUploadResponse:
    """
    Upload and process document for RAG system
    
    Args:
        file: Uploaded file
        title: Optional document title
        description: Optional document description
        tags: Comma-separated tags
        chunking_strategy: Strategy for chunking document
        chunk_size: Size of each chunk
        chunk_overlap: Overlap between chunks
        
    Returns:
        Document upload response
    """
    if not all([document_processor, document_chunker, document_store, rag_engine]):
        raise HTTPException(status_code=503, detail="RAG system not fully initialized")
    
    try:
        # Validate file
        if not file.filename:
            raise HTTPException(status_code=400, detail="No filename provided")
        
        # Check file size (10MB limit)
        file_content = await file.read()
        if len(file_content) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File too large (max 10MB)")
        
        # Reset file pointer
        await file.seek(0)
        
        # Generate document ID
        import uuid
        document_id = str(uuid.uuid4())
        
        # Parse tags
        tag_list = [tag.strip() for tag in tags.split(",") if tag.strip()] if tags else []
        
        # Estimate processing time
        estimated_time = max(5.0, len(file_content) / 50000)  # Rough estimate
        
        # Start background processing
        background_tasks.add_task(
            _process_document_background,
            file_content,
            document_id,
            file.filename,
            title or file.filename,
            description or "",
            tag_list,
            chunking_strategy,
            chunk_size,
            chunk_overlap
        )
        
        response = DocumentUploadResponse(
            document_id=document_id,
            filename=file.filename,
            status="processing",
            processing_started=True,
            estimated_processing_time=estimated_time
        )
        
        logger.info(f"Document upload initiated: {file.filename} -> {document_id}")
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Document upload failed: {e}")
        raise HTTPException(status_code=500, detail=f"Document upload failed: {str(e)}")


@router.get("/documents", response_model=DocumentListResponse)
async def list_documents(
    page: int = 1,
    page_size: int = 20,
    search: Optional[str] = None
) -> DocumentListResponse:
    """
    List documents with optional search
    
    Args:
        page: Page number (1-based)
        page_size: Number of documents per page
        search: Optional search query
        
    Returns:
        List of documents
    """
    if not document_store:
        raise HTTPException(status_code=503, detail="Document store not initialized")
    
    try:
        offset = (page - 1) * page_size
        
        if search:
            documents = document_store.search_documents(search, limit=page_size)
        else:
            documents = document_store.list_documents(limit=page_size, offset=offset)
        
        response = DocumentListResponse(
            documents=documents,
            total=len(documents),
            page=page,
            page_size=page_size
        )
        
        return response
        
    except Exception as e:
        logger.error(f"Error listing documents: {e}")
        raise HTTPException(status_code=500, detail="Failed to list documents")


@router.get("/documents/{document_id}", response_model=DocumentDetailResponse)
async def get_document(document_id: str) -> DocumentDetailResponse:
    """
    Get document details and chunks
    
    Args:
        document_id: Document ID
        
    Returns:
        Document details with chunks
    """
    if not all([document_store, rag_engine]):
        raise HTTPException(status_code=503, detail="RAG system not fully initialized")
    
    try:
        # Get document from store
        document = document_store.retrieve_document(document_id)
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")
        
        # Get chunks from RAG engine
        rag_chunks = await rag_engine.get_document_chunks(document_id)
        
        # Convert chunks to dict format
        chunk_dicts = []
        for chunk in rag_chunks:
            chunk_dict = {
                'chunk_id': chunk.chunk_id,
                'content': chunk.content,
                'chunk_index': chunk.chunk_index,
                'metadata': chunk.metadata,
                'relevance_score': chunk.relevance_score
            }
            chunk_dicts.append(chunk_dict)
        
        # Calculate stats
        stats = {
            'total_chunks': len(chunk_dicts),
            'total_characters': sum(len(c['content']) for c in chunk_dicts),
            'avg_chunk_size': sum(len(c['content']) for c in chunk_dicts) / len(chunk_dicts) if chunk_dicts else 0,
            'document_status': document.status
        }
        
        response = DocumentDetailResponse(
            document=document.to_dict(),
            chunks=chunk_dicts,
            stats=stats
        )
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting document {document_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve document")


@router.delete("/documents/{document_id}")
async def delete_document(document_id: str) -> Dict[str, str]:
    """
    Delete a document and its chunks
    
    Args:
        document_id: Document ID
        
    Returns:
        Deletion status
    """
    if not all([document_store, rag_engine]):
        raise HTTPException(status_code=503, detail="RAG system not fully initialized")
    
    try:
        # Delete from document store
        store_success = document_store.delete_document(document_id)
        
        # Delete from RAG engine
        engine_success = await rag_engine.delete_document_chunks(document_id)
        
        if store_success and engine_success:
            return {"status": "deleted", "document_id": document_id}
        else:
            raise HTTPException(status_code=500, detail="Partial deletion occurred")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting document {document_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete document")


@router.get("/stats")
async def get_rag_stats() -> Dict[str, Any]:
    """
    Get RAG system statistics
    
    Returns:
        System statistics
    """
    if not rag_engine:
        raise HTTPException(status_code=503, detail="RAG engine not initialized")
    
    try:
        stats = await rag_engine.get_stats()
        return stats
        
    except Exception as e:
        logger.error(f"Error getting RAG stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve statistics")


# Helper functions

def _convert_search_results_to_rag(search_results: List[Any]) -> List[RAGSearchResult]:
    """Convert regular search results to RAG format"""
    rag_results = []
    for result in search_results:
        if hasattr(result, 'doc_id') and result.doc_id in rag_engine.chunk_metadata:
            chunk_meta = rag_engine.chunk_metadata[result.doc_id]
            rag_result = RAGSearchResult(
                chunk_id=result.doc_id,
                content=chunk_meta['content'],
                relevance_score=getattr(result, 'combined_score', 0.0),
                source_document_id=chunk_meta['source_document_id'],
                chunk_index=chunk_meta['chunk_index'],
                metadata=chunk_meta['metadata'],
                embedding_score=getattr(result, 'vector_score', 0.0),
                keyword_score=getattr(result, 'keyword_score', 0.0),
                combined_score=getattr(result, 'combined_score', 0.0)
            )
            rag_results.append(rag_result)
    return rag_results


def _generate_citation(result: RAGSearchResult) -> Dict[str, Any]:
    """Generate citation information for a chunk"""
    return {
        'source_document_id': result.source_document_id,
        'chunk_index': result.chunk_index,
        'relevance_score': result.relevance_score,
        'snippet': result.content[:200] + "..." if len(result.content) > 200 else result.content,
        'metadata': result.metadata
    }


async def _process_document_background(
    file_content: bytes,
    document_id: str,
    filename: str,
    title: str,
    description: str,
    tags: List[str],
    chunking_strategy: str,
    chunk_size: int,
    chunk_overlap: int
):
    """
    Background task for document processing
    
    Args:
        file_content: Document content as bytes
        document_id: Document ID
        filename: Original filename
        title: Document title
        description: Document description
        tags: Document tags
        chunking_strategy: Chunking strategy to use
        chunk_size: Size of each chunk
        chunk_overlap: Overlap between chunks
    """
    try:
        logger.info(f"Starting background processing for document {document_id}")
        
        # Determine content type
        content_type = Path(filename).suffix.lower()
        
        # Process document
        document = document_processor.process_document(
            content=file_content,
            filename=filename,
            content_type=content_type
        )
        
        # Set additional metadata
        document.id = document_id
        document.metadata.update({
            'title': title,
            'description': description,
            'tags': tags,
            'chunking_strategy': chunking_strategy,
            'chunk_size': chunk_size,
            'chunk_overlap': chunk_overlap
        })
        
        # Configure chunker
        document_chunker.chunk_size = chunk_size
        document_chunker.overlap = chunk_overlap
        
        # Create chunks
        chunks = document_chunker.chunk_document(document, strategy=chunking_strategy)
        
        # Store document and chunks
        document.status = "indexing"
        store_success = document_store.store_document(document, chunks)
        
        if store_success:
            # Index chunks in RAG engine
            index_success = await rag_engine.index_document_chunks(chunks)
            
            if index_success:
                document.status = "completed"
                logger.info(f"Document {document_id} processed successfully with {len(chunks)} chunks")
            else:
                document.status = "error"
                logger.error(f"Failed to index chunks for document {document_id}")
        else:
            document.status = "error"
            logger.error(f"Failed to store document {document_id}")
        
        # Update status in store
        document_store.store_document(document, chunks)
        
    except Exception as e:
        logger.error(f"Background document processing failed for {document_id}: {e}")
        
        # Update status to error
        try:
            document = document_store.retrieve_document(document_id)
            if document:
                document.status = "error"
                document_store.store_document(document, [])
        except:
            pass  # Ignore errors in error handling
