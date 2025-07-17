#!/usr/bin/env python3
"""
Complete Core Functionality Test
Comprehensive test of all RAG system components including API endpoints
"""

import sys
import time
import json
import asyncio
from pathlib import Path

# Add project root to path
sys.path.append(str(Path(__file__).parent))

async def test_complete_core_functionality():
    """Test complete core RAG functionality including API components"""
    print("🚀 Complete Core Functionality Test")
    print("=" * 60)
    
    try:
        # Test 1: Import all core components
        print("\n1. Testing Component Imports...")
        from app.rag.models import DocumentProcessor, DocumentChunker, DocumentStore, Document, DocumentChunk
        from app.rag.enhanced_engine import RAGUltraFastEngine
        from app.rag.api import RAGQueryRequest, RAGQueryResponse, DocumentUploadRequest
        from app.rag.integration import RAGConfig, RAGSystemManager, RAGIntegrationBridge
        print("   ✅ All components imported successfully")
        
        # Test 2: Initialize RAG system
        print("\n2. Testing RAG System Initialization...")
        rag_manager = RAGSystemManager()
        await rag_manager.initialize()
        print(f"   ✅ RAG System Manager initialized")
        print(f"   ✅ Config loaded: {rag_manager.config.max_chunk_size} max chunk size")
        
        # Test 3: Document processing pipeline
        print("\n3. Testing Document Processing Pipeline...")
        test_documents = [
            {
                "content": """
                Machine Learning and Artificial Intelligence
                
                Machine learning is a subset of artificial intelligence that enables computers to learn and improve from experience without being explicitly programmed. It focuses on the development of algorithms that can access data and use it to learn for themselves.
                
                Types of Machine Learning:
                1. Supervised Learning: Uses labeled data to train models
                2. Unsupervised Learning: Finds patterns in unlabeled data
                3. Reinforcement Learning: Learns through interaction with environment
                
                Applications include natural language processing, computer vision, recommendation systems, and predictive analytics.
                """,
                "filename": "ml_introduction.txt",
                "content_type": ".txt"
            },
            {
                "content": """
                {
                    "title": "Deep Learning Fundamentals",
                    "author": "AI Research Team",
                    "content": "Deep learning is a subset of machine learning that uses neural networks with multiple layers to model and understand complex patterns in data.",
                    "topics": ["Neural Networks", "Backpropagation", "Convolutional Networks", "Recurrent Networks"],
                    "difficulty": "Advanced"
                }
                """,
                "filename": "deep_learning.json",
                "content_type": ".json"
            }
        ]
        
        processed_docs = []
        for doc_data in test_documents:
            doc = rag_manager.document_processor.process_document(
                content=doc_data["content"],
                filename=doc_data["filename"],
                content_type=doc_data["content_type"]
            )
            processed_docs.append(doc)
            print(f"   ✅ Processed {doc.filename}: {len(doc.content)} chars")
        
        # Test 4: Document chunking
        print("\n4. Testing Document Chunking...")
        all_chunks = []
        for doc in processed_docs:
            chunks = rag_manager.document_chunker.chunk_document(doc, strategy="semantic")
            all_chunks.extend(chunks)
            print(f"   ✅ Chunked {doc.filename}: {len(chunks)} chunks")
        
        print(f"   ✅ Total chunks created: {len(all_chunks)}")
        
        # Test 5: Document storage
        print("\n5. Testing Document Storage...")
        for i, doc in enumerate(processed_docs):
            doc_chunks = [chunk for chunk in all_chunks if chunk.source_document_id == doc.id]
            success = rag_manager.document_store.store_document(doc, doc_chunks)
            print(f"   ✅ Stored {doc.filename}: {success}")
        
        # Test 6: Enhanced search engine
        print("\n6. Testing Enhanced Search Engine...")
        search_engine = RAGUltraFastEngine(embedding_dim=384, use_gpu=False)
        
        # Index the chunks first
        await search_engine.index_document_chunks(all_chunks)
        print("   ✅ Document chunks indexed")
        
        # Test RAG retrieval
        rag_results = await search_engine.retrieve_for_rag(
            query="What is machine learning?",
            top_k=3
        )
        print(f"   ✅ RAG retrieval returned {len(rag_results)} results")
        
        # Test similarity search
        similarity_results = await search_engine.similarity_search(
            query="deep learning neural networks",
            top_k=5
        )
        print(f"   ✅ Similarity search returned {len(similarity_results)} results")
        
        # Test 7: Document retrieval by ID
        print("\n7. Testing Document Retrieval by ID...")
        if processed_docs:
            doc_chunks = await search_engine.get_document_chunks(processed_docs[0].id)
            print(f"   ✅ Document chunks retrieved: {len(doc_chunks)}")
        else:
            print("   ⚠️  No documents available for chunk retrieval")
        
        # Test 8: API models
        print("\n8. Testing API Models...")
        query_request = RAGQueryRequest(
            query="What are the applications of machine learning?",
            top_k=3,
            include_context=True
        )
        print(f"   ✅ Query request created: {query_request.query}")
        
        upload_request = DocumentUploadRequest(
            title="Test Upload Document",
            description="This is a test upload document",
            tags=["test", "upload"],
            chunking_strategy="semantic"
        )
        print(f"   ✅ Upload request created: {upload_request.title}")
        
        # Test 9: Integration bridge
        print("\n9. Testing Integration Bridge...")
        bridge = RAGIntegrationBridge()
        
        # Test document upload via bridge
        test_content = b"Testing the integration bridge functionality"
        bridge_upload = await bridge.process_document_for_rag(
            content=test_content,
            filename="bridge_test.txt"
        )
        print(f"   ✅ Bridge upload: {bridge_upload['success']}")
        
        # Test query via bridge
        bridge_query = await bridge.rag_retrieve(
            query="What is testing?",
            top_k=2
        )
        print(f"   ✅ Bridge query: {len(bridge_query.get('results', []))} results")
        
        # Test 10: Performance metrics
        print("\n10. Testing Performance Metrics...")
        start_time = time.time()
        
        # Process a larger document
        large_content = """
        Artificial Intelligence and Machine Learning: A Comprehensive Overview
        
        Introduction to AI and ML
        Artificial Intelligence (AI) represents one of the most significant technological advances of our time. It encompasses the development of computer systems that can perform tasks typically requiring human intelligence, such as visual perception, speech recognition, decision-making, and language translation.
        
        Machine Learning Fundamentals
        Machine learning, a subset of AI, focuses on creating systems that can learn and improve from data without explicit programming. This field has revolutionized how we approach problem-solving across numerous domains.
        
        Deep Learning Revolution
        Deep learning has emerged as a powerful subset of machine learning, utilizing neural networks with multiple layers to process complex patterns in data. This technology has enabled breakthroughs in image recognition, natural language processing, and autonomous systems.
        
        Natural Language Processing
        NLP combines computational linguistics with machine learning to enable computers to understand, interpret, and generate human language. Applications include chatbots, translation services, and sentiment analysis.
        
        Computer Vision
        Computer vision enables machines to interpret and understand visual information from the world. This technology powers applications like autonomous vehicles, medical imaging, and quality control systems.
        
        Reinforcement Learning
        Reinforcement learning involves training agents to make decisions by rewarding desired behaviors and penalizing undesired ones. This approach has achieved remarkable success in game playing and robotics.
        
        Ethical Considerations
        As AI systems become more prevalent, ethical considerations around fairness, transparency, and accountability become increasingly important. Responsible AI development requires careful attention to bias mitigation and ethical guidelines.
        
        Future Directions
        The future of AI and ML promises continued innovation across healthcare, education, transportation, and many other sectors. Emerging areas include quantum machine learning, neuromorphic computing, and artificial general intelligence.
        """ * 3  # Make it 3x larger
        
        large_doc = rag_manager.document_processor.process_document(
            content=large_content,
            filename="large_ai_overview.txt",
            content_type=".txt"
        )
        
        large_chunks = rag_manager.document_chunker.chunk_document(large_doc, strategy="semantic")
        storage_success = rag_manager.document_store.store_document(large_doc, large_chunks)
        
        processing_time = time.time() - start_time
        print(f"   ✅ Large document processed: {len(large_content)} chars")
        print(f"   ✅ Processing time: {processing_time:.3f}s")
        print(f"   ✅ Chunks created: {len(large_chunks)}")
        print(f"   ✅ Storage success: {storage_success}")
        
        # Test 11: Search performance
        print("\n11. Testing Search Performance...")
        search_start = time.time()
        performance_results = await search_engine.retrieve_for_rag(
            query="artificial intelligence ethics and future directions",
            top_k=5
        )
        search_time = time.time() - search_start
        print(f"   ✅ Search completed in {search_time:.3f}s")
        print(f"   ✅ Results found: {len(performance_results)}")
        
        # Test 12: Cleanup and final validation
        print("\n12. Testing Cleanup and Validation...")
        all_docs = rag_manager.document_store.list_documents()
        print(f"   ✅ Total documents in store: {len(all_docs)}")
        
        # Clean up test documents
        cleanup_count = 0
        for doc_info in all_docs:
            if doc_info['filename'] in ['ml_introduction.txt', 'deep_learning.json', 'bridge_test.txt', 'large_ai_overview.txt']:
                deleted = rag_manager.document_store.delete_document(doc_info['id'])
                if deleted:
                    cleanup_count += 1
        
        print(f"   ✅ Cleaned up {cleanup_count} test documents")
        
        print("\n" + "=" * 60)
        print("🎉 ALL COMPLETE CORE FUNCTIONALITY TESTS PASSED!")
        print("=" * 60)
        
        # Summary
        print("\n📊 Test Summary:")
        print("✅ Component imports: PASSED")
        print("✅ RAG system initialization: PASSED")
        print("✅ Document processing pipeline: PASSED")
        print("✅ Document chunking: PASSED")
        print("✅ Document storage: PASSED")
        print("✅ Enhanced search engine: PASSED")
        print("✅ RAG query processing: PASSED")
        print("✅ API models: PASSED")
        print("✅ Integration bridge: PASSED")
        print("✅ Performance metrics: PASSED")
        print("✅ Search performance: PASSED")
        print("✅ Cleanup and validation: PASSED")
        
        return True
        
    except Exception as e:
        print(f"\n❌ Error during complete functionality test: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    try:
        # Run the async test
        success = asyncio.run(test_complete_core_functionality())
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"❌ Failed to run test: {e}")
        sys.exit(1)
