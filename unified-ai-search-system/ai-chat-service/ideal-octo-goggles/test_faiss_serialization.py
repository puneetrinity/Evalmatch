#!/usr/bin/env python3
"""
Test script to verify FAISS index serialization is working properly.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import asyncio
import json
from app.search.ultra_fast_engine import UltraFastSearchEngine
from app.logger import get_enhanced_logger
import tempfile
import shutil

logger = get_enhanced_logger(__name__)

async def test_faiss_serialization():
    """Test FAISS index save and load operations."""
    print("Testing FAISS index serialization...")
    
    # Create a temporary directory for testing
    temp_dir = tempfile.mkdtemp()
    
    try:
        # Initialize search engine
        engine = UltraFastSearchEngine(embedding_dim=384, use_gpu=False)
        
        # Override index path to use temp directory
        engine.index_path = temp_dir
        
        # Load sample data
        with open('data/resumes.json', 'r') as f:
            documents = json.load(f)
        
        # Take only first 5 documents for quick test
        test_docs = documents[:5]
        
        print(f"Building indexes for {len(test_docs)} documents...")
        await engine.build_indexes(test_docs)
        
        print("Testing index save operation...")
        engine.save_indexes()
        
        print("Testing index load operation...")
        # Create a new engine instance
        engine2 = UltraFastSearchEngine(embedding_dim=384, use_gpu=False)
        engine2.index_path = temp_dir
        engine2.load_indexes()
        
        print("FAISS serialization test PASSED!")
        return True
        
    except Exception as e:
        print(f"FAISS serialization test FAILED: {str(e)}")
        logger.error("FAISS serialization failed", extra_fields={'error': str(e)})
        return False
    
    finally:
        # Clean up temp directory
        shutil.rmtree(temp_dir, ignore_errors=True)

if __name__ == "__main__":
    result = asyncio.run(test_faiss_serialization())
    sys.exit(0 if result else 1)
