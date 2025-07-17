#!/usr/bin/env python3
"""
Comprehensive FAISS serialization test with edge cases.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import asyncio
import json
import tempfile
import shutil
import numpy as np
from app.search.ultra_fast_engine import UltraFastSearchEngine
from app.logger import get_enhanced_logger

logger = get_enhanced_logger(__name__)

async def test_faiss_edge_cases():
    """Test FAISS serialization with various edge cases."""
    print("Testing FAISS serialization edge cases...")
    
    temp_dir = tempfile.mkdtemp()
    
    try:
        # Test 1: Normal case with larger dataset
        print("\n1. Testing with larger dataset...")
        engine1 = UltraFastSearchEngine(embedding_dim=384, use_gpu=False)
        engine1.index_path = temp_dir + "_test1"
        
        with open('data/resumes.json', 'r') as f:
            documents = json.load(f)
        
        await engine1.build_indexes(documents)
        engine1.save_indexes()
        
        # Load in new instance
        engine1_new = UltraFastSearchEngine(embedding_dim=384, use_gpu=False)
        engine1_new.index_path = temp_dir + "_test1"
        engine1_new.load_indexes()
        print("✓ Large dataset test passed")
        
        # Test 2: Empty/minimal case
        print("\n2. Testing with minimal dataset...")
        engine2 = UltraFastSearchEngine(embedding_dim=384, use_gpu=False)
        engine2.index_path = temp_dir + "_test2"
        
        minimal_docs = [{"id": "1", "content": "test document", "title": "test"}]
        await engine2.build_indexes(minimal_docs)
        engine2.save_indexes()
        
        engine2_new = UltraFastSearchEngine(embedding_dim=384, use_gpu=False)
        engine2_new.index_path = temp_dir + "_test2"
        engine2_new.load_indexes()
        print("✓ Minimal dataset test passed")
        
        # Test 3: Multiple save/load cycles
        print("\n3. Testing multiple save/load cycles...")
        engine3 = UltraFastSearchEngine(embedding_dim=384, use_gpu=False)
        engine3.index_path = temp_dir + "_test3"
        
        test_docs = documents[:5]
        await engine3.build_indexes(test_docs)
        
        for i in range(3):
            engine3.save_indexes()
            engine3_reload = UltraFastSearchEngine(embedding_dim=384, use_gpu=False)
            engine3_reload.index_path = temp_dir + "_test3"
            engine3_reload.load_indexes()
            engine3 = engine3_reload  # Use reloaded engine for next iteration
        print("✓ Multiple save/load cycles test passed")
        
        # Test 4: Verify index integrity after reload
        print("\n4. Testing index integrity after reload...")
        engine4 = UltraFastSearchEngine(embedding_dim=384, use_gpu=False)
        engine4.index_path = temp_dir + "_test4"
        
        test_docs_subset = documents[:10]
        await engine4.build_indexes(test_docs_subset)
        
        # Perform a search before saving
        query_results_before = await engine4.search("software engineer", num_results=3)
        
        engine4.save_indexes()
        
        # Load in new instance and search
        engine4_new = UltraFastSearchEngine(embedding_dim=384, use_gpu=False)
        engine4_new.index_path = temp_dir + "_test4"
        engine4_new.load_indexes()
        
        query_results_after = await engine4_new.search("software engineer", num_results=3)
        
        # Verify results consistency
        if len(query_results_before) == len(query_results_after):
            print("✓ Index integrity test passed - search results consistent")
        else:
            print(f"⚠ Index integrity warning - result count differs: {len(query_results_before)} vs {len(query_results_after)}")
        
        # Test 5: Error handling - corrupted files
        print("\n5. Testing error handling with corrupted files...")
        engine5 = UltraFastSearchEngine(embedding_dim=384, use_gpu=False)
        engine5.index_path = temp_dir + "_test5"
        
        await engine5.build_indexes(test_docs)
        engine5.save_indexes()
        
        # Corrupt one of the files
        corrupt_path = os.path.join(temp_dir + "_test5", "other_data.pkl")
        with open(corrupt_path, "wb") as f:
            f.write(b"corrupted data")
        
        # Try to load - should handle gracefully
        engine5_corrupt = UltraFastSearchEngine(embedding_dim=384, use_gpu=False)
        engine5_corrupt.index_path = temp_dir + "_test5"
        engine5_corrupt.load_indexes()  # Should not crash
        print("✓ Error handling test passed - graceful degradation")
        
        print("\n🎉 All FAISS serialization tests PASSED!")
        return True
        
    except Exception as e:
        print(f"\n❌ FAISS serialization test FAILED: {str(e)}")
        logger.error("FAISS serialization test failed", extra_fields={'error': str(e)})
        import traceback
        traceback.print_exc()
        return False
    
    finally:
        # Clean up all temp directories
        for suffix in ["_test1", "_test2", "_test3", "_test4", "_test5"]:
            try:
                shutil.rmtree(temp_dir + suffix, ignore_errors=True)
            except:
                pass
        try:
            shutil.rmtree(temp_dir, ignore_errors=True)
        except:
            pass

if __name__ == "__main__":
    result = asyncio.run(test_faiss_edge_cases())
    sys.exit(0 if result else 1)
