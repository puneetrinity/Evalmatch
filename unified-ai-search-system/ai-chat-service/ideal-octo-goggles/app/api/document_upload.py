"""
Document Upload API for ideal-octo-goggles
Handles file uploads and document indexing
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional, Dict
import time
import json
import os
import tempfile
from datetime import datetime, timezone
import uuid
import asyncio

from app.search.ultra_fast_engine import UltraFastSearchEngine
from app.logger import get_enhanced_logger
from app.config import settings
from app.error_handling.exceptions import SearchEngineException

router = APIRouter(prefix="/api/v2", tags=["document-upload"])
logger = get_enhanced_logger(__name__)

# This will be set on application startup
search_engine: Optional[UltraFastSearchEngine] = None

class DocumentUploadResponse(BaseModel):
    success: bool
    document_id: str
    message: str
    chunks_created: Optional[int] = None
    processing_time_ms: Optional[float] = None

class DocumentInfo(BaseModel):
    document_id: str
    title: str
    content_preview: str
    upload_time: str
    file_size: int
    file_type: str
    chunks_count: int

@router.post("/documents/upload", response_model=DocumentUploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None)
):
    """Upload a single document for indexing."""
    if search_engine is None:
        raise HTTPException(status_code=503, detail="Search engine not initialized")
    
    start_time = time.time()
    
    try:
        # Generate unique document ID
        document_id = f"doc_{uuid.uuid4().hex[:8]}_{int(time.time())}"
        
        # Use provided title or filename
        doc_title = title or file.filename or "Untitled Document"
        
        # Read file content
        content = await file.read()
        
        # Convert to text based on file type
        if file.content_type == "application/json":
            try:
                json_data = json.loads(content.decode('utf-8'))
                if isinstance(json_data, list):
                    # Handle JSON array of documents
                    text_content = "\n".join([
                        f"Document {i+1}: {json.dumps(doc, indent=2)}"
                        for i, doc in enumerate(json_data)
                    ])
                else:
                    text_content = json.dumps(json_data, indent=2)
            except json.JSONDecodeError:
                text_content = content.decode('utf-8', errors='ignore')
        else:
            # Handle text files
            text_content = content.decode('utf-8', errors='ignore')
        
        # Create document structure
        document = {
            'id': document_id,
            'title': doc_title,
            'content': text_content,
            'name': doc_title,
            'description': f"Uploaded document: {doc_title}",
            'experience': '',
            'projects': text_content[:500] + "..." if len(text_content) > 500 else text_content,
            'skills': [],
            'technologies': [],
            'experience_years': 0,
            'seniority_level': 'unknown',
            'metadata': {
                'upload_time': datetime.now(timezone.utc).isoformat(),
                'file_size': len(content),
                'file_type': file.content_type or 'unknown',
                'original_filename': file.filename
            }
        }
        
        # Add to search engine using incremental update
        if hasattr(search_engine, 'incremental_manager'):
            from app.indexing.incremental import ChangeType
            search_engine.incremental_manager.add_document_change(
                document_id, ChangeType.ADD, document
            )
            logger.info(f"Document {document_id} added to incremental update queue")
        else:
            # Fall back to direct indexing
            await search_engine.build_indexes([document])
            logger.info(f"Document {document_id} indexed directly")
        
        processing_time = (time.time() - start_time) * 1000
        
        logger.info(f"Document uploaded successfully", extra_fields={
            'document_id': document_id,
            'title': doc_title,
            'file_size': len(content),
            'processing_time_ms': processing_time
        })
        
        return DocumentUploadResponse(
            success=True,
            document_id=document_id,
            message=f"Document '{doc_title}' uploaded successfully",
            chunks_created=1,
            processing_time_ms=processing_time
        )
        
    except Exception as e:
        logger.error(f"Document upload failed: {str(e)}", extra_fields={
            'filename': file.filename,
            'content_type': file.content_type
        })
        raise HTTPException(
            status_code=500,
            detail=f"Upload failed: {str(e)}"
        )

@router.post("/documents/upload-multiple", response_model=List[DocumentUploadResponse])
async def upload_multiple_documents(
    files: List[UploadFile] = File(...)
):
    """Upload multiple documents for indexing."""
    if search_engine is None:
        raise HTTPException(status_code=503, detail="Search engine not initialized")
    
    results = []
    
    for file in files:
        try:
            # Call single upload for each file
            result = await upload_document(file)
            results.append(result)
        except HTTPException as e:
            results.append(DocumentUploadResponse(
                success=False,
                document_id="",
                message=f"Failed to upload {file.filename}: {e.detail}"
            ))
        except Exception as e:
            results.append(DocumentUploadResponse(
                success=False,
                document_id="",
                message=f"Failed to upload {file.filename}: {str(e)}"
            ))
    
    return results

@router.get("/documents/list", response_model=List[DocumentInfo])
async def list_documents():
    """List all uploaded documents."""
    if search_engine is None:
        raise HTTPException(status_code=503, detail="Search engine not initialized")
    
    try:
        documents = []
        
        # Get document metadata from search engine
        if hasattr(search_engine, 'document_metadata'):
            for doc_id, metadata in search_engine.document_metadata.items():
                # Get content preview
                content_preview = ""
                if hasattr(search_engine, 'document_vectors') and doc_id in search_engine.document_vectors:
                    # Try to get some content for preview
                    content_preview = str(metadata).replace('\n', ' ')[:200] + "..."
                
                doc_info = DocumentInfo(
                    document_id=doc_id,
                    title=metadata.get('name', 'Untitled'),
                    content_preview=content_preview,
                    upload_time=metadata.get('upload_time', datetime.now(timezone.utc).isoformat()),
                    file_size=metadata.get('file_size', 0),
                    file_type=metadata.get('file_type', 'unknown'),
                    chunks_count=1
                )
                documents.append(doc_info)
        
        return documents
        
    except Exception as e:
        logger.error(f"Failed to list documents: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to list documents: {str(e)}")

@router.delete("/documents/{document_id}")
async def delete_document(document_id: str):
    """Delete a document from the index."""
    if search_engine is None:
        raise HTTPException(status_code=503, detail="Search engine not initialized")
    
    try:
        # Remove from search engine using incremental update
        if hasattr(search_engine, 'incremental_manager'):
            from app.indexing.incremental import ChangeType
            search_engine.incremental_manager.add_document_change(
                document_id, ChangeType.DELETE
            )
            logger.info(f"Document {document_id} marked for deletion")
        else:
            # Direct removal (if supported)
            if hasattr(search_engine, 'document_metadata') and document_id in search_engine.document_metadata:
                del search_engine.document_metadata[document_id]
                if hasattr(search_engine, 'document_vectors') and document_id in search_engine.document_vectors:
                    del search_engine.document_vectors[document_id]
                logger.info(f"Document {document_id} removed directly")
            else:
                raise HTTPException(status_code=404, detail="Document not found")
        
        return {"message": f"Document {document_id} deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete document {document_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete document: {str(e)}")

@router.get("/documents/{document_id}")
async def get_document(document_id: str):
    """Get details of a specific document."""
    if search_engine is None:
        raise HTTPException(status_code=503, detail="Search engine not initialized")
    
    try:
        if hasattr(search_engine, 'document_metadata') and document_id in search_engine.document_metadata:
            metadata = search_engine.document_metadata[document_id]
            
            # Get full content if available
            content = ""
            if hasattr(search_engine, 'document_text_features') and document_id in search_engine.document_text_features:
                content = " ".join(search_engine.document_text_features[document_id])
            
            return {
                "document_id": document_id,
                "metadata": metadata,
                "content_preview": content[:1000] + "..." if len(content) > 1000 else content,
                "content_length": len(content),
                "indexed": True
            }
        else:
            raise HTTPException(status_code=404, detail="Document not found")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get document {document_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get document: {str(e)}")

@router.post("/documents/search-in/{document_id}")
async def search_in_document(document_id: str, query: str):
    """Search within a specific document."""
    if search_engine is None:
        raise HTTPException(status_code=503, detail="Search engine not initialized")
    
    try:
        # Perform search with filter for specific document
        results = await search_engine.search(
            query=query,
            num_results=10,
            filters={'document_ids': [document_id]}
        )
        
        # Filter results to only include the specified document
        filtered_results = [r for r in results if r.doc_id == document_id]
        
        return {
            "success": True,
            "document_id": document_id,
            "query": query,
            "results": [{
                "doc_id": r.doc_id,
                "similarity_score": r.similarity_score,
                "bm25_score": r.bm25_score,
                "combined_score": r.combined_score,
                "metadata": r.metadata
            } for r in filtered_results],
            "total_found": len(filtered_results)
        }
        
    except Exception as e:
        logger.error(f"Failed to search in document {document_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

# Set search engine instance (called from main.py)
def set_search_engine(engine: UltraFastSearchEngine):
    global search_engine
    search_engine = engine