"""
RAG System Integration Configuration
"""

from typing import Dict, Any, Optional
from dataclasses import dataclass
from pathlib import Path


@dataclass
class RAGConfig:
    """Configuration for RAG system"""
    
    # Document processing settings
    max_document_size: int = 10 * 1024 * 1024  # 10MB
    supported_document_types: list = None
    temp_upload_dir: str = "temp_uploads"
    
    # Chunking settings
    default_chunk_size: int = 512
    default_chunk_overlap: int = 50
    min_chunk_size: int = 50
    max_chunk_size: int = 2000
    
    # Search settings
    default_max_chunks: int = 5
    default_confidence_threshold: float = 0.3
    similarity_threshold: float = 0.5
    
    # Storage settings
    document_storage_path: str = "data/rag_documents"
    database_path: str = "data/rag_documents.db"
    
    # Performance settings
    embedding_batch_size: int = 16
    indexing_batch_size: int = 32
    parallel_processing: bool = True
    
    # Citation settings
    citation_snippet_length: int = 200
    include_citations_by_default: bool = True
    
    def __post_init__(self):
        if self.supported_document_types is None:
            self.supported_document_types = ['.pdf', '.txt', '.docx', '.html', '.md', '.json']
        
        # Ensure directories exist
        Path(self.document_storage_path).mkdir(parents=True, exist_ok=True)
        Path(self.temp_upload_dir).mkdir(parents=True, exist_ok=True)


# Global configuration instance
rag_config = RAGConfig()


class RAGSystemManager:
    """
    Manager for RAG system components
    Handles initialization, configuration, and coordination
    """
    
    def __init__(self, config: RAGConfig = None):
        self.config = config or rag_config
        self.document_processor = None
        self.document_chunker = None
        self.document_store = None
        self.rag_engine = None
        self.initialized = False
    
    async def initialize(self, embedding_dim: int = 384, use_gpu: bool = False):
        """
        Initialize all RAG components
        
        Args:
            embedding_dim: Dimension of embeddings
            use_gpu: Whether to use GPU acceleration
        """
        try:
            from app.rag.models import DocumentProcessor, DocumentChunker, DocumentStore
            from app.rag.enhanced_engine import RAGUltraFastEngine
            from app.logger import get_enhanced_logger
            
            logger = get_enhanced_logger(__name__)
            logger.info("Initializing RAG system...")
            
            # Initialize document processor
            self.document_processor = DocumentProcessor()
            
            # Initialize document chunker
            self.document_chunker = DocumentChunker(
                chunk_size=self.config.default_chunk_size,
                overlap=self.config.default_chunk_overlap
            )
            
            # Initialize document store
            self.document_store = DocumentStore(
                db_path=self.config.database_path,
                documents_dir=self.config.document_storage_path
            )
            
            # Initialize RAG search engine
            self.rag_engine = RAGUltraFastEngine(
                embedding_dim=embedding_dim,
                use_gpu=use_gpu
            )
            
            # Load existing documents if any
            await self._load_existing_documents()
            
            self.initialized = True
            logger.info("RAG system initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize RAG system: {e}")
            raise
    
    async def _load_existing_documents(self):
        """Load existing documents into the RAG engine"""
        try:
            from app.logger import get_enhanced_logger
            logger = get_enhanced_logger(__name__)
            
            # Get list of all documents
            documents = self.document_store.list_documents(limit=1000)
            
            if not documents:
                logger.info("No existing documents found")
                return
            
            logger.info(f"Loading {len(documents)} existing documents...")
            
            # Load chunks for each document
            total_chunks = 0
            for doc_info in documents:
                try:
                    document = self.document_store.retrieve_document(doc_info['id'])
                    if document and document.chunks:
                        await self.rag_engine.index_document_chunks(document.chunks)
                        total_chunks += len(document.chunks)
                        
                except Exception as e:
                    logger.warning(f"Failed to load document {doc_info['id']}: {e}")
            
            logger.info(f"Loaded {total_chunks} chunks from {len(documents)} documents")
            
        except Exception as e:
            logger.error(f"Error loading existing documents: {e}")
    
    def get_components(self) -> Dict[str, Any]:
        """Get all RAG components"""
        return {
            'document_processor': self.document_processor,
            'document_chunker': self.document_chunker,
            'document_store': self.document_store,
            'rag_engine': self.rag_engine,
            'config': self.config
        }
    
    async def health_check(self) -> Dict[str, Any]:
        """Perform health check on all components"""
        health_status = {
            'initialized': self.initialized,
            'document_processor': self.document_processor is not None,
            'document_chunker': self.document_chunker is not None,
            'document_store': self.document_store is not None,
            'rag_engine': self.rag_engine is not None,
            'components_healthy': True
        }
        
        try:
            if self.rag_engine:
                stats = await self.rag_engine.get_stats()
                health_status['rag_stats'] = stats
                
            if self.document_store:
                # Test database connection
                test_docs = self.document_store.list_documents(limit=1)
                health_status['database_accessible'] = True
                
        except Exception as e:
            health_status['components_healthy'] = False
            health_status['error'] = str(e)
        
        return health_status
    
    async def shutdown(self):
        """Shutdown RAG system components"""
        try:
            from app.logger import get_enhanced_logger
            logger = get_enhanced_logger(__name__)
            
            logger.info("Shutting down RAG system...")
            
            # Cleanup components
            if self.rag_engine:
                # Save any pending indexes
                pass
            
            self.initialized = False
            logger.info("RAG system shutdown completed")
            
        except Exception as e:
            logger.error(f"Error during RAG system shutdown: {e}")


# Global manager instance
rag_manager = RAGSystemManager()


def get_rag_components() -> Dict[str, Any]:
    """Get RAG components for dependency injection"""
    if not rag_manager.initialized:
        raise RuntimeError("RAG system not initialized")
    
    return rag_manager.get_components()


async def initialize_rag_system(embedding_dim: int = 384, use_gpu: bool = False):
    """Initialize RAG system (called during app startup)"""
    await rag_manager.initialize(embedding_dim, use_gpu)
    
    # Set components in API module
    try:
        from app.rag import api as rag_api
        components = rag_manager.get_components()
        
        rag_api.rag_engine = components['rag_engine']
        rag_api.document_processor = components['document_processor']
        rag_api.document_chunker = components['document_chunker']
        rag_api.document_store = components['document_store']
        
    except ImportError:
        pass  # API module not available yet


async def shutdown_rag_system():
    """Shutdown RAG system (called during app shutdown)"""
    await rag_manager.shutdown()


async def get_rag_health() -> Dict[str, Any]:
    """Get RAG system health status"""
    return await rag_manager.health_check()


def get_rag_config() -> RAGConfig:
    """Get RAG configuration"""
    return rag_manager.config


def update_rag_config(config_updates: Dict[str, Any]):
    """Update RAG configuration"""
    for key, value in config_updates.items():
        if hasattr(rag_manager.config, key):
            setattr(rag_manager.config, key, value)
        else:
            raise ValueError(f"Unknown configuration key: {key}")


class RAGIntegrationBridge:
    """
    Bridge for integrating with ubiquitous-octo-invention
    Provides standardized API for cross-system communication
    """
    
    def __init__(self):
        self.rag_manager = rag_manager
    
    async def process_document_for_rag(self, content: bytes, filename: str, 
                                     metadata: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Process document for RAG system
        
        Args:
            content: Document content as bytes
            filename: Original filename
            metadata: Optional metadata
            
        Returns:
            Processing result with document ID and stats
        """
        try:
            components = self.rag_manager.get_components()
            
            # Process document
            document = components['document_processor'].process_document(
                content=content,
                filename=filename,
                content_type=Path(filename).suffix.lower()
            )
            
            # Add metadata
            if metadata:
                document.metadata.update(metadata)
            
            # Create chunks
            chunks = components['document_chunker'].chunk_document(document)
            
            # Store document and chunks
            success = components['document_store'].store_document(document, chunks)
            
            if success:
                # Index chunks
                await components['rag_engine'].index_document_chunks(chunks)
                
                return {
                    'success': True,
                    'document_id': document.id,
                    'filename': filename,
                    'chunks_created': len(chunks),
                    'processing_time': 0.0,  # TODO: Add timing
                    'status': 'completed'
                }
            else:
                return {
                    'success': False,
                    'error': 'Failed to store document',
                    'status': 'error'
                }
                
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'status': 'error'
            }
    
    async def rag_retrieve(self, query: str, top_k: int = 5, 
                          filters: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Retrieve documents for RAG
        
        Args:
            query: Search query
            top_k: Number of results to return
            filters: Optional filters
            
        Returns:
            Retrieved chunks and metadata
        """
        try:
            components = self.rag_manager.get_components()
            
            # Perform retrieval
            results = await components['rag_engine'].retrieve_for_rag(
                query=query,
                top_k=top_k,
                document_filter=filters.get('document_ids') if filters else None,
                confidence_threshold=filters.get('confidence_threshold', 0.3) if filters else 0.3
            )
            
            # Format results
            formatted_results = []
            for result in results:
                formatted_results.append({
                    'chunk_id': result.chunk_id,
                    'content': result.content,
                    'score': result.combined_score,
                    'source_document_id': result.source_document_id,
                    'metadata': result.metadata
                })
            
            return {
                'success': True,
                'query': query,
                'results': formatted_results,
                'total_found': len(results),
                'search_time': 0.0  # TODO: Add timing
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'results': []
            }
    
    async def get_system_stats(self) -> Dict[str, Any]:
        """Get system statistics"""
        try:
            health = await self.rag_manager.health_check()
            
            if health['components_healthy']:
                return {
                    'success': True,
                    'stats': health.get('rag_stats', {}),
                    'health': health
                }
            else:
                return {
                    'success': False,
                    'error': health.get('error', 'System unhealthy'),
                    'health': health
                }
                
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }


# Global bridge instance
rag_bridge = RAGIntegrationBridge()
