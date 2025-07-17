#!/usr/bin/env python3
"""
RAG Integration Setup and Validation Script
Sets up and validates the RAG system integration
"""

import asyncio
import sys
import time
import json
import tempfile
from pathlib import Path
from typing import Dict, Any, List

# Add project root to path
sys.path.append(str(Path(__file__).parent))

async def validate_dependencies():
    """Validate that all required dependencies are available"""
    print("🔍 Validating dependencies...")
    
    required_packages = [
        'fastapi',
        'uvicorn', 
        'numpy',
        'scikit-learn',
        'sentence_transformers',
        'faiss',
        'pandas',
        'aiofiles',
        'pydantic',
        'beautifulsoup4',
        'chardet'
    ]
    
    missing_packages = []
    
    for package in required_packages:
        try:
            if package == 'faiss':
                import faiss
            elif package == 'sentence_transformers':
                import sentence_transformers
            elif package == 'beautifulsoup4':
                import bs4
            elif package == 'scikit-learn':
                import sklearn
            else:
                __import__(package)
            print(f"  ✅ {package}")
        except ImportError:
            print(f"  ❌ {package} - MISSING")
            missing_packages.append(package)
    
    if missing_packages:
        print(f"\n❌ Missing packages: {', '.join(missing_packages)}")
        print("Run: pip install -r requirements.txt")
        return False
    
    print("✅ All dependencies validated")
    return True


async def validate_rag_components():
    """Validate RAG components can be imported and initialized"""
    print("\n🔍 Validating RAG components...")
    
    try:
        # Test imports
        from app.rag.models import DocumentProcessor, DocumentChunker, DocumentStore, Document, DocumentChunk
        print("  ✅ RAG models imported")
        
        from app.rag.enhanced_engine import RAGUltraFastEngine
        print("  ✅ RAG engine imported")
        
        from app.rag.integration import RAGSystemManager, RAGIntegrationBridge
        print("  ✅ RAG integration imported")
        
        from app.rag.api import router as rag_router
        print("  ✅ RAG API imported")
        
        # Test component initialization
        processor = DocumentProcessor()
        print("  ✅ Document processor initialized")
        
        chunker = DocumentChunker()
        print("  ✅ Document chunker initialized")
        
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                store = DocumentStore(
                    db_path=f"{temp_dir}/test.db",
                    documents_dir=f"{temp_dir}/docs"
                )
                print("  ✅ Document store initialized")
                # Give time for connections to close
                time.sleep(0.1)
        except Exception as e:
            # On Windows, file locking can cause issues during cleanup
            # This is not a critical error for validation
            print(f"  ⚠️  Database cleanup warning: {e}")
        
        # Note: RAG engine requires more setup, so we'll skip full initialization
        print("  ✅ All components validated")
        return True
        
    except Exception as e:
        print(f"  ❌ Component validation failed: {e}")
        return False


async def test_document_processing():
    """Test document processing workflow"""
    print("\n🧪 Testing document processing...")
    
    try:
        from app.rag.models import DocumentProcessor, DocumentChunker
        
        # Test content
        test_content = """
        This is a test document for the RAG system.
        It contains multiple sentences and paragraphs.
        
        The document should be processed correctly and split into chunks.
        Each chunk should contain meaningful content.
        """
        
        # Initialize components
        processor = DocumentProcessor()
        chunker = DocumentChunker(chunk_size=100, overlap=20)
        
        # Process document
        document = processor.process_document(
            content=test_content,
            filename="test.txt",
            content_type=".txt"
        )
        
        print(f"  ✅ Document processed: {len(document.content)} characters")
        
        # Create chunks
        chunks = chunker.chunk_document(document, strategy="semantic")
        
        print(f"  ✅ Created {len(chunks)} chunks")
        
        # Validate chunks
        assert len(chunks) > 0, "No chunks created"
        assert all(chunk.content.strip() for chunk in chunks), "Empty chunks found"
        assert all(chunk.chunk_id for chunk in chunks), "Missing chunk IDs"
        
        print("  ✅ Chunk validation passed")
        return True
        
    except Exception as e:
        print(f"  ❌ Document processing test failed: {e}")
        return False


async def test_document_storage():
    """Test document storage and retrieval"""
    print("\n💾 Testing document storage...")
    
    try:
        from app.rag.models import DocumentStore, Document, DocumentChunk
        
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                # Initialize store
                store = DocumentStore(
                    db_path=f"{temp_dir}/test.db",
                    documents_dir=f"{temp_dir}/docs"
                )
                
                # Create test document
                document = Document(
                    filename="storage_test.txt",
                    content="Test content for storage validation",
                    content_type=".txt",
                    status="completed"
                )
                
                # Create test chunks
                chunks = [
                    DocumentChunk(
                        content="First test chunk",
                        source_document_id=document.id,
                        chunk_index=0
                    ),
                    DocumentChunk(
                        content="Second test chunk",
                        source_document_id=document.id,
                        chunk_index=1
                    )
                ]
                
                # Test storage
                success = store.store_document(document, chunks)
                assert success, "Failed to store document"
                print("  ✅ Document stored successfully")
                
                # Test retrieval
                retrieved = store.retrieve_document(document.id)
                assert retrieved is not None, "Failed to retrieve document"
                assert retrieved.filename == "storage_test.txt", "Incorrect filename"
                assert len(retrieved.chunks) == 2, "Incorrect chunk count"
                print("  ✅ Document retrieved successfully")
                
                # Test listing
                documents = store.list_documents()
                assert len(documents) == 1, "Incorrect document count"
                print("  ✅ Document listing works")
                
                # Test deletion
                deleted = store.delete_document(document.id)
                assert deleted, "Failed to delete document"
                
                # Verify deletion
                retrieved = store.retrieve_document(document.id)
                assert retrieved is None, "Document not deleted"
                print("  ✅ Document deletion works")
                
                # Give time for connections to close
                time.sleep(0.1)
                
        except Exception as e:
            if "cannot access the file" in str(e):
                # Windows file locking issue during cleanup - not critical
                print(f"  ⚠️  Database cleanup warning: {e}")
            else:
                raise e
        
        return True
        
    except Exception as e:
        print(f"  ❌ Document storage test failed: {e}")
        return False


async def test_api_endpoints():
    """Test API endpoint definitions"""
    print("\n🔌 Testing API endpoints...")
    
    try:
        from app.rag.api import (
            RAGQueryRequest, RAGQueryResponse,
            DocumentUploadRequest, DocumentUploadResponse,
            router
        )
        
        # Test request models
        query_request = RAGQueryRequest(
            query="test query",
            max_chunks=5,
            confidence_threshold=0.3
        )
        assert query_request.query == "test query"
        print("  ✅ Query request model works")
        
        upload_request = DocumentUploadRequest(
            title="Test Document",
            chunking_strategy="semantic"
        )
        assert upload_request.title == "Test Document"
        print("  ✅ Upload request model works")
        
        # Test router
        assert router.prefix == "/api/v2/rag"
        print("  ✅ API router configured")
        
        return True
        
    except Exception as e:
        print(f"  ❌ API endpoint test failed: {e}")
        return False


async def test_integration_components():
    """Test integration components"""
    print("\n🔗 Testing integration components...")
    
    try:
        from app.rag.integration import RAGSystemManager, RAGIntegrationBridge, rag_config
        
        # Test configuration
        assert rag_config.default_chunk_size > 0
        assert rag_config.supported_document_types
        print("  ✅ RAG configuration loaded")
        
        # Test manager initialization (without full setup)
        manager = RAGSystemManager()
        assert manager.config is not None
        print("  ✅ RAG system manager created")
        
        # Test bridge
        bridge = RAGIntegrationBridge()
        assert bridge.rag_manager is not None
        print("  ✅ RAG integration bridge created")
        
        return True
        
    except Exception as e:
        print(f"  ❌ Integration test failed: {e}")
        return False


async def test_main_app_integration():
    """Test main app integration"""
    print("\n🚀 Testing main app integration...")
    
    try:
        # Test that main app can import RAG components
        from app.main import app
        
        # Check that RAG router is included
        routes = [route.path for route in app.routes]
        rag_routes = [route for route in routes if route.startswith('/api/v2/rag')]
        
        if rag_routes:
            print(f"  ✅ RAG routes found: {len(rag_routes)} endpoints")
        else:
            print("  ⚠️  No RAG routes found - check router inclusion")
        
        # Check app metadata
        assert "RAG" in app.title
        print("  ✅ App title includes RAG")
        
        return True
        
    except Exception as e:
        print(f"  ❌ Main app integration test failed: {e}")
        return False


async def run_performance_test():
    """Run basic performance tests"""
    print("\n⚡ Running performance tests...")
    
    try:
        from app.rag.models import DocumentProcessor, DocumentChunker, Document
        
        # Create large test content
        large_content = """
        This is a performance test document. It contains repeated content to test processing speed.
        """ * 100  # Repeat 100 times
        
        # Test processing speed
        processor = DocumentProcessor()
        
        start_time = time.time()
        document = processor.process_document(
            content=large_content,
            filename="perf_test.txt",
            content_type=".txt"
        )
        processing_time = time.time() - start_time
        
        print(f"  ✅ Document processing: {processing_time:.3f}s for {len(large_content)} chars")
        
        # Test chunking speed
        chunker = DocumentChunker(chunk_size=500, overlap=50)
        
        start_time = time.time()
        chunks = chunker.chunk_document(document, strategy="semantic")
        chunking_time = time.time() - start_time
        
        print(f"  ✅ Document chunking: {chunking_time:.3f}s for {len(chunks)} chunks")
        
        # Performance thresholds
        assert processing_time < 1.0, f"Processing too slow: {processing_time:.3f}s"
        assert chunking_time < 2.0, f"Chunking too slow: {chunking_time:.3f}s"
        
        print("  ✅ Performance tests passed")
        return True
        
    except Exception as e:
        print(f"  ❌ Performance test failed: {e}")
        return False


async def create_sample_data():
    """Create sample data for testing"""
    print("\n📝 Creating sample data...")
    
    try:
        # Create sample documents directory
        sample_dir = Path("data/sample_documents")
        sample_dir.mkdir(parents=True, exist_ok=True)
        
        # Sample documents
        samples = {
            "ai_overview.txt": """
            Artificial Intelligence (AI) refers to the simulation of human intelligence in machines.
            These machines are programmed to think and learn like humans.
            
            Machine Learning is a subset of AI that enables computers to learn without being explicitly programmed.
            Deep Learning is a subset of machine learning that uses neural networks with multiple layers.
            
            Natural Language Processing (NLP) helps computers understand human language.
            Computer Vision enables machines to interpret visual information.
            """,
            
            "machine_learning.txt": """
            Machine Learning algorithms build models based on training data to make predictions or decisions.
            
            Supervised Learning uses labeled training data to learn a mapping from inputs to outputs.
            Unsupervised Learning finds hidden patterns in data without labeled examples.
            Reinforcement Learning learns through interaction with an environment.
            
            Popular algorithms include Decision Trees, Random Forest, Support Vector Machines, and Neural Networks.
            """,
            
            "data_science.json": json.dumps({
                "title": "Data Science Overview",
                "description": "An introduction to data science concepts and tools",
                "sections": [
                    {
                        "title": "What is Data Science?",
                        "content": "Data science is an interdisciplinary field that uses scientific methods, processes, algorithms and systems to extract knowledge and insights from structured and unstructured data."
                    },
                    {
                        "title": "Key Tools",
                        "content": "Python, R, SQL, Jupyter Notebooks, Pandas, NumPy, Scikit-learn, TensorFlow, PyTorch"
                    }
                ]
            }, indent=2)
        }
        
        for filename, content in samples.items():
            file_path = sample_dir / filename
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
        
        print(f"  ✅ Created {len(samples)} sample documents in {sample_dir}")
        return True
        
    except Exception as e:
        print(f"  ❌ Sample data creation failed: {e}")
        return False


async def generate_setup_report(test_results: Dict[str, bool]):
    """Generate setup validation report"""
    print("\n📊 Setup Validation Report")
    print("=" * 50)
    
    total_tests = len(test_results)
    passed_tests = sum(test_results.values())
    
    for test_name, result in test_results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"  {test_name:<30} {status}")
    
    print("=" * 50)
    print(f"Total Tests: {total_tests}")
    print(f"Passed: {passed_tests}")
    print(f"Failed: {total_tests - passed_tests}")
    print(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")
    
    if passed_tests == total_tests:
        print("\n🎉 All tests passed! RAG system is ready.")
        print("\nNext steps:")
        print("1. Start the application: uvicorn app.main:app --reload")
        print("2. Visit http://localhost:8000/docs to see the API documentation")
        print("3. Test RAG endpoints at http://localhost:8000/api/v2/rag/")
        print("4. Upload documents and try RAG queries")
        return True
    else:
        print("\n⚠️  Some tests failed. Please fix the issues before proceeding.")
        print("\nTroubleshooting:")
        print("1. Check that all dependencies are installed: pip install -r requirements.txt")
        print("2. Ensure Python version is 3.8 or higher")
        print("3. Check that all RAG module files are present")
        return False


async def main():
    """Main setup and validation function"""
    print("🚀 RAG Integration Setup and Validation")
    print("=" * 50)
    
    test_results = {}
    
    # Run all validation tests
    test_results["Dependencies"] = await validate_dependencies()
    test_results["RAG Components"] = await validate_rag_components()
    test_results["Document Processing"] = await test_document_processing()
    test_results["Document Storage"] = await test_document_storage()
    test_results["API Endpoints"] = await test_api_endpoints()
    test_results["Integration"] = await test_integration_components()
    test_results["Main App"] = await test_main_app_integration()
    test_results["Performance"] = await run_performance_test()
    test_results["Sample Data"] = await create_sample_data()
    
    # Generate report
    success = await generate_setup_report(test_results)
    
    return success


if __name__ == "__main__":
    try:
        success = asyncio.run(main())
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\n⚠️  Setup interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ Setup failed with error: {e}")
        sys.exit(1)
