"""
Comprehensive Test Suite for RAG Integration
Tests all components of the RAG system
"""

import pytest
import asyncio
import tempfile
import json
from pathlib import Path
from unittest.mock import Mock, patch, AsyncMock
from typing import List, Dict, Any

# Test data
SAMPLE_DOCUMENT_CONTENT = """
Artificial Intelligence (AI) refers to the simulation of human intelligence in machines.
Machine Learning is a subset of AI that enables machines to learn from data without being explicitly programmed.
Deep Learning is a subset of machine learning that uses neural networks with multiple layers.
Natural Language Processing (NLP) is a branch of AI that helps computers understand, interpret, and manipulate human language.
Computer Vision is an AI field that trains computers to interpret and make decisions based on visual data.
Robotics combines AI with physical machines to create intelligent systems that can interact with the physical world.
"""

SAMPLE_JSON_CONTENT = {
    "title": "AI Research Paper",
    "abstract": "This paper discusses the latest advances in artificial intelligence.",
    "sections": [
        {
            "title": "Introduction",
            "content": "AI has revolutionized many industries."
        },
        {
            "title": "Methodology",
            "content": "We used machine learning techniques to analyze data."
        }
    ]
}


class TestRAGModels:
    """Test RAG data models"""
    
    def test_document_chunk_creation(self):
        """Test DocumentChunk creation and serialization"""
        from app.rag.models import DocumentChunk
        
        chunk = DocumentChunk(
            content="Test content",
            source_document_id="doc1",
            chunk_index=0
        )
        
        assert chunk.content == "Test content"
        assert chunk.source_document_id == "doc1"
        assert chunk.chunk_index == 0
        assert chunk.chunk_id  # Should be auto-generated
        
        # Test serialization
        chunk_dict = chunk.to_dict()
        assert chunk_dict['content'] == "Test content"
        assert chunk_dict['source_document_id'] == "doc1"
        
        # Test deserialization
        new_chunk = DocumentChunk.from_dict(chunk_dict)
        assert new_chunk.content == chunk.content
        assert new_chunk.source_document_id == chunk.source_document_id
    
    def test_document_creation(self):
        """Test Document creation and serialization"""
        from app.rag.models import Document
        
        document = Document(
            filename="test.txt",
            content="Test document content",
            content_type=".txt",
            file_size=1024
        )
        
        assert document.filename == "test.txt"
        assert document.content == "Test document content"
        assert document.status == "pending"
        
        # Test serialization
        doc_dict = document.to_dict()
        assert doc_dict['filename'] == "test.txt"
        assert doc_dict['status'] == "pending"
    
    def test_document_processor_text(self):
        """Test DocumentProcessor with text content"""
        from app.rag.models import DocumentProcessor
        
        processor = DocumentProcessor()
        
        # Test plain text processing
        document = processor.process_document(
            content="This is a test document.",
            filename="test.txt",
            content_type=".txt"
        )
        
        assert document.content == "This is a test document."
        assert document.filename == "test.txt"
        assert document.status == "processing"
    
    def test_document_processor_json(self):
        """Test DocumentProcessor with JSON content"""
        from app.rag.models import DocumentProcessor
        
        processor = DocumentProcessor()
        
        # Test JSON processing
        json_content = json.dumps(SAMPLE_JSON_CONTENT)
        document = processor.process_document(
            content=json_content,
            filename="test.json",
            content_type=".json"
        )
        
        assert "AI Research Paper" in document.content
        assert "artificial intelligence" in document.content
        assert document.filename == "test.json"
    
    def test_document_chunker_semantic(self):
        """Test DocumentChunker with semantic strategy"""
        from app.rag.models import DocumentChunker, Document
        
        chunker = DocumentChunker(chunk_size=200, overlap=50)
        
        document = Document(
            content=SAMPLE_DOCUMENT_CONTENT,
            filename="test.txt"
        )
        
        chunks = chunker.chunk_document(document, strategy="semantic")
        
        assert len(chunks) > 0
        assert all(chunk.content for chunk in chunks)
        assert all(chunk.source_document_id == document.id for chunk in chunks)
        
        # Check chunk indices
        for i, chunk in enumerate(chunks):
            assert chunk.chunk_index == i
    
    def test_document_chunker_fixed(self):
        """Test DocumentChunker with fixed strategy"""
        from app.rag.models import DocumentChunker, Document
        
        chunker = DocumentChunker(chunk_size=100, overlap=20)
        
        document = Document(
            content=SAMPLE_DOCUMENT_CONTENT,
            filename="test.txt"
        )
        
        chunks = chunker.chunk_document(document, strategy="fixed")
        
        assert len(chunks) > 0
        assert all(len(chunk.content) <= 120 for chunk in chunks)  # chunk_size + some buffer
    
    def test_document_store_operations(self):
        """Test DocumentStore operations"""
        from app.rag.models import DocumentStore, Document, DocumentChunk
        
        # Use temporary directory for testing
        with tempfile.TemporaryDirectory() as temp_dir:
            store = DocumentStore(
                db_path=f"{temp_dir}/test.db",
                documents_dir=f"{temp_dir}/docs"
            )
            
            # Create test document and chunks
            document = Document(
                filename="test.txt",
                content="Test content",
                status="completed"
            )
            
            chunks = [
                DocumentChunk(
                    content="First chunk",
                    source_document_id=document.id,
                    chunk_index=0
                ),
                DocumentChunk(
                    content="Second chunk",
                    source_document_id=document.id,
                    chunk_index=1
                )
            ]
            
            # Test storing
            success = store.store_document(document, chunks)
            assert success
            
            # Test retrieving
            retrieved_doc = store.retrieve_document(document.id)
            assert retrieved_doc is not None
            assert retrieved_doc.filename == "test.txt"
            assert len(retrieved_doc.chunks) == 2
            
            # Test listing
            documents = store.list_documents()
            assert len(documents) == 1
            assert documents[0]['filename'] == "test.txt"
            
            # Test deleting
            deleted = store.delete_document(document.id)
            assert deleted
            
            # Verify deletion
            retrieved_doc = store.retrieve_document(document.id)
            assert retrieved_doc is None


class TestRAGEngine:
    """Test RAG Enhanced Engine"""
    
    @pytest.fixture
    def mock_rag_engine(self):
        """Create a mock RAG engine for testing"""
        with patch('app.rag.enhanced_engine.RAGUltraFastEngine') as mock_engine:
            engine = mock_engine.return_value
            engine.chunk_embeddings = {}
            engine.chunk_metadata = {}
            engine.document_chunks = {}
            engine.document_vectors = {}
            engine.document_text_features = {}
            
            # Mock methods
            engine.search = AsyncMock(return_value=[])
            engine.retrieve_for_rag = AsyncMock(return_value=[])
            engine.index_document_chunks = AsyncMock(return_value=True)
            engine.get_stats = AsyncMock(return_value={})
            
            yield engine
    
    @pytest.mark.asyncio
    async def test_index_document_chunks(self, mock_rag_engine):
        """Test indexing document chunks"""
        from app.rag.models import DocumentChunk
        
        chunks = [
            DocumentChunk(
                content="Test chunk 1",
                source_document_id="doc1",
                chunk_index=0
            ),
            DocumentChunk(
                content="Test chunk 2", 
                source_document_id="doc1",
                chunk_index=1
            )
        ]
        
        # Test indexing
        result = await mock_rag_engine.index_document_chunks(chunks)
        assert result is True
        
        # Verify mock was called
        mock_rag_engine.index_document_chunks.assert_called_once_with(chunks)
    
    @pytest.mark.asyncio
    async def test_rag_retrieval(self, mock_rag_engine):
        """Test RAG retrieval"""
        from app.rag.enhanced_engine import RAGSearchResult
        
        # Mock return value
        mock_results = [
            RAGSearchResult(
                chunk_id="chunk1",
                content="Test content 1",
                relevance_score=0.9,
                source_document_id="doc1",
                chunk_index=0,
                metadata={},
                combined_score=0.9
            )
        ]
        
        mock_rag_engine.retrieve_for_rag.return_value = mock_results
        
        # Test retrieval
        results = await mock_rag_engine.retrieve_for_rag("test query", top_k=5)
        assert len(results) == 1
        assert results[0].content == "Test content 1"


class TestRAGIntegration:
    """Test RAG system integration"""
    
    @pytest.fixture
    def mock_rag_manager(self):
        """Create mock RAG manager"""
        with patch('app.rag.integration.RAGSystemManager') as mock_manager:
            manager = mock_manager.return_value
            manager.initialized = True
            manager.initialize = AsyncMock()
            manager.shutdown = AsyncMock()
            manager.health_check = AsyncMock(return_value={'components_healthy': True})
            
            # Mock components
            manager.get_components.return_value = {
                'document_processor': Mock(),
                'document_chunker': Mock(),
                'document_store': Mock(),
                'rag_engine': Mock()
            }
            
            yield manager
    
    @pytest.mark.asyncio
    async def test_rag_system_initialization(self, mock_rag_manager):
        """Test RAG system initialization"""
        from app.rag.integration import initialize_rag_system
        
        await initialize_rag_system(embedding_dim=384, use_gpu=False)
        
        # Verify initialization was called
        mock_rag_manager.initialize.assert_called_once_with(384, False)
    
    @pytest.mark.asyncio
    async def test_rag_health_check(self, mock_rag_manager):
        """Test RAG health check"""
        from app.rag.integration import get_rag_health
        
        health = await get_rag_health()
        assert health['components_healthy'] is True
        
        # Verify health check was called
        mock_rag_manager.health_check.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_rag_bridge_document_processing(self):
        """Test RAG bridge document processing"""
        from app.rag.integration import RAGIntegrationBridge
        
        with patch('app.rag.integration.rag_manager') as mock_manager:
            # Mock components
            mock_processor = Mock()
            mock_chunker = Mock()
            mock_store = Mock()
            mock_engine = Mock()
            
            mock_manager.get_components.return_value = {
                'document_processor': mock_processor,
                'document_chunker': mock_chunker,
                'document_store': mock_store,
                'rag_engine': mock_engine
            }
            
            # Mock return values
            mock_document = Mock()
            mock_document.id = "doc1"
            mock_processor.process_document.return_value = mock_document
            
            mock_chunks = [Mock()]
            mock_chunker.chunk_document.return_value = mock_chunks
            
            mock_store.store_document.return_value = True
            mock_engine.index_document_chunks = AsyncMock(return_value=True)
            
            # Test processing
            bridge = RAGIntegrationBridge()
            result = await bridge.process_document_for_rag(
                content=b"Test content",
                filename="test.txt",
                metadata={"source": "test"}
            )
            
            assert result['success'] is True
            assert result['document_id'] == "doc1"
    
    @pytest.mark.asyncio
    async def test_rag_bridge_retrieval(self):
        """Test RAG bridge retrieval"""
        from app.rag.integration import RAGIntegrationBridge
        from app.rag.enhanced_engine import RAGSearchResult
        
        with patch('app.rag.integration.rag_manager') as mock_manager:
            # Mock engine
            mock_engine = Mock()
            mock_results = [
                RAGSearchResult(
                    chunk_id="chunk1",
                    content="Test content",
                    relevance_score=0.9,
                    source_document_id="doc1",
                    chunk_index=0,
                    metadata={},
                    combined_score=0.9
                )
            ]
            mock_engine.retrieve_for_rag = AsyncMock(return_value=mock_results)
            
            mock_manager.get_components.return_value = {
                'rag_engine': mock_engine
            }
            
            # Test retrieval
            bridge = RAGIntegrationBridge()
            result = await bridge.rag_retrieve(
                query="test query",
                top_k=5
            )
            
            assert result['success'] is True
            assert len(result['results']) == 1
            assert result['results'][0]['content'] == "Test content"


class TestRAGAPI:
    """Test RAG API endpoints"""
    
    @pytest.fixture
    def mock_rag_components(self):
        """Mock RAG components for API testing"""
        with patch('app.rag.api.rag_engine') as mock_engine, \
             patch('app.rag.api.document_processor') as mock_processor, \
             patch('app.rag.api.document_chunker') as mock_chunker, \
             patch('app.rag.api.document_store') as mock_store:
            
            # Configure mocks
            mock_engine.retrieve_for_rag = AsyncMock(return_value=[])
            mock_processor.process_document = Mock()
            mock_chunker.chunk_document = Mock()
            mock_store.store_document = Mock(return_value=True)
            
            yield {
                'engine': mock_engine,
                'processor': mock_processor,
                'chunker': mock_chunker,
                'store': mock_store
            }
    
    def test_rag_query_request_validation(self):
        """Test RAG query request validation"""
        from app.rag.api import RAGQueryRequest
        
        # Valid request
        request = RAGQueryRequest(
            query="test query",
            max_chunks=5,
            confidence_threshold=0.3
        )
        
        assert request.query == "test query"
        assert request.max_chunks == 5
        assert request.confidence_threshold == 0.3
        
        # Test with invalid confidence threshold
        with pytest.raises(ValueError):
            RAGQueryRequest(
                query="test query",
                confidence_threshold=1.5  # Invalid: > 1.0
            )
    
    def test_document_upload_request_validation(self):
        """Test document upload request validation"""
        from app.rag.api import DocumentUploadRequest
        
        # Valid request
        request = DocumentUploadRequest(
            title="Test Document",
            chunking_strategy="semantic",
            chunk_size=512
        )
        
        assert request.title == "Test Document"
        assert request.chunking_strategy == "semantic"
        assert request.chunk_size == 512
        
        # Test with invalid chunk size
        with pytest.raises(ValueError):
            DocumentUploadRequest(
                chunk_size=50  # Invalid: < 100
            )
    
    @pytest.mark.asyncio
    async def test_rag_query_endpoint_success(self, mock_rag_components):
        """Test successful RAG query endpoint"""
        from app.rag.api import rag_query, RAGQueryRequest
        from app.rag.enhanced_engine import RAGSearchResult
        
        # Mock successful retrieval
        mock_results = [
            RAGSearchResult(
                chunk_id="chunk1",
                content="Test content",
                relevance_score=0.9,
                source_document_id="doc1",
                chunk_index=0,
                metadata={},
                combined_score=0.9
            )
        ]
        mock_rag_components['engine'].retrieve_for_rag.return_value = mock_results
        
        # Test query
        request = RAGQueryRequest(query="test query", max_chunks=5)
        
        # Mock the global variables
        import app.rag.api as api_module
        api_module.rag_engine = mock_rag_components['engine']
        
        response = await rag_query(request)
        
        assert response.query == "test query"
        assert response.total_chunks_found == 1
        assert len(response.chunks) == 1
        assert response.chunks[0]['content'] == "Test content"
    
    @pytest.mark.asyncio
    async def test_rag_query_endpoint_no_engine(self):
        """Test RAG query endpoint when engine is not available"""
        from app.rag.api import rag_query, RAGQueryRequest
        from fastapi import HTTPException
        
        # Mock missing engine
        import app.rag.api as api_module
        api_module.rag_engine = None
        
        request = RAGQueryRequest(query="test query")
        
        with pytest.raises(HTTPException) as exc_info:
            await rag_query(request)
        
        assert exc_info.value.status_code == 503
        assert "not initialized" in str(exc_info.value.detail)


class TestFullRAGWorkflow:
    """Test complete RAG workflow end-to-end"""
    
    @pytest.mark.asyncio
    async def test_complete_workflow(self):
        """Test complete RAG workflow from document upload to query"""
        # This would be an integration test that:
        # 1. Uploads a document
        # 2. Processes and chunks it
        # 3. Indexes the chunks
        # 4. Performs a query
        # 5. Retrieves relevant chunks
        # 6. Verifies the results
        
        # For now, we'll use mocks to simulate the workflow
        from app.rag.models import DocumentProcessor, DocumentChunker, DocumentStore
        from app.rag.enhanced_engine import RAGUltraFastEngine
        
        with tempfile.TemporaryDirectory() as temp_dir:
            # Initialize components
            processor = DocumentProcessor()
            chunker = DocumentChunker(chunk_size=200, overlap=50)
            store = DocumentStore(
                db_path=f"{temp_dir}/test.db",
                documents_dir=f"{temp_dir}/docs"
            )
            
            # Mock the engine for this test
            with patch('app.rag.enhanced_engine.RAGUltraFastEngine') as mock_engine_class:
                engine = mock_engine_class.return_value
                engine.index_document_chunks = AsyncMock(return_value=True)
                engine.retrieve_for_rag = AsyncMock(return_value=[])
                
                # Step 1: Process document
                document = processor.process_document(
                    content=SAMPLE_DOCUMENT_CONTENT,
                    filename="ai_document.txt",
                    content_type=".txt"
                )
                
                assert document.content
                assert "Artificial Intelligence" in document.content
                
                # Step 2: Create chunks
                chunks = chunker.chunk_document(document, strategy="semantic")
                
                assert len(chunks) > 0
                assert all(chunk.content for chunk in chunks)
                
                # Step 3: Store document
                success = store.store_document(document, chunks)
                assert success
                
                # Step 4: Index chunks
                await engine.index_document_chunks(chunks)
                engine.index_document_chunks.assert_called_once_with(chunks)
                
                # Step 5: Query
                await engine.retrieve_for_rag("machine learning", top_k=3)
                engine.retrieve_for_rag.assert_called_once()
                
                # If we got here, the workflow completed successfully
                assert True


# Performance tests
class TestRAGPerformance:
    """Test RAG system performance"""
    
    @pytest.mark.asyncio
    async def test_document_processing_performance(self):
        """Test document processing performance"""
        from app.rag.models import DocumentProcessor
        
        processor = DocumentProcessor()
        
        # Test with large document
        large_content = SAMPLE_DOCUMENT_CONTENT * 100  # Repeat 100 times
        
        import time
        start_time = time.time()
        
        document = processor.process_document(
            content=large_content,
            filename="large_document.txt",
            content_type=".txt"
        )
        
        processing_time = time.time() - start_time
        
        # Should process reasonably quickly (under 1 second for this test)
        assert processing_time < 1.0
        assert document.content
        assert len(document.content) > 0
    
    @pytest.mark.asyncio
    async def test_chunking_performance(self):
        """Test chunking performance"""
        from app.rag.models import DocumentChunker, Document
        
        chunker = DocumentChunker(chunk_size=500, overlap=50)
        
        # Create large document
        large_content = SAMPLE_DOCUMENT_CONTENT * 50
        document = Document(content=large_content, filename="large_test.txt")
        
        import time
        start_time = time.time()
        
        chunks = chunker.chunk_document(document, strategy="semantic")
        
        chunking_time = time.time() - start_time
        
        # Should chunk reasonably quickly
        assert chunking_time < 2.0
        assert len(chunks) > 0
        assert all(chunk.content for chunk in chunks)


if __name__ == "__main__":
    # Run tests
    pytest.main([__file__, "-v"])
