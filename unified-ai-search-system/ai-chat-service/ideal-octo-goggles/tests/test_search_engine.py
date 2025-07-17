
import pytest
import numpy as np
from app.search.ultra_fast_engine import UltraFastSearchEngine

@pytest.fixture(scope="module")
def search_engine():
    return UltraFastSearchEngine(embedding_dim=384, use_gpu=False)

def test_cosine_distance(search_engine: UltraFastSearchEngine):
    v1 = np.array([1, 0, 0])
    v2 = np.array([0, 1, 0])
    assert np.isclose(search_engine._cosine_distance(v1, v2), 1.0)

    v3 = np.array([1, 1, 1])
    v4 = np.array([1, 1, 1])
    assert np.isclose(search_engine._cosine_distance(v3, v4), 0.0)

def test_bm25_score(search_engine: UltraFastSearchEngine):
    search_engine.corpus_size = 1
    search_engine.avg_doc_length = 10
    search_engine.doc_frequencies = {"test": 1}
    search_engine.bm25_index = {
        "doc1": {
            "tf": {"test": 2},
            "length": 10
        }
    }
    score = search_engine._compute_bm25_score("doc1", "test")
    assert score > 0
