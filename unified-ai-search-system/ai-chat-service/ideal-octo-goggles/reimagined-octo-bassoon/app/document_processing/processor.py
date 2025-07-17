"""
Document processing pipeline for various file formats
"""

import os
import json
import tempfile
import uuid
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from pathlib import Path
import asyncio
from datetime import datetime, timezone

from app.core.logging import get_logger

logger = get_logger(__name__)

@dataclass
class DocumentChunk:
    """Represents a chunk of a document"""
    id: str
    content: str
    metadata: Dict
    embedding: Optional[List[float]] = None

@dataclass
class ProcessedDocument:
    """Represents a processed document with chunks"""
    id: str
    title: str
    content: str
    chunks: List[DocumentChunk]
    metadata: Dict
    processing_time: float

class DocumentProcessor:
    """
    Multi-format document processor for ultra-fast search integration
    """
    
    def __init__(self, chunk_size: int = 1000, chunk_overlap: int = 100):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.supported_formats = {
            'text/plain': self._process_text,
            'application/json': self._process_json,
            'text/markdown': self._process_markdown,
            'application/pdf': self._process_pdf,
            'text/html': self._process_html,
            'application/msword': self._process_doc,
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': self._process_docx
        }
        
    async def process_file(self, file_path: str, title: str = None, content_type: str = None) -> ProcessedDocument:
        """Process a file and return a ProcessedDocument"""
        start_time = asyncio.get_event_loop().time()
        
        try:
            # Determine content type
            if not content_type:
                content_type = self._detect_content_type(file_path)
            
            # Read file content
            with open(file_path, 'rb') as f:
                file_content = f.read()
            
            # Process based on content type
            if content_type in self.supported_formats:
                processor = self.supported_formats[content_type]
                content = await processor(file_content)
            else:
                # Fallback to text processing
                content = file_content.decode('utf-8', errors='ignore')
            
            # Generate document ID
            doc_id = f"doc_{uuid.uuid4().hex[:8]}_{int(datetime.now().timestamp())}"
            
            # Create metadata
            metadata = {
                'file_path': file_path,
                'content_type': content_type,
                'file_size': len(file_content),
                'processing_time': asyncio.get_event_loop().time() - start_time,
                'processed_at': datetime.now(timezone.utc).isoformat()
            }
            
            # Create chunks
            chunks = await self._create_chunks(content, doc_id, metadata)
            
            processing_time = asyncio.get_event_loop().time() - start_time
            
            return ProcessedDocument(
                id=doc_id,
                title=title or os.path.basename(file_path),
                content=content,
                chunks=chunks,
                metadata=metadata,
                processing_time=processing_time
            )
            
        except Exception as e:
            logger.error(f"Failed to process file {file_path}: {str(e)}")
            raise
    
    async def process_content(self, content: str, title: str, content_type: str = 'text/plain') -> ProcessedDocument:
        """Process content directly without file"""
        start_time = asyncio.get_event_loop().time()
        
        try:
            # Generate document ID
            doc_id = f"doc_{uuid.uuid4().hex[:8]}_{int(datetime.now().timestamp())}"
            
            # Create metadata
            metadata = {
                'content_type': content_type,
                'content_length': len(content),
                'processing_time': asyncio.get_event_loop().time() - start_time,
                'processed_at': datetime.now(timezone.utc).isoformat()
            }
            
            # Create chunks
            chunks = await self._create_chunks(content, doc_id, metadata)
            
            processing_time = asyncio.get_event_loop().time() - start_time
            
            return ProcessedDocument(
                id=doc_id,
                title=title,
                content=content,
                chunks=chunks,
                metadata=metadata,
                processing_time=processing_time
            )
            
        except Exception as e:
            logger.error(f"Failed to process content: {str(e)}")
            raise
    
    async def _create_chunks(self, content: str, doc_id: str, metadata: Dict) -> List[DocumentChunk]:
        """Create chunks from content"""
        chunks = []
        
        # Simple chunking strategy
        words = content.split()
        chunk_words = []
        chunk_index = 0
        
        for word in words:
            chunk_words.append(word)
            
            if len(chunk_words) >= self.chunk_size:
                # Create chunk
                chunk_content = ' '.join(chunk_words)
                chunk_id = f"{doc_id}_chunk_{chunk_index}"
                
                chunk = DocumentChunk(
                    id=chunk_id,
                    content=chunk_content,
                    metadata={
                        **metadata,
                        'chunk_index': chunk_index,
                        'chunk_size': len(chunk_words),
                        'document_id': doc_id
                    }
                )
                chunks.append(chunk)
                
                # Handle overlap
                if self.chunk_overlap > 0:
                    chunk_words = chunk_words[-self.chunk_overlap:]
                else:
                    chunk_words = []
                
                chunk_index += 1
        
        # Handle remaining words
        if chunk_words:
            chunk_content = ' '.join(chunk_words)
            chunk_id = f"{doc_id}_chunk_{chunk_index}"
            
            chunk = DocumentChunk(
                id=chunk_id,
                content=chunk_content,
                metadata={
                    **metadata,
                    'chunk_index': chunk_index,
                    'chunk_size': len(chunk_words),
                    'document_id': doc_id
                }
            )
            chunks.append(chunk)
        
        return chunks
    
    def _detect_content_type(self, file_path: str) -> str:
        """Detect content type from file extension"""
        ext = Path(file_path).suffix.lower()
        
        ext_to_type = {
            '.txt': 'text/plain',
            '.json': 'application/json',
            '.md': 'text/markdown',
            '.pdf': 'application/pdf',
            '.html': 'text/html',
            '.htm': 'text/html',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        }
        
        return ext_to_type.get(ext, 'text/plain')
    
    async def _process_text(self, content: bytes) -> str:
        """Process plain text files"""
        return content.decode('utf-8', errors='ignore')
    
    async def _process_json(self, content: bytes) -> str:
        """Process JSON files"""
        try:
            data = json.loads(content.decode('utf-8'))
            if isinstance(data, dict):
                return json.dumps(data, indent=2)
            elif isinstance(data, list):
                return '\n'.join([json.dumps(item, indent=2) for item in data])
            else:
                return str(data)
        except json.JSONDecodeError:
            return content.decode('utf-8', errors='ignore')
    
    async def _process_markdown(self, content: bytes) -> str:
        """Process Markdown files"""
        return content.decode('utf-8', errors='ignore')
    
    async def _process_pdf(self, content: bytes) -> str:
        """Process PDF files - basic implementation"""
        # In a production system, you'd use libraries like PyPDF2 or pdfplumber
        # For now, return placeholder
        return f"PDF content ({len(content)} bytes) - PDF processing not implemented"
    
    async def _process_html(self, content: bytes) -> str:
        """Process HTML files"""
        try:
            # Basic HTML processing - in production, use BeautifulSoup
            from html.parser import HTMLParser
            
            class HTMLTextExtractor(HTMLParser):
                def __init__(self):
                    super().__init__()
                    self.text = []
                
                def handle_data(self, data):
                    self.text.append(data)
            
            parser = HTMLTextExtractor()
            parser.feed(content.decode('utf-8', errors='ignore'))
            return ' '.join(parser.text)
            
        except Exception as e:
            logger.warning(f"HTML processing failed: {str(e)}")
            return content.decode('utf-8', errors='ignore')
    
    async def _process_doc(self, content: bytes) -> str:
        """Process DOC files"""
        # In a production system, you'd use libraries like python-docx
        return f"DOC content ({len(content)} bytes) - DOC processing not implemented"
    
    async def _process_docx(self, content: bytes) -> str:
        """Process DOCX files"""
        # In a production system, you'd use libraries like python-docx
        return f"DOCX content ({len(content)} bytes) - DOCX processing not implemented"

class BatchDocumentProcessor:
    """
    Batch processor for multiple documents
    """
    
    def __init__(self, max_concurrent: int = 5):
        self.max_concurrent = max_concurrent
        self.processor = DocumentProcessor()
    
    async def process_batch(self, file_paths: List[str]) -> List[ProcessedDocument]:
        """Process multiple files in batch"""
        semaphore = asyncio.Semaphore(self.max_concurrent)
        
        async def process_single(file_path: str) -> ProcessedDocument:
            async with semaphore:
                return await self.processor.process_file(file_path)
        
        tasks = [process_single(path) for path in file_paths]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Filter out exceptions
        successful_results = []
        for result in results:
            if isinstance(result, Exception):
                logger.error(f"Batch processing error: {str(result)}")
            else:
                successful_results.append(result)
        
        return successful_results
    
    async def process_directory(self, directory_path: str, recursive: bool = True) -> List[ProcessedDocument]:
        """Process all files in a directory"""
        file_paths = []
        
        if recursive:
            for root, dirs, files in os.walk(directory_path):
                for file in files:
                    file_paths.append(os.path.join(root, file))
        else:
            for file in os.listdir(directory_path):
                file_path = os.path.join(directory_path, file)
                if os.path.isfile(file_path):
                    file_paths.append(file_path)
        
        return await self.process_batch(file_paths)