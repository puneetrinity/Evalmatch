
import numpy as np
import faiss
from typing import List, Tuple

class HNSWIndex:
    """
    Hierarchical Navigable Small World implementation using Faiss.
    Guarantees O(log n) search complexity and is highly optimized.
    """

    def __init__(self,
                 dimension: int,
                 max_connections: int = 32,
                 ef_construction: int = 200,
                 ef_search: int = 50):
        """
        Initializes the Faiss HNSW index.
        - dimension: The dimensionality of the vectors.
        - max_connections (M): Max connections per node.
        - ef_construction: Construction-time beam search width.
        - ef_search: Search-time beam search width.
        """
        self.dimension = dimension
        self.index = faiss.IndexHNSWFlat(dimension, max_connections, faiss.METRIC_L2)
        self.index.hnsw.efConstruction = ef_construction
        self.index.hnsw.efSearch = ef_search
        self.doc_ids = []

    def add_documents(self, vectors: np.ndarray, doc_ids: List[str]):
        """Add a batch of documents to the index."""
        if vectors.shape[1] != self.dimension:
            raise ValueError(f"Input vector dimension {vectors.shape[1]} does not match index dimension {self.dimension}")
        
        normalized_vectors = vectors / np.linalg.norm(vectors, axis=1, keepdims=True)
        self.index.add(normalized_vectors)
        self.doc_ids.extend(doc_ids)

    def search(self, query_vector: np.ndarray, k: int = 10) -> List[Tuple[str, float]]:
        """
        Search for the k-nearest neighbors to the query vector.
        Returns a list of (doc_id, distance) tuples.
        """
        if query_vector.ndim == 1:
            query_vector = np.expand_dims(query_vector, axis=0)

        if query_vector.shape[1] != self.dimension:
            raise ValueError(f"Query vector dimension {query_vector.shape[1]} does not match index dimension {self.dimension}")

        normalized_query = query_vector / np.linalg.norm(query_vector, axis=1, keepdims=True)
        distances, indices = self.index.search(normalized_query, k)

        results = []
        for i in range(indices.shape[1]):
            if indices[0, i] != -1:
                doc_id = self.doc_ids[indices[0, i]]
                dist = distances[0, i]
                results.append((doc_id, dist))
        
        return results

    def __len__(self):
        return self.index.ntotal
