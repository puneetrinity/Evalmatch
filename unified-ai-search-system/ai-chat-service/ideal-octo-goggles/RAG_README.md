# RAG Integration for ideal-octo-goggles

## Overview

This RAG (Retrieval Augmented Generation) integration adds powerful document processing and semantic search capabilities to the ultra-fast search system. It enables the system to:

- **Process Multiple Document Types**: PDF, DOCX, TXT, HTML, MD, JSON
- **Intelligent Chunking**: Semantic, fixed-size, and paragraph-based strategies
- **Vector Search**: Hybrid search combining semantic similarity and keyword matching
- **Document Storage**: Persistent storage with SQLite and file system
- **RESTful API**: Complete API for document upload, processing, and RAG queries
- **Integration Ready**: Designed to work seamlessly with ubiquitous-octo-invention

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         RAG Integration Architecture                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────┐ │
│  │                       API Layer (/api/v2/rag)                              │ │
│  │                                                                             │ │
│  │  POST /query           POST /documents      GET /documents                  │ │
│  │  GET /documents/{id}   DELETE /documents/{id}   GET /stats                 │ │
│  └─────────────────────────────────────────────────────────────────────────────┘ │
│                                        │                                         │
│                                        │                                         │
│  ┌─────────────────────────────────────────────────────────────────────────────┐ │
│  │                    Processing Layer                                         │ │
│  │                                                                             │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐            │ │
│  │  │ Document        │  │ Document        │  │ RAG Enhanced    │            │ │
│  │  │ Processor       │  │ Chunker         │  │ Search Engine   │            │ │
│  │  │                 │  │                 │  │                 │            │ │
│  │  │ • Multi-format  │  │ • Semantic      │  │ • Hybrid Search │            │ │
│  │  │ • Text cleaning │  │ • Fixed-size    │  │ • Vector Index  │            │ │
│  │  │ • Metadata      │  │ • Paragraph     │  │ • Sub-second    │            │ │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘            │ │
│  └─────────────────────────────────────────────────────────────────────────────┘ │
│                                        │                                         │
│                                        │                                         │
│  ┌─────────────────────────────────────────────────────────────────────────────┐ │
│  │                     Storage Layer                                           │ │
│  │                                                                             │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐            │ │
│  │  │ Document Store  │  │ Vector Storage  │  │ Metadata DB     │            │ │
│  │  │                 │  │                 │  │                 │            │ │
│  │  │ • File System   │  │ • HNSW Index    │  │ • SQLite        │            │ │
│  │  │ • JSON Storage  │  │ • LSH Hash      │  │ • Relational    │            │ │
│  │  │ • Versioning    │  │ • Embeddings    │  │ • Indexed       │            │ │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘            │ │
│  └─────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Setup and Validate

```bash
python setup_rag.py
```

This script will:
- ✅ Validate all dependencies
- ✅ Test RAG components
- ✅ Create sample data
- ✅ Generate validation report

### 3. Start the Application

```bash
uvicorn app.main:app --reload --port 8000
```

### 4. Test RAG Endpoints

Visit http://localhost:8000/docs to see the API documentation, or test directly:

```bash
# Upload a document
curl -X POST "http://localhost:8000/api/v2/rag/documents" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@sample_document.txt" \
  -F "title=My Document" \
  -F "chunking_strategy=semantic"

# Query the RAG system
curl -X POST "http://localhost:8000/api/v2/rag/query" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is machine learning?",
    "max_chunks": 5,
    "confidence_threshold": 0.3,
    "include_citations": true
  }'
```

## API Endpoints

### Document Management

#### `POST /api/v2/rag/documents`
Upload and process documents for RAG system.

**Parameters:**
- `file`: Document file (PDF, DOCX, TXT, HTML, MD, JSON)
- `title`: Optional document title
- `description`: Optional description
- `tags`: Comma-separated tags
- `chunking_strategy`: "semantic", "fixed", or "paragraph"
- `chunk_size`: Size of each chunk (100-2000)
- `chunk_overlap`: Overlap between chunks (0-500)

**Response:**
```json
{
  "document_id": "uuid",
  "filename": "document.pdf",
  "status": "processing",
  "processing_started": true,
  "estimated_processing_time": 15.5
}
```

#### `GET /api/v2/rag/documents`
List all documents with optional search.

**Parameters:**
- `page`: Page number (default: 1)
- `page_size`: Documents per page (default: 20)
- `search`: Optional search query

#### `GET /api/v2/rag/documents/{document_id}`
Get document details and chunks.

#### `DELETE /api/v2/rag/documents/{document_id}`
Delete a document and its chunks.

### RAG Queries

#### `POST /api/v2/rag/query`
Execute RAG query with document retrieval.

**Request:**
```json
{
  "query": "What is machine learning?",
  "max_chunks": 5,
  "document_filter": ["doc1", "doc2"],
  "include_citations": true,
  "confidence_threshold": 0.3,
  "search_type": "hybrid"
}
```

**Response:**
```json
{
  "query_id": "query_123",
  "query": "What is machine learning?",
  "chunks": [
    {
      "chunk_id": "chunk_456",
      "content": "Machine Learning is...",
      "relevance_score": 0.89,
      "source_document_id": "doc1",
      "chunk_index": 2,
      "metadata": {},
      "citation": {
        "source_document_id": "doc1",
        "snippet": "Machine Learning is...",
        "relevance_score": 0.89
      }
    }
  ],
  "total_chunks_found": 5,
  "confidence_score": 0.78,
  "processing_time": 245.3,
  "search_type": "hybrid"
}
```

### System Information

#### `GET /api/v2/rag/stats`
Get RAG system statistics.

```json
{
  "total_chunks": 1250,
  "total_documents": 45,
  "avg_chunks_per_document": 27.8,
  "chunk_types": {
    "text": 1200,
    "table": 30,
    "code": 20
  },
  "document_distribution": {
    "1-5": 10,
    "6-10": 15,
    "11-20": 15,
    "21-50": 5
  }
}
```

## Configuration

### RAG Configuration Options

```python
from app.rag.integration import rag_config

# Document processing
rag_config.max_document_size = 10 * 1024 * 1024  # 10MB
rag_config.supported_document_types = ['.pdf', '.txt', '.docx', '.html', '.md', '.json']

# Chunking
rag_config.default_chunk_size = 512
rag_config.default_chunk_overlap = 50

# Search
rag_config.default_max_chunks = 5
rag_config.default_confidence_threshold = 0.3

# Storage
rag_config.document_storage_path = "data/rag_documents"
rag_config.database_path = "data/rag_documents.db"
```

### Environment Variables

Create a `.env` file:

```env
# RAG Settings
RAG_CHUNK_SIZE=512
RAG_CHUNK_OVERLAP=50
RAG_MAX_DOCUMENT_SIZE=10485760
RAG_CONFIDENCE_THRESHOLD=0.3

# Storage Paths
RAG_STORAGE_PATH=data/rag_documents
RAG_DATABASE_PATH=data/rag_documents.db
RAG_TEMP_DIR=temp_uploads
```

## Integration with ubiquitous-octo-invention

The RAG system is designed to integrate seamlessly with your ubiquitous-octo-invention project through the `RAGIntegrationBridge`:

```python
from app.rag.integration import rag_bridge

# Process document
result = await rag_bridge.process_document_for_rag(
    content=document_bytes,
    filename="document.pdf",
    metadata={"source": "upload", "user_id": "123"}
)

# Retrieve for RAG
retrieval_result = await rag_bridge.rag_retrieve(
    query="What is machine learning?",
    top_k=5,
    filters={"confidence_threshold": 0.3}
)

# Get system stats
stats = await rag_bridge.get_system_stats()
```

## Chunking Strategies

### Semantic Chunking
- **Best for**: Natural text, articles, documentation
- **Method**: Splits on sentence boundaries while respecting chunk size
- **Overlap**: Configurable overlap for context preservation

### Fixed-Size Chunking
- **Best for**: Consistent chunk sizes, performance optimization
- **Method**: Splits text into fixed-size chunks with overlap
- **Use case**: When uniform chunk sizes are important

### Paragraph Chunking
- **Best for**: Structured documents with clear paragraphs
- **Method**: Splits on paragraph boundaries
- **Use case**: Documents with natural paragraph structure

## Performance Optimization

### Recommended Settings

For **development**:
```python
chunk_size = 256
batch_size = 16
parallel_processing = False
```

For **production**:
```python
chunk_size = 512
batch_size = 32
parallel_processing = True
use_gpu = True  # If available
```

### Performance Targets

- **Document Processing**: < 30 seconds for 10MB documents
- **RAG Query Response**: < 5 seconds end-to-end
- **Index Building**: < 2 minutes for 1000 documents
- **Memory Usage**: < 4GB for 10,000 document chunks

## Testing

### Run All Tests

```bash
# Run RAG integration tests
python -m pytest tests/test_rag_integration.py -v

# Run setup validation
python setup_rag.py

# Run specific test categories
python -m pytest tests/test_rag_integration.py::TestRAGModels -v
python -m pytest tests/test_rag_integration.py::TestRAGEngine -v
```

### Manual Testing

```bash
# Test document upload
curl -X POST "http://localhost:8000/api/v2/rag/documents" \
  -F "file=@data/sample_documents/ai_overview.txt"

# Test RAG query
curl -X POST "http://localhost:8000/api/v2/rag/query" \
  -H "Content-Type: application/json" \
  -d '{"query": "artificial intelligence", "max_chunks": 3}'

# Check system health
curl http://localhost:8000/health
```

## Troubleshooting

### Common Issues

#### 1. Import Errors
```bash
# Install missing dependencies
pip install -r requirements.txt

# Check Python version (requires 3.8+)
python --version
```

#### 2. Database Issues
```bash
# Remove and recreate database
rm data/rag_documents.db
python setup_rag.py
```

#### 3. Memory Issues
```python
# Reduce batch sizes
rag_config.embedding_batch_size = 8
rag_config.indexing_batch_size = 16
```

#### 4. Performance Issues
```python
# Enable GPU if available
use_gpu = True

# Increase chunk size
rag_config.default_chunk_size = 1024

# Enable parallel processing
rag_config.parallel_processing = True
```

### Debug Mode

Enable verbose logging:

```python
import logging
logging.getLogger("app.rag").setLevel(logging.DEBUG)
```

### Health Checks

```bash
# Check RAG system health
curl http://localhost:8000/health

# Get detailed stats
curl http://localhost:8000/api/v2/rag/stats

# Validate setup
python setup_rag.py
```

## Next Steps

1. **Upload Sample Documents**: Use the sample documents created by `setup_rag.py`
2. **Test RAG Queries**: Try different queries to see retrieval quality
3. **Integrate with LangGraph**: Connect to ubiquitous-octo-invention for full RAG workflows
4. **Optimize Performance**: Tune chunk sizes and thresholds for your use case
5. **Scale Up**: Add more documents and monitor performance

## Support

For issues and questions:

1. **Setup Issues**: Run `python setup_rag.py` for validation
2. **API Issues**: Check http://localhost:8000/docs for API documentation
3. **Performance Issues**: Review the performance optimization section
4. **Integration Issues**: Check the integration bridge examples

The RAG system is now ready to enhance your search capabilities with document understanding and semantic retrieval! 🚀
