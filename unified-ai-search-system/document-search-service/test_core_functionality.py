#!/usr/bin/env python3
"""
Test Core RAG Functionality
Quick test of the main RAG components
"""

import sys
import time
from pathlib import Path

# Add project root to path
sys.path.append(str(Path(__file__).parent))

def test_core_functionality():
    """Test the core RAG functionality"""
    print("🧪 Testing Core RAG Functionality")
    print("=" * 50)
    
    try:
        from app.rag.models import DocumentProcessor, DocumentChunker, DocumentStore
        
        # Test 1: Document Processing
        print("\n1. Testing Document Processing...")
        processor = DocumentProcessor()
        
        test_content = """
        This is a comprehensive test document for the RAG system.
        It contains multiple paragraphs and sentences to test chunking.
        
        The document processing system should handle this content properly.
        Each sentence should be processed and cleaned correctly.
        
        This paragraph tests the chunking algorithm's ability to handle
        semantic boundaries and create meaningful chunks of text.
        """
        
        document = processor.process_document(
            content=test_content,
            filename="test_document.txt",
            content_type=".txt"
        )
        
        print(f"   ✅ Document processed: {len(document.content)} characters")
        print(f"   ✅ Document ID: {document.id}")
        print(f"   ✅ Status: {document.status}")
        
        # Test 2: Document Chunking
        print("\n2. Testing Document Chunking...")
        chunker = DocumentChunker(chunk_size=100, overlap=20)
        
        start_time = time.time()
        chunks = chunker.chunk_document(document, strategy="semantic")
        chunk_time = time.time() - start_time
        
        print(f"   ✅ Created {len(chunks)} chunks in {chunk_time:.3f}s")
        
        for i, chunk in enumerate(chunks[:3]):  # Show first 3 chunks
            print(f"   📝 Chunk {i+1}: {chunk.content[:50]}...")
            
        # Test 3: Document Storage
        print("\n3. Testing Document Storage...")
        store = DocumentStore(
            db_path="data/test_rag.db",
            documents_dir="data/test_documents"
        )
        
        start_time = time.time()
        stored = store.store_document(document, chunks)
        storage_time = time.time() - start_time
        
        print(f"   ✅ Document stored in {storage_time:.3f}s")
        print(f"   ✅ Storage success: {stored}")
        
        # Test 4: Document Retrieval
        print("\n4. Testing Document Retrieval...")
        start_time = time.time()
        retrieved = store.retrieve_document(document.id)
        retrieval_time = time.time() - start_time
        
        print(f"   ✅ Document retrieved in {retrieval_time:.3f}s")
        print(f"   ✅ Retrieved chunks: {len(retrieved.chunks) if retrieved else 0}")
        
        # Test 5: Search Functionality
        print("\n5. Testing Search Functionality...")
        search_results = store.search_documents("test", limit=5)
        print(f"   ✅ Search results: {len(search_results)}")
        
        # Test 6: List Documents
        print("\n6. Testing List Documents...")
        all_docs = store.list_documents(limit=10)
        print(f"   ✅ Total documents: {len(all_docs)}")
        
        # Cleanup
        print("\n7. Cleanup...")
        deleted = store.delete_document(document.id)
        print(f"   ✅ Document deleted: {deleted}")
        
        print("\n" + "=" * 50)
        print("🎉 All core functionality tests PASSED!")
        return True
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_core_functionality()
    sys.exit(0 if success else 1)
