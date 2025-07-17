
import numpy as np
import faiss
from typing import Tuple

class ProductQuantizer:
    """
    Product Quantization implementation using Faiss.
    Achieves significant memory reduction for large-scale vector data.
    """

    def __init__(self,
                 dimension: int,
                 num_subspaces: int = 16,
                 bits_per_subspace: int = 8):
        """
        Initializes the Faiss Product Quantizer.
        - dimension: The dimensionality of the vectors.
        - num_subspaces (m): Number of vector partitions.
        - bits_per_subspace: Codebook size = 2^bits.
        """
        self.dimension = dimension
        self.num_subspaces = num_subspaces
        self.bits_per_subspace = bits_per_subspace
        self.pq = faiss.ProductQuantizer(dimension, num_subspaces, bits_per_subspace)
        self.trained = False

    def train(self, vectors: np.ndarray):
        """
        Train the codebooks using K-means clustering on the input vectors.
        """
        if vectors.shape[1] != self.dimension:
            raise ValueError(f"Input vector dimension {vectors.shape[1]} does not match quantizer dimension {self.dimension}")
        
        print(f"Training Product Quantizer with {vectors.shape[0]} vectors...")
        self.pq.train(vectors)
        self.trained = True
        print("PQ training completed.")

    def encode(self, vectors: np.ndarray) -> np.ndarray:
        """
        Encode vectors into quantized codes.
        """
        if not self.trained:
            raise ValueError("ProductQuantizer must be trained first.")
        
        return self.pq.compute_codes(vectors)

    def decode(self, codes: np.ndarray) -> np.ndarray:
        """
        Decode quantized codes back to approximate vectors.
        """
        if not self.trained:
            raise ValueError("ProductQuantizer must be trained first.")
        
        return self.pq.decode(codes)

    def compute_distances(self, query_vector: np.ndarray, codes: np.ndarray) -> np.ndarray:
        """
        Compute distances between a query vector and a set of encoded vectors.
        """
        if not self.trained:
            raise ValueError("ProductQuantizer must be trained first.")

        if query_vector.ndim == 1:
            query_vector = np.expand_dims(query_vector, axis=0)

        # The pq.compute_distances method is what we need here.
        # It computes distances from the query to all centroids, then sums them up.
        return self.pq.compute_distances(query_vector, codes).flatten()
