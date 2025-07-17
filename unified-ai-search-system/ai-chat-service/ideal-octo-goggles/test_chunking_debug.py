#!/usr/bin/env python3
"""
Debug script to test document chunking functionality
"""

import sys
import time
from pathlib import Path

# Add project root to path
sys.path.append(str(Path(__file__).parent))

def test_document_chunking():
    """Test document chunking with debug output"""
    print("🔍 Testing Document Chunking...")
    
    try:
        # Import components
        print("  📦 Importing components...")
        from app.rag.models import DocumentProcessor, DocumentChunker, Document
        print("  ✅ Components imported successfully")
        
        # Create test content
        test_content = """
        This is a test document for debugging chunking issues.
        It contains multiple sentences to test the chunking algorithm.
        
        The first paragraph discusses the importance of proper text processing.
        Each sentence should be handled correctly by the chunking system.
        
        The second paragraph explores different chunking strategies.
        We need to ensure that semantic boundaries are respected.
        Fixed-size chunking should also work properly.
        
        Finally, the third paragraph tests edge cases.
        What happens with very short sentences? And longer ones that might exceed chunk boundaries?
        """
        
        print("  📝 Creating test document...")
        # Process document
        processor = DocumentProcessor()
        document = processor.process_document(
            content=test_content,
            filename="debug_test.txt",
            content_type=".txt"
        )
        print(f"  ✅ Document processed: {len(document.content)} characters")
        
        # Test different chunking strategies
        chunker = DocumentChunker(chunk_size=200, overlap=30)
        
        print("  🔄 Testing semantic chunking...")
        start_time = time.time()
        semantic_chunks = chunker.chunk_document(document, strategy="semantic")
        semantic_time = time.time() - start_time
        print(f"  ✅ Semantic chunking: {len(semantic_chunks)} chunks in {semantic_time:.3f}s")
        
        print("  🔄 Testing fixed-size chunking...")
        start_time = time.time()
        fixed_chunks = chunker.chunk_document(document, strategy="fixed")
        fixed_time = time.time() - start_time
        print(f"  ✅ Fixed-size chunking: {len(fixed_chunks)} chunks in {fixed_time:.3f}s")
        
        print("  🔄 Testing paragraph chunking...")
        start_time = time.time()
        paragraph_chunks = chunker.chunk_document(document, strategy="paragraph")
        paragraph_time = time.time() - start_time
        print(f"  ✅ Paragraph chunking: {len(paragraph_chunks)} chunks in {paragraph_time:.3f}s")
        
        # Detailed output for debugging
        print("\n📊 Chunk Analysis:")
        print(f"  Semantic chunks: {len(semantic_chunks)}")
        for i, chunk in enumerate(semantic_chunks[:3]):  # Show first 3
            print(f"    Chunk {i}: {len(chunk.content)} chars - '{chunk.content[:50]}...'")
        
        print(f"\n  Fixed chunks: {len(fixed_chunks)}")
        for i, chunk in enumerate(fixed_chunks[:3]):  # Show first 3
            print(f"    Chunk {i}: {len(chunk.content)} chars - '{chunk.content[:50]}...'")
            
        print(f"\n  Paragraph chunks: {len(paragraph_chunks)}")
        for i, chunk in enumerate(paragraph_chunks[:3]):  # Show first 3
            print(f"    Chunk {i}: {len(chunk.content)} chars - '{chunk.content[:50]}...'")
        
        # Test with larger document
        print("\n🔍 Testing with larger document...")
        large_content = test_content * 10  # Make it 10x larger
        
        large_document = processor.process_document(
            content=large_content,
            filename="large_debug_test.txt",
            content_type=".txt"
        )
        print(f"  📝 Large document: {len(large_document.content)} characters")
        
        start_time = time.time()
        large_chunks = chunker.chunk_document(large_document, strategy="semantic")
        large_time = time.time() - start_time
        print(f"  ✅ Large document chunking: {len(large_chunks)} chunks in {large_time:.3f}s")
        
        print("\n✅ All chunking tests passed!")
        return True
        
    except Exception as e:
        print(f"❌ Error during chunking test: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_sentence_splitting():
    """Test the sentence splitting functionality specifically"""
    print("\n🔍 Testing Sentence Splitting...")
    
    try:
        from app.rag.models import DocumentChunker
        
        chunker = DocumentChunker()
        
        test_text = "This is sentence one. This is sentence two! Is this sentence three? Yes, it is."
        
        print(f"  📝 Test text: '{test_text}'")
        
        sentences = chunker._split_into_sentences(test_text)
        print(f"  ✅ Split into {len(sentences)} sentences:")
        for i, sentence in enumerate(sentences):
            print(f"    {i+1}: '{sentence}'")
            
        return True
        
    except Exception as e:
        print(f"❌ Error during sentence splitting test: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("🚀 RAG Chunking Debug Tests")
    print("=" * 50)
    
    success = True
    
    # Test sentence splitting first
    success &= test_sentence_splitting()
    
    # Test document chunking
    success &= test_document_chunking()
    
    print("\n" + "=" * 50)
    if success:
        print("✅ All debug tests passed!")
    else:
        print("❌ Some tests failed!")
        sys.exit(1)
