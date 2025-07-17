"""
RAG-Enhanced Ultra Fast Search Engine
Extends the existing search engine with RAG capabilities
"""

import asyncio
import time
from typing import List, Dict, Optional, Any, Tuple
from dataclasses import dataclass

from app.search.ultra_fast_engine import UltraFastSearchEngine, SearchResult
from app.rag.models import DocumentChunk, Document, DocumentStore
from app.logger import get_enhanced_logger

logger = get_enhanced_logger(__name__)


@dataclass
class RAGSearchResult:
    """Enhanced search result with RAG-specific metadata"""
    chunk_id: str
    content: str
    relevance_score: float
    source_document_id: str
    chunk_index: int
    metadata: Dict[str, Any]
    embedding_score: float = 0.0
    keyword_score: float = 0.0
    combined_score: float = 0.0


class RAGUltraFastEngine(UltraFastSearchEngine):
    """Enhanced search engine with RAG capabilities"""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.document_store = DocumentStore()
        self.chunk_embeddings = {}  # chunk_id -> embedding
        self.chunk_metadata = {}    # chunk_id -> metadata
        self.document_chunks = {}   # document_id -> List[chunk_id]
        self.logger = logger
        
    async def index_document_chunks(self, chunks: List[DocumentChunk], 
                                  batch_size: int = 32) -> bool:
        """
        Index document chunks for RAG retrieval
        
        Args:
            chunks: List of DocumentChunk objects to index
            batch_size: Number of chunks to process in each batch
            
        Returns:
            True if successful, False otherwise
        """
        try:
            self.logger.info(f"Starting to index {len(chunks)} document chunks")
            
            # Process chunks in batches
            for i in range(0, len(chunks), batch_size):
                batch = chunks[i:i + batch_size]
                await self._index_chunk_batch(batch)
                
                # Log progress
                if i % (batch_size * 4) == 0:
                    self.logger.info(f"Indexed {i + len(batch)}/{len(chunks)} chunks")
            
            self.logger.info(f"Successfully indexed {len(chunks)} document chunks")
            return True
            
        except Exception as e:
            self.logger.error(f"Error indexing document chunks: {e}")
            return False
    
    async def _index_chunk_batch(self, chunks: List[DocumentChunk]):
        """Index a batch of chunks"""
        try:
            # Extract text for embedding
            chunk_texts = [chunk.content for chunk in chunks]
            
            # Generate embeddings if we have a model
            if hasattr(self, 'embedding_model') and self.embedding_model:
                embeddings = await self._generate_embeddings(chunk_texts)
            else:
                # Use simple text features if no embedding model
                embeddings = [self._extract_text_features(text) for text in chunk_texts]
            
            # Store chunks and their embeddings
            for chunk, embedding in zip(chunks, embeddings):
                # Store in parent class vectors
                self.document_vectors[chunk.chunk_id] = embedding
                
                # Store chunk-specific data
                self.chunk_embeddings[chunk.chunk_id] = embedding
                self.chunk_metadata[chunk.chunk_id] = {
                    'content': chunk.content,
                    'source_document_id': chunk.source_document_id,
                    'chunk_index': chunk.chunk_index,
                    'metadata': chunk.metadata,
                    'chunk_type': chunk.chunk_type,
                    'created_at': chunk.created_at.isoformat()
                }
                
                # Group by document
                if chunk.source_document_id not in self.document_chunks:
                    self.document_chunks[chunk.source_document_id] = []
                self.document_chunks[chunk.source_document_id].append(chunk.chunk_id)
                
                # Add to text features for hybrid search
                text_features = self._extract_text_features(chunk.content)
                self.document_text_features[chunk.chunk_id] = text_features
            
            # Rebuild HNSW index if we have enough chunks
            if len(self.document_vectors) > 100:
                await self._rebuild_vector_index()
                
        except Exception as e:
            self.logger.error(f"Error indexing chunk batch: {e}")
            raise
    
    async def _generate_embeddings(self, texts: List[str]) -> List[Any]:
        """Generate embeddings for texts"""
        try:
            if hasattr(self.embedding_model, 'encode'):
                # Sentence transformers model
                embeddings = self.embedding_model.encode(texts, convert_to_tensor=False)
                return embeddings
            else:
                # Fallback to text features
                return [self._extract_text_features(text) for text in texts]
        except Exception as e:
            self.logger.error(f"Error generating embeddings: {e}")
            return [self._extract_text_features(text) for text in texts]
    
    async def _rebuild_vector_index(self):
        """Rebuild HNSW index with new vectors"""
        try:
            if not self.document_vectors:
                return
                
            # Convert to numpy array for HNSW
            import numpy as np
            all_embeddings = np.array(list(self.document_vectors.values()))
            all_ids = list(self.document_vectors.keys())
            
            # Build HNSW index
            self._build_hnsw_index(all_ids, all_embeddings)
            
        except Exception as e:
            self.logger.error(f"Error rebuilding vector index: {e}")
    
    async def retrieve_for_rag(self, query: str, 
                              top_k: int = 5,
                              document_filter: Optional[List[str]] = None,
                              confidence_threshold: float = 0.3) -> List[RAGSearchResult]:
        """
        Retrieve relevant chunks for RAG workflow
        
        Args:
            query: Search query
            top_k: Number of top chunks to retrieve
            document_filter: Optional list of document IDs to filter by
            confidence_threshold: Minimum confidence score for results
            
        Returns:
            List of RAGSearchResult objects
        """
        try:
            start_time = time.time()
            
            # Perform hybrid search using parent class
            search_results = await self.search(query, num_results=top_k * 2)
            
            # Convert to RAG results and filter
            rag_results = []
            for result in search_results:
                # Check if this is a chunk we know about
                if result.doc_id in self.chunk_metadata:
                    chunk_meta = self.chunk_metadata[result.doc_id]
                    
                    # Apply document filter if specified
                    if document_filter and chunk_meta['source_document_id'] not in document_filter:
                        continue
                    
                    # Apply confidence threshold
                    if result.combined_score < confidence_threshold:
                        continue
                    
                    # Create RAG result
                    rag_result = RAGSearchResult(
                        chunk_id=result.doc_id,
                        content=chunk_meta['content'],
                        relevance_score=result.combined_score,
                        source_document_id=chunk_meta['source_document_id'],
                        chunk_index=chunk_meta['chunk_index'],
                        metadata=chunk_meta['metadata'],
                        embedding_score=result.vector_score,
                        keyword_score=result.keyword_score,
                        combined_score=result.combined_score
                    )
                    rag_results.append(rag_result)
            
            # Sort by relevance and take top_k
            rag_results.sort(key=lambda x: x.combined_score, reverse=True)
            final_results = rag_results[:top_k]
            
            retrieval_time = (time.time() - start_time) * 1000
            self.logger.info(f"RAG retrieval completed in {retrieval_time:.2f}ms, "
                           f"found {len(final_results)} relevant chunks")
            
            return final_results
            
        except Exception as e:
            self.logger.error(f"Error in RAG retrieval: {e}")
            return []
    
    async def get_document_chunks(self, document_id: str) -> List[RAGSearchResult]:
        """Get all chunks for a specific document"""
        try:
            if document_id not in self.document_chunks:
                return []
            
            chunk_ids = self.document_chunks[document_id]
            results = []
            
            for chunk_id in chunk_ids:
                if chunk_id in self.chunk_metadata:
                    chunk_meta = self.chunk_metadata[chunk_id]
                    result = RAGSearchResult(
                        chunk_id=chunk_id,
                        content=chunk_meta['content'],
                        relevance_score=1.0,  # Full relevance for document chunks
                        source_document_id=chunk_meta['source_document_id'],
                        chunk_index=chunk_meta['chunk_index'],
                        metadata=chunk_meta['metadata'],
                        combined_score=1.0
                    )
                    results.append(result)
            
            # Sort by chunk index
            results.sort(key=lambda x: x.chunk_index)
            return results
            
        except Exception as e:
            self.logger.error(f"Error retrieving document chunks: {e}")
            return []
    
    async def similarity_search(self, query: str, 
                               top_k: int = 10,
                               similarity_threshold: float = 0.5) -> List[RAGSearchResult]:
        """
        Perform pure similarity search (no keyword matching)
        
        Args:
            query: Search query
            top_k: Number of results to return
            similarity_threshold: Minimum similarity score
            
        Returns:
            List of RAGSearchResult objects
        """
        try:
            if not self.chunk_embeddings:
                return []
            
            # Generate query embedding
            query_embedding = await self._generate_embeddings([query])
            if not query_embedding:
                return []
            
            query_vector = query_embedding[0]
            similarities = []
            
            # Calculate similarities
            for chunk_id, chunk_embedding in self.chunk_embeddings.items():
                try:
                    similarity = self._calculate_similarity(query_vector, chunk_embedding)
                    if similarity >= similarity_threshold:
                        similarities.append((chunk_id, similarity))
                except Exception as e:
                    self.logger.warning(f"Error calculating similarity for chunk {chunk_id}: {e}")
                    continue
            
            # Sort by similarity
            similarities.sort(key=lambda x: x[1], reverse=True)
            
            # Convert to RAG results
            results = []
            for chunk_id, similarity in similarities[:top_k]:
                if chunk_id in self.chunk_metadata:
                    chunk_meta = self.chunk_metadata[chunk_id]
                    result = RAGSearchResult(
                        chunk_id=chunk_id,
                        content=chunk_meta['content'],
                        relevance_score=similarity,
                        source_document_id=chunk_meta['source_document_id'],
                        chunk_index=chunk_meta['chunk_index'],
                        metadata=chunk_meta['metadata'],
                        embedding_score=similarity,
                        combined_score=similarity
                    )
                    results.append(result)
            
            return results
            
        except Exception as e:
            self.logger.error(f"Error in similarity search: {e}")
            return []
    
    def _calculate_similarity(self, vec1: Any, vec2: Any) -> float:
        """Calculate cosine similarity between two vectors"""
        try:
            import numpy as np
            
            # Convert to numpy arrays
            if not isinstance(vec1, np.ndarray):
                vec1 = np.array(vec1)
            if not isinstance(vec2, np.ndarray):
                vec2 = np.array(vec2)
            
            # Calculate cosine similarity
            dot_product = np.dot(vec1, vec2)
            norm_a = np.linalg.norm(vec1)
            norm_b = np.linalg.norm(vec2)
            
            if norm_a == 0 or norm_b == 0:
                return 0.0
            
            return dot_product / (norm_a * norm_b)
            
        except Exception as e:
            self.logger.error(f"Error calculating similarity: {e}")
            return 0.0
    
    async def get_stats(self) -> Dict[str, Any]:
        """Get RAG engine statistics"""
        try:
            base_stats = await super().get_stats()
            
            rag_stats = {
                'total_chunks': len(self.chunk_embeddings),
                'total_documents': len(self.document_chunks),
                'avg_chunks_per_document': len(self.chunk_embeddings) / len(self.document_chunks) if self.document_chunks else 0,
                'chunk_types': self._get_chunk_type_distribution(),
                'document_distribution': self._get_document_chunk_distribution()
            }
            
            return {**base_stats, **rag_stats}
            
        except Exception as e:
            self.logger.error(f"Error getting RAG stats: {e}")
            return {}
    
    def _get_chunk_type_distribution(self) -> Dict[str, int]:
        """Get distribution of chunk types"""
        distribution = {}
        for chunk_meta in self.chunk_metadata.values():
            chunk_type = chunk_meta.get('metadata', {}).get('chunk_type', 'unknown')
            distribution[chunk_type] = distribution.get(chunk_type, 0) + 1
        return distribution
    
    def _get_document_chunk_distribution(self) -> Dict[str, int]:
        """Get distribution of chunks per document"""
        distribution = {}
        for doc_id, chunk_ids in self.document_chunks.items():
            chunk_count = len(chunk_ids)
            if chunk_count <= 5:
                range_key = "1-5"
            elif chunk_count <= 10:
                range_key = "6-10"
            elif chunk_count <= 20:
                range_key = "11-20"
            elif chunk_count <= 50:
                range_key = "21-50"
            else:
                range_key = "50+"
            
            distribution[range_key] = distribution.get(range_key, 0) + 1
        
        return distribution
    
    async def delete_document_chunks(self, document_id: str) -> bool:
        """Delete all chunks for a document"""
        try:
            if document_id not in self.document_chunks:
                return True
            
            chunk_ids = self.document_chunks[document_id]
            
            # Remove from all data structures
            for chunk_id in chunk_ids:
                self.document_vectors.pop(chunk_id, None)
                self.chunk_embeddings.pop(chunk_id, None)
                self.chunk_metadata.pop(chunk_id, None)
                self.document_text_features.pop(chunk_id, None)
            
            # Remove document entry
            del self.document_chunks[document_id]
            
            # Rebuild index if necessary
            if len(self.document_vectors) > 0:
                await self._rebuild_vector_index()
            
            self.logger.info(f"Deleted {len(chunk_ids)} chunks for document {document_id}")
            return True
            
        except Exception as e:
            self.logger.error(f"Error deleting document chunks: {e}")
            return False
    
    async def update_chunk_metadata(self, chunk_id: str, 
                                  metadata: Dict[str, Any]) -> bool:
        """Update metadata for a specific chunk"""
        try:
            if chunk_id in self.chunk_metadata:
                self.chunk_metadata[chunk_id]['metadata'].update(metadata)
                return True
            return False
            
        except Exception as e:
            self.logger.error(f"Error updating chunk metadata: {e}")
            return False
