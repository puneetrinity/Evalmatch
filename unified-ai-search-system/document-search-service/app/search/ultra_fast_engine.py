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
from app.logger import get_enhanced_logger, log_performance, log_operation
from app.config import settings
from app.error_handling.exceptions import SearchEngineException, EmbeddingException, IndexBuildException, safe_execute_async
from app.monitoring.metrics import metrics
from app.indexing.incremental import IncrementalIndexManager

logger = get_enhanced_logger(__name__)

@dataclass
class SearchResult:
    doc_id: str
    similarity_score: float
    bm25_score: float
    combined_score: float
    metadata: Dict

class UltraFastSearchEngine:

    def __init__(self, embedding_dim: int, use_gpu: bool):
        try:
            self.embedding_model = SentenceTransformer(settings.embedding_model_name, device='cuda' if use_gpu else 'cpu')
            self.embedding_dim = embedding_dim
            self.index_path = settings.index_path
            self._initialize_indexes()
            self.load_indexes()
            
            # Initialize incremental update manager
            self.incremental_manager = IncrementalIndexManager(self)
            
            logger.info("UltraFastSearchEngine initialized successfully", extra_fields={
                'embedding_dim': embedding_dim,
                'use_gpu': use_gpu,
                'model_name': settings.embedding_model_name
            })
            
        except Exception as e:
            logger.error("Failed to initialize search engine", extra_fields={'error': str(e)})
            raise IndexBuildException(f"Search engine initialization failed: {str(e)}", cause=e)

    def _initialize_indexes(self):
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
                # FAISS provides specific methods to save ProductQuantizer
                pq_data = {
                    'dimension': self.pq_quantizer.dimension,
                    'num_subspaces': self.pq_quantizer.num_subspaces,
                    'bits_per_subspace': self.pq_quantizer.bits_per_subspace,
                    'trained': self.pq_quantizer.trained
                }
                # Save PQ training data (centroids)
                if self.pq_quantizer.trained:
                    pq_data['centroids'] = faiss.vector_to_array(self.pq_quantizer.pq.centroids).copy()
                    
                with open(os.path.join(self.index_path, "pq_quantizer.pkl"), "wb") as f:
                    pickle.dump(pq_data, f)
            
            # Save all other data that doesn't contain FAISS objects
            # Be very explicit about what we're saving to avoid any FAISS references
            other_data = {
                "lsh_index": self.lsh_index,  # LSH index shouldn't contain FAISS objects
                "document_vectors": self.document_vectors.tolist() if hasattr(self.document_vectors, 'tolist') else self.document_vectors,
                "document_codes": self.document_codes.tolist() if hasattr(self.document_codes, 'tolist') else self.document_codes,
                "document_metadata": dict(self.document_metadata) if hasattr(self.document_metadata, 'items') else self.document_metadata,
                "document_text_features": dict(self.document_text_features) if hasattr(self.document_text_features, 'items') else self.document_text_features,
                "bm25_index": dict(self.bm25_index) if hasattr(self.bm25_index, 'items') else self.bm25_index,
                "doc_frequencies": dict(self.doc_frequencies) if hasattr(self.doc_frequencies, 'items') else self.doc_frequencies,
                "corpus_size": int(self.corpus_size) if hasattr(self.corpus_size, '__int__') else self.corpus_size,
                "avg_doc_length": float(self.avg_doc_length) if hasattr(self.avg_doc_length, '__float__') else self.avg_doc_length,
                "doc_ids": list(self.hnsw_index.doc_ids) if hasattr(self.hnsw_index.doc_ids, '__iter__') else self.hnsw_index.doc_ids
            }
            
            with open(os.path.join(self.index_path, "other_data.pkl"), "wb") as f:
                pickle.dump(other_data, f)
                
            logger.info("Successfully saved all indexes")
            
        except Exception as e:
            logger.error(f"Failed to save indexes: {str(e)}")
            raise IndexBuildException(f"Index saving failed: {str(e)}", cause=e)

    def load_indexes(self):
        """Load indexes with proper FAISS deserialization handling."""
        if not os.path.exists(os.path.join(self.index_path, "hnsw.index")):
            logger.info("No existing indexes found. Ready for building.")
            return
            
        try:
            logger.info(f"Loading indexes from {self.index_path}")
            
            # Load FAISS HNSW index
            self.hnsw_index.index = faiss.read_index(os.path.join(self.index_path, "hnsw.index"))
            
            # Load other data and convert back to appropriate types
            with open(os.path.join(self.index_path, "other_data.pkl"), "rb") as f:
                data = pickle.load(f)
                self.lsh_index = data["lsh_index"]
                self.document_vectors = np.array(data["document_vectors"]) if isinstance(data["document_vectors"], list) else data["document_vectors"]
                self.document_codes = np.array(data["document_codes"]) if isinstance(data["document_codes"], list) else data["document_codes"]
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
                
                # Reconstruct ProductQuantizer
                from app.math.product_quantization import ProductQuantizer
                self.pq_quantizer = ProductQuantizer(
                    pq_data['dimension'],
                    pq_data['num_subspaces'], 
                    pq_data['bits_per_subspace']
                )
                
                # Restore training state and centroids if available
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
                # If no PQ data exists, create a fresh quantizer
                self.pq_quantizer = None
                
            logger.info("Successfully loaded all indexes")
            
        except Exception as e:
            logger.error(f"Failed to load indexes: {str(e)}")
            # Don't raise exception - allow system to continue without pre-built indexes
            logger.info("Continuing without pre-built indexes. Ready for building.")

    @log_performance("build_indexes")
    async def build_indexes(self, documents: List[Dict]):
        """Build search indexes with comprehensive error handling and monitoring."""
        logger.info(f"Building ultra-fast indexes for {len(documents)} documents...")
        
        with log_operation(logger, "index_building", document_count=len(documents)):
            try:
                start_time = time.time()
                self._initialize_indexes()

                # Generate embeddings with error handling
                texts_to_embed = [self._get_document_text(doc) for doc in documents]
                
                try:
                    # Run synchronously - embedding model encode is not async
                    vectors = self.embedding_model.encode(texts_to_embed, show_progress_bar=True, convert_to_numpy=True)
                except Exception as e:
                    raise EmbeddingException(f"Failed to generate embeddings: {str(e)}", cause=e)

                doc_ids = [doc['id'] for doc in documents]

                # Process documents with validation
                valid_docs_processed = 0
                for i, doc in enumerate(documents):
                    try:
                        doc_id = doc['id']
                        text_features = self._extract_text_features(doc)
                        self.document_text_features[doc_id] = text_features
                        self.document_vectors[doc_id] = vectors[i]
                        self.document_metadata[doc_id] = {
                            'name': doc.get('name', ''),
                            'experience_years': doc.get('experience_years', 0),
                            'skills': doc.get('skills', []),
                            'seniority_level': doc.get('seniority_level', 'unknown')
                        }
                        valid_docs_processed += 1
                        
                    except Exception as e:
                        logger.warning(f"Failed to process document {doc.get('id', 'unknown')}: {str(e)}")

                # Build indexes concurrently with error handling
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
                
                # Record metrics
                build_time = time.time() - start_time
                metrics.set_gauge('index_build_time_seconds', build_time)
                metrics.set_gauge('indexed_documents_count', valid_docs_processed)
                metrics.increment_counter('index_builds_total')
                
                logger.info(f"Index building completed in {build_time:.2f} seconds", extra_fields={
                    'documents_processed': valid_docs_processed,
                    'build_time_seconds': build_time
                })
                
            except Exception as e:
                metrics.increment_counter('index_build_errors_total')
                raise IndexBuildException(f"Index building failed: {str(e)}", cause=e)

    @log_performance("search")
    async def search(self, query: str, num_results: int = 10, filters: Optional[Dict] = None) -> List[SearchResult]:
        """Enhanced search with comprehensive error handling and monitoring."""
        search_start = time.time()
        
        try:
            # Validate inputs
            if not query or not query.strip():
                raise SearchEngineException("Query cannot be empty")
            
            if num_results <= 0 or num_results > 1000:
                raise SearchEngineException("num_results must be between 1 and 1000")

            cache_key = f"{query}:{num_results}:{str(filters)}"
            if cache_key in self.query_cache:
                self.search_stats['cache_hits'] += 1
                metrics.increment_counter('search_cache_hits_total')
                return self.query_cache[cache_key]

            # Generate query embeddings with error handling
            try:
                # Run synchronously - embedding model encode is not async
                query_vector = self.embedding_model.encode([query], convert_to_numpy=True)
            except Exception as e:
                raise EmbeddingException(f"Failed to generate query embedding: {str(e)}", query, e)

            query_features = self._extract_query_features(query)

            # Candidate retrieval with error handling
            try:
                lsh_candidates = self.lsh_index.query_candidates(query_features, num_candidates=200)
                hnsw_results = self.hnsw_index.search(query_vector, k=100)
                hnsw_candidates = [doc_id for doc_id, _ in hnsw_results]
                
                all_candidates = list(set(lsh_candidates + hnsw_candidates))
                
                # Record candidate retrieval metrics
                metrics.record_histogram('lsh_candidates_count', len(lsh_candidates))
                metrics.record_histogram('hnsw_candidates_count', len(hnsw_candidates))
                metrics.record_histogram('total_candidates_count', len(all_candidates))
                
            except Exception as e:
                raise SearchEngineException(f"Candidate retrieval failed: {str(e)}", query, e)

            # Apply filters with validation
            if filters:
                try:
                    all_candidates = self._apply_filters(all_candidates, filters)
                    metrics.record_histogram('filtered_candidates_count', len(all_candidates))
                except Exception as e:
                    logger.warning(f"Filter application failed: {str(e)}", extra_fields={'filters': filters})
                    # Continue without filters rather than failing

            # Score candidates
            try:
                scored_results = await self._score_candidates(all_candidates, query, query_vector[0], query_features)
            except Exception as e:
                raise SearchEngineException(f"Candidate scoring failed: {str(e)}", query, e)

            scored_results.sort(key=lambda x: x.combined_score, reverse=True)
            final_results = scored_results[:num_results]

            # Update cache
            if len(self.query_cache) >= self.cache_max_size:
                self.query_cache.pop(next(iter(self.query_cache)))
            self.query_cache[cache_key] = final_results

            # Update statistics and metrics
            response_time = (time.time() - search_start) * 1000
            self.search_stats['total_searches'] += 1
            self.search_stats['avg_response_time'] = (
                self.search_stats['avg_response_time'] * (self.search_stats['total_searches'] - 1) + response_time
            ) / self.search_stats['total_searches']

            metrics.record_histogram('search_response_time_ms', response_time)
            metrics.increment_counter('search_queries_total')

            logger.info(f"Search completed successfully", extra_fields={
                'response_time_ms': response_time,
                'results_count': len(final_results),
                'candidates_count': len(all_candidates),
                'query_length': len(query)
            })
            
            return final_results
            
        except SearchEngineException:
            # Re-raise our specific exceptions
            raise
        except Exception as e:
            # Wrap unexpected exceptions
            raise SearchEngineException(f"Unexpected search error: {str(e)}", query, e)

    async def _score_candidates(self, candidates: List[str], query: str, query_vector: np.ndarray, query_features: List[str]) -> List[SearchResult]:
        tasks = [self._score_single_candidate(candidate, query, query_vector, query_features) for candidate in candidates]
        results = await asyncio.gather(*tasks)
        return [r for r in results if r is not None]

    async def _score_single_candidate(self, doc_id: str, query: str, query_vector: np.ndarray, query_features: List[str]) -> Optional[SearchResult]:
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
        return 1.0 - np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2))

    async def _build_lsh_index(self, documents: List[Dict], text_features_list: List[List[str]]):
        logger.info("Building LSH index...")
        for doc, features in zip(documents, text_features_list):
            self.lsh_index.add_document(doc['id'], features)

    async def _build_hnsw_index(self, doc_ids: List[str], vectors: np.ndarray):
        logger.info("Building HNSW index...")
        self.hnsw_index.add_documents(vectors, doc_ids)

    async def _build_pq_index(self, vectors: np.ndarray):
        logger.info("Building PQ index...")
        self.pq_quantizer.train(vectors)
        for doc_id, vector in self.document_vectors.items():
            self.document_codes[doc_id] = self.pq_quantizer.encode(vector.reshape(1, -1))[0]

    async def _build_bm25_index(self, documents: List[Dict]):
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
        self.avg_doc_length = total_length / self.corpus_size

    def _compute_bm25_score(self, doc_id: str, query: str) -> float:
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
        features = []
        if 'skills' in doc: features.extend([s.lower() for s in doc['skills']])
        if 'technologies' in doc: features.extend([t.lower() for t in doc['technologies']])
        text = self._get_document_text(doc).lower()
        features.extend(text.split())
        return list(set(features))

    def _extract_query_features(self, query: str) -> List[str]:
        return list(set(query.lower().split()))

    def _get_document_text(self, doc: Dict) -> str:
        text_parts = []
        for field in ['name', 'title', 'description', 'experience', 'projects']:
            if field in doc:
                text_parts.append(str(doc[field]))
        if 'skills' in doc: text_parts.extend(doc['skills'])
        if 'technologies' in doc: text_parts.extend(doc['technologies'])
        return ' '.join(text_parts)

    def _apply_filters(self, candidates: List[str], filters: Dict) -> List[str]:
        filtered = []
        for doc_id in candidates:
            if doc_id not in self.document_metadata: continue
            doc_meta = self.document_metadata[doc_id]
            if 'min_experience' in filters and doc_meta['experience_years'] < filters['min_experience']: continue
            if 'seniority_levels' in filters and doc_meta['seniority_level'] not in filters['seniority_levels']: continue
            if 'required_skills' in filters and not set(s.lower() for s in filters['required_skills']).issubset(set(s.lower() for s in doc_meta['skills'])): continue
            filtered.append(doc_id)
        return filtered

    def get_performance_stats(self) -> Dict:
        cache_hit_rate = self.search_stats['cache_hits'] / self.search_stats['total_searches'] if self.search_stats['total_searches'] > 0 else 0
        return {
            'total_searches': self.search_stats['total_searches'],
            'avg_response_time_ms': self.search_stats['avg_response_time'],
            'cache_hit_rate': cache_hit_rate
        }