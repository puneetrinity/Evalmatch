import numpy as np
import time
import os
import pickle
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass
import asyncio
from sentence_transformers import SentenceTransformer
import faiss

from app.math.lsh_index import LSHIndex
from app.math.hnsw_index import HNSWIndex
from app.math.product_quantization import ProductQuantizer
from app.core.logging import get_logger
from app.core.config import get_settings

logger = get_logger(__name__)
settings = get_settings()

@dataclass
class SearchResult:
    doc_id: str
    similarity_score: float
    bm25_score: float
    combined_score: float
    metadata: Dict

class UltraFastSearchEngine:
    """
    Native ultra-fast search engine integrated into reimagined-octo-bassoon.
    Provides FAISS, HNSW, LSH, and BM25 search capabilities.
    """

    def __init__(self, embedding_dim: int = 384, use_gpu: bool = False):
        try:
            self.embedding_model = SentenceTransformer(
                settings.EMBEDDING_MODEL_NAME or 'all-MiniLM-L6-v2', 
                device='cuda' if use_gpu else 'cpu'
            )
            self.embedding_dim = embedding_dim
            self.index_path = settings.INDEX_PATH or "indexes"
            self._initialize_indexes()
            self.load_indexes()
            
            logger.info("UltraFastSearchEngine initialized successfully", extra={
                'embedding_dim': embedding_dim,
                'use_gpu': use_gpu,
                'model_name': settings.EMBEDDING_MODEL_NAME or 'all-MiniLM-L6-v2'
            })
            
        except Exception as e:
            logger.error(f"Failed to initialize search engine: {str(e)}")
            raise

    def _initialize_indexes(self):
        """Initialize all search indexes"""
        self.lsh_index = LSHIndex(num_hashes=128, num_bands=16)
        self.hnsw_index = HNSWIndex(dimension=self.embedding_dim)
        self.pq_quantizer = ProductQuantizer(dimension=self.embedding_dim)
        self.document_vectors = {}
        self.document_codes = {}
        self.document_metadata = {}
        self.document_text_features = {}
        self.bm25_index = {}
        self.doc_frequencies = {}
        self.corpus_size = 0
        self.avg_doc_length = 0
        self.search_stats = {'total_searches': 0, 'avg_response_time': 0, 'cache_hits': 0}
        self.query_cache = {}
        self.cache_max_size = 1000

    def save_indexes(self):
        """Save indexes with proper FAISS serialization handling."""
        logger.info(f"Saving indexes to {self.index_path}")
        os.makedirs(self.index_path, exist_ok=True)
        
        try:
            # Save FAISS HNSW index directly using FAISS writer
            faiss.write_index(self.hnsw_index.index, os.path.join(self.index_path, "hnsw.index"))
            
            # Save FAISS ProductQuantizer separately
            if hasattr(self, 'pq_quantizer') and self.pq_quantizer and self.pq_quantizer.trained:
                pq_data = {
                    'dimension': self.pq_quantizer.dimension,
                    'num_subspaces': self.pq_quantizer.num_subspaces,
                    'bits_per_subspace': self.pq_quantizer.bits_per_subspace,
                    'trained': self.pq_quantizer.trained
                }
                if self.pq_quantizer.trained:
                    pq_data['centroids'] = faiss.vector_to_array(self.pq_quantizer.pq.centroids).copy()
                    
                with open(os.path.join(self.index_path, "pq_quantizer.pkl"), "wb") as f:
                    pickle.dump(pq_data, f)
            
            # Save all other data that doesn't contain FAISS objects
            other_data = {
                "lsh_index": self.lsh_index,
                "document_vectors": self.document_vectors,
                "document_codes": self.document_codes,
                "document_metadata": self.document_metadata,
                "document_text_features": self.document_text_features,
                "bm25_index": self.bm25_index,
                "doc_frequencies": self.doc_frequencies,
                "corpus_size": self.corpus_size,
                "avg_doc_length": self.avg_doc_length,
                "doc_ids": self.hnsw_index.doc_ids
            }
            
            with open(os.path.join(self.index_path, "other_data.pkl"), "wb") as f:
                pickle.dump(other_data, f)
                
            logger.info("Successfully saved all indexes")
            
        except Exception as e:
            logger.error(f"Failed to save indexes: {str(e)}")
            raise

    def load_indexes(self):
        """Load indexes with proper FAISS deserialization handling."""
        if not os.path.exists(os.path.join(self.index_path, "hnsw.index")):
            logger.info("No existing indexes found. Ready for building.")
            return
            
        try:
            logger.info(f"Loading indexes from {self.index_path}")
            
            # Load FAISS HNSW index
            self.hnsw_index.index = faiss.read_index(os.path.join(self.index_path, "hnsw.index"))
            
            # Load other data
            with open(os.path.join(self.index_path, "other_data.pkl"), "rb") as f:
                data = pickle.load(f)
                self.lsh_index = data["lsh_index"]
                self.document_vectors = data["document_vectors"]
                self.document_codes = data["document_codes"]
                self.document_metadata = data["document_metadata"]
                self.document_text_features = data["document_text_features"]
                self.bm25_index = data["bm25_index"]
                self.doc_frequencies = data["doc_frequencies"]
                self.corpus_size = data["corpus_size"]
                self.avg_doc_length = data["avg_doc_length"]
                self.hnsw_index.doc_ids = data["doc_ids"]
            
            # Load ProductQuantizer if it exists
            pq_path = os.path.join(self.index_path, "pq_quantizer.pkl")
            if os.path.exists(pq_path):
                with open(pq_path, "rb") as f:
                    pq_data = pickle.load(f)
                
                self.pq_quantizer = ProductQuantizer(
                    pq_data['dimension'],
                    pq_data['num_subspaces'], 
                    pq_data['bits_per_subspace']
                )
                
                if pq_data.get('trained', False) and 'centroids' in pq_data:
                    # Create a dummy training set to initialize the structure
                    dummy_vectors = np.random.randn(10, pq_data['dimension']).astype(np.float32)
                    self.pq_quantizer.train(dummy_vectors)
                    
                    # Replace the centroids with the saved ones
                    centroids_vector = faiss.FloatVector()
                    centroids_vector.resize(len(pq_data['centroids']))
                    for i, val in enumerate(pq_data['centroids']):
                        centroids_vector[i] = val
                    self.pq_quantizer.pq.centroids.swap(centroids_vector)
                    self.pq_quantizer.trained = True
            else:
                self.pq_quantizer = None
                
            logger.info("Successfully loaded all indexes")
            
        except Exception as e:
            logger.error(f"Failed to load indexes: {str(e)}")
            logger.info("Continuing without pre-built indexes. Ready for building.")

    async def build_indexes(self, documents: List[Dict]):
        """Build search indexes with comprehensive error handling and monitoring."""
        logger.info(f"Building ultra-fast indexes for {len(documents)} documents...")
        
        try:
            start_time = time.time()
            self._initialize_indexes()

            # Generate embeddings
            texts_to_embed = [self._get_document_text(doc) for doc in documents]
            vectors = self.embedding_model.encode(texts_to_embed, show_progress_bar=True, convert_to_numpy=True)
            doc_ids = [doc['id'] for doc in documents]

            # Process documents
            valid_docs_processed = 0
            for i, doc in enumerate(documents):
                try:
                    doc_id = doc['id']
                    text_features = self._extract_text_features(doc)
                    self.document_text_features[doc_id] = text_features
                    self.document_vectors[doc_id] = vectors[i]
                    self.document_metadata[doc_id] = {
                        'name': doc.get('name', ''),
                        'title': doc.get('title', ''),
                        'experience_years': doc.get('experience_years', 0),
                        'skills': doc.get('skills', []),
                        'seniority_level': doc.get('seniority_level', 'unknown'),
                        'content': doc.get('content', ''),
                        'metadata': doc.get('metadata', {})
                    }
                    valid_docs_processed += 1
                    
                except Exception as e:
                    logger.warning(f"Failed to process document {doc.get('id', 'unknown')}: {str(e)}")

            # Build indexes concurrently
            build_tasks = [
                self._build_lsh_index(documents, [self.document_text_features[did] for did in doc_ids if did in self.document_text_features]),
                self._build_hnsw_index([did for did in doc_ids if did in self.document_vectors], 
                                     np.array([self.document_vectors[did] for did in doc_ids if did in self.document_vectors])),
                self._build_pq_index(np.array([self.document_vectors[did] for did in doc_ids if did in self.document_vectors])),
                self._build_bm25_index(documents)
            ]
            
            await asyncio.gather(*build_tasks, return_exceptions=True)
            
            # Save indexes
            self.save_indexes()
            
            build_time = time.time() - start_time
            logger.info(f"Index building completed in {build_time:.2f} seconds", extra={
                'documents_processed': valid_docs_processed,
                'build_time_seconds': build_time
            })
            
        except Exception as e:
            logger.error(f"Index building failed: {str(e)}")
            raise

    async def search(self, query: str, num_results: int = 10, filters: Optional[Dict] = None) -> List[SearchResult]:
        """Enhanced search with comprehensive error handling and monitoring."""
        search_start = time.time()
        
        try:
            # Validate inputs
            if not query or not query.strip():
                raise ValueError("Query cannot be empty")
            
            if num_results <= 0 or num_results > 1000:
                raise ValueError("num_results must be between 1 and 1000")

            cache_key = f"{query}:{num_results}:{str(filters)}"
            if cache_key in self.query_cache:
                self.search_stats['cache_hits'] += 1
                return self.query_cache[cache_key]

            # Generate query embeddings
            query_vector = self.embedding_model.encode([query], convert_to_numpy=True)
            query_features = self._extract_query_features(query)

            # Candidate retrieval
            lsh_candidates = self.lsh_index.query_candidates(query_features, num_candidates=200)
            hnsw_results = self.hnsw_index.search(query_vector, k=100)
            hnsw_candidates = [doc_id for doc_id, _ in hnsw_results]
            
            all_candidates = list(set(lsh_candidates + hnsw_candidates))

            # Apply filters
            if filters:
                all_candidates = self._apply_filters(all_candidates, filters)

            # Score candidates
            scored_results = await self._score_candidates(all_candidates, query, query_vector[0], query_features)
            scored_results.sort(key=lambda x: x.combined_score, reverse=True)
            final_results = scored_results[:num_results]

            # Update cache
            if len(self.query_cache) >= self.cache_max_size:
                self.query_cache.pop(next(iter(self.query_cache)))
            self.query_cache[cache_key] = final_results

            # Update statistics
            response_time = (time.time() - search_start) * 1000
            self.search_stats['total_searches'] += 1
            self.search_stats['avg_response_time'] = (
                self.search_stats['avg_response_time'] * (self.search_stats['total_searches'] - 1) + response_time
            ) / self.search_stats['total_searches']

            logger.info(f"Search completed successfully", extra={
                'response_time_ms': response_time,
                'results_count': len(final_results),
                'candidates_count': len(all_candidates),
                'query_length': len(query)
            })
            
            return final_results
            
        except Exception as e:
            logger.error(f"Search failed: {str(e)}")
            raise

    async def _score_candidates(self, candidates: List[str], query: str, query_vector: np.ndarray, query_features: List[str]) -> List[SearchResult]:
        """Score candidates using multiple similarity metrics"""
        tasks = [self._score_single_candidate(candidate, query, query_vector, query_features) for candidate in candidates]
        results = await asyncio.gather(*tasks)
        return [r for r in results if r is not None]

    async def _score_single_candidate(self, doc_id: str, query: str, query_vector: np.ndarray, query_features: List[str]) -> Optional[SearchResult]:
        """Score a single candidate document"""
        if doc_id not in self.document_vectors:
            return None

        doc_vector = self.document_vectors[doc_id]
        vector_similarity = 1 - self._cosine_distance(query_vector, doc_vector)
        jaccard_similarity = self.lsh_index.jaccard_similarity(doc_id, query_features)
        bm25_score = self._compute_bm25_score(doc_id, query)

        combined_score = (0.4 * vector_similarity + 0.3 * jaccard_similarity + 0.3 * bm25_score)

        return SearchResult(
            doc_id=doc_id,
            similarity_score=vector_similarity,
            bm25_score=bm25_score,
            combined_score=combined_score,
            metadata=self.document_metadata.get(doc_id, {})
        )

    def _cosine_distance(self, v1: np.ndarray, v2: np.ndarray) -> float:
        """Calculate cosine distance between two vectors"""
        return 1.0 - np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2))

    async def _build_lsh_index(self, documents: List[Dict], text_features_list: List[List[str]]):
        """Build LSH index for text features"""
        logger.info("Building LSH index...")
        for doc, features in zip(documents, text_features_list):
            self.lsh_index.add_document(doc['id'], features)

    async def _build_hnsw_index(self, doc_ids: List[str], vectors: np.ndarray):
        """Build HNSW index for vector similarity search"""
        logger.info("Building HNSW index...")
        self.hnsw_index.add_documents(vectors, doc_ids)

    async def _build_pq_index(self, vectors: np.ndarray):
        """Build product quantization index"""
        logger.info("Building PQ index...")
        self.pq_quantizer.train(vectors)
        for doc_id, vector in self.document_vectors.items():
            self.document_codes[doc_id] = self.pq_quantizer.encode(vector.reshape(1, -1))[0]

    async def _build_bm25_index(self, documents: List[Dict]):
        """Build BM25 index for text retrieval"""
        logger.info("Building BM25 index...")
        total_length = 0
        for doc in documents:
            doc_id = doc['id']
            text = self._get_document_text(doc)
            tokens = text.lower().split()
            total_length += len(tokens)
            tf = {token: tokens.count(token) for token in set(tokens)}
            for token in set(tokens):
                self.doc_frequencies[token] = self.doc_frequencies.get(token, 0) + 1
            self.bm25_index[doc_id] = {'tf': tf, 'length': len(tokens)}
        self.corpus_size = len(documents)
        self.avg_doc_length = total_length / self.corpus_size if self.corpus_size > 0 else 0

    def _compute_bm25_score(self, doc_id: str, query: str) -> float:
        """Compute BM25 relevance score"""
        if doc_id not in self.bm25_index:
            return 0.0
        k1 = 1.5
        b = 0.75
        doc_data = self.bm25_index[doc_id]
        doc_tf = doc_data['tf']
        doc_length = doc_data['length']
        query_terms = query.lower().split()
        score = 0.0
        for term in query_terms:
            if term in doc_tf:
                tf = doc_tf[term]
                df = self.doc_frequencies.get(term, 0)
                idf = np.log((self.corpus_size - df + 0.5) / (df + 0.5) + 1)
                score += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * doc_length / self.avg_doc_length))
        return score

    def _extract_text_features(self, doc: Dict) -> List[str]:
        """Extract text features from document"""
        features = []
        if 'skills' in doc: features.extend([s.lower() for s in doc['skills']])
        if 'technologies' in doc: features.extend([t.lower() for t in doc['technologies']])
        text = self._get_document_text(doc).lower()
        features.extend(text.split())
        return list(set(features))

    def _extract_query_features(self, query: str) -> List[str]:
        """Extract features from query"""
        return list(set(query.lower().split()))

    def _get_document_text(self, doc: Dict) -> str:
        """Get text content from document"""
        text_parts = []
        for field in ['name', 'title', 'description', 'content', 'experience', 'projects']:
            if field in doc:
                text_parts.append(str(doc[field]))
        if 'skills' in doc: text_parts.extend(doc['skills'])
        if 'technologies' in doc: text_parts.extend(doc['technologies'])
        return ' '.join(text_parts)

    def _apply_filters(self, candidates: List[str], filters: Dict) -> List[str]:
        """Apply filters to candidate documents"""
        filtered = []
        for doc_id in candidates:
            if doc_id not in self.document_metadata: continue
            doc_meta = self.document_metadata[doc_id]
            if 'min_experience' in filters and doc_meta.get('experience_years', 0) < filters['min_experience']: continue
            if 'seniority_levels' in filters and doc_meta.get('seniority_level') not in filters['seniority_levels']: continue
            if 'required_skills' in filters and not set(s.lower() for s in filters['required_skills']).issubset(set(s.lower() for s in doc_meta.get('skills', []))): continue
            filtered.append(doc_id)
        return filtered

    def get_performance_stats(self) -> Dict:
        """Get performance statistics"""
        cache_hit_rate = self.search_stats['cache_hits'] / self.search_stats['total_searches'] if self.search_stats['total_searches'] > 0 else 0
        return {
            'total_searches': self.search_stats['total_searches'],
            'avg_response_time_ms': self.search_stats['avg_response_time'],
            'cache_hit_rate': cache_hit_rate,
            'total_documents': len(self.document_metadata),
            'index_size': len(self.hnsw_index) if hasattr(self.hnsw_index, '__len__') else 0
        }

    # Additional methods for document management
    async def add_document(self, doc_id: str, document: Dict):
        """Add a single document to the index"""
        try:
            text = self._get_document_text(document)
            vector = self.embedding_model.encode([text], convert_to_numpy=True)[0]
            
            # Add to all indexes
            text_features = self._extract_text_features(document)
            self.document_text_features[doc_id] = text_features
            self.document_vectors[doc_id] = vector
            self.document_metadata[doc_id] = document
            
            # Add to LSH index
            self.lsh_index.add_document(doc_id, text_features)
            
            # Add to HNSW index
            self.hnsw_index.add_documents(vector.reshape(1, -1), [doc_id])
            
            # Update BM25 index
            tokens = text.lower().split()
            tf = {token: tokens.count(token) for token in set(tokens)}
            for token in set(tokens):
                self.doc_frequencies[token] = self.doc_frequencies.get(token, 0) + 1
            self.bm25_index[doc_id] = {'tf': tf, 'length': len(tokens)}
            
            # Update corpus statistics
            self.corpus_size = len(self.document_metadata)
            total_length = sum(doc['length'] for doc in self.bm25_index.values())
            self.avg_doc_length = total_length / self.corpus_size if self.corpus_size > 0 else 0
            
            logger.info(f"Document {doc_id} added successfully")
            
        except Exception as e:
            logger.error(f"Failed to add document {doc_id}: {str(e)}")
            raise

    async def remove_document(self, doc_id: str):
        """Remove a document from the index"""
        try:
            if doc_id in self.document_metadata:
                del self.document_metadata[doc_id]
            if doc_id in self.document_vectors:
                del self.document_vectors[doc_id]
            if doc_id in self.document_text_features:
                del self.document_text_features[doc_id]
            if doc_id in self.document_codes:
                del self.document_codes[doc_id]
            if doc_id in self.bm25_index:
                del self.bm25_index[doc_id]
                
            # Note: HNSW and LSH indexes don't support efficient removal
            # In production, you'd need to rebuild these indexes periodically
            
            logger.info(f"Document {doc_id} removed successfully")
            
        except Exception as e:
            logger.error(f"Failed to remove document {doc_id}: {str(e)}")
            raise