# Ultra-Fast Data Analysis System

This project implements a production-grade, high-performance search and data analysis system designed for sub-second response times on large-scale datasets. It is built on a foundation of advanced mathematical algorithms and modern engineering practices.

## Features

- **Hybrid Search:** Combines vector search (for semantic meaning) and keyword search (for lexical relevance) to deliver highly accurate results.
- **High Performance:** Achieves sub-second query latency by using a two-phase architecture (offline indexing, real-time querying) and optimized algorithms.
- **Scalable by Design:** Utilizes algorithms like HNSW with `O(log n)` complexity, ensuring performance scales efficiently as the dataset grows.
- **Memory Efficient:** Employs Product Quantization (PQ) to dramatically reduce the memory footprint of vector embeddings.
- **Production-Ready:** Includes a robust FastAPI application, a complete Docker and Docker Compose setup for deployment, and essential operational tooling like health checks and performance monitoring.
- **Index Persistence:** Automatically saves built indexes to disk and loads them on startup, avoiding the need for costly rebuilds.
- **Configurable:** Uses a `.env` file for easy configuration of key parameters like model names and file paths.
- **Structured Logging:** Implements structured logging for better monitoring and debugging.
- **Tested:** Includes a comprehensive test suite using `pytest`.

## Architecture

The system is composed of two main layers:

1.  **Offline Processing Layer:** This layer is responsible for all the heavy computational work, which is done offline to ensure the real-time query path is as fast as possible. This includes:
    *   **Text Embedding:** Using a `sentence-transformer` model to convert text into high-quality vector representations.
    *   **Index Building:** Creating the necessary data structures for fast retrieval, including LSH, HNSW (via Faiss), and BM25 indexes.
    *   **Quantization Training:** Training the Product Quantizer on the vector data.

2.  **Real-Time Query Layer:** This layer handles incoming user queries and is optimized for speed. It performs:
    *   **Candidate Generation:** Using LSH and HNSW to quickly retrieve a set of potential candidates.
    *   **Filtering:** Applying user-defined filters to the candidate set.
    *   **Scoring and Ranking:** Using a combination of vector similarity, BM25 scores, and other heuristics to rank the candidates and return the most relevant results.

## Getting Started

### Prerequisites

- **Docker:** You must have Docker and Docker Compose installed on your system.

### Quick Start

For the fastest setup experience, see our setup guides:

- **🚀 Quick Start Guide**: [`QUICK_START_GUIDE.md`](QUICK_START_GUIDE.md) - Get running in 5 minutes
- **📋 Complete Setup Guide**: [`COMPLETE_SETUP_GUIDE.md`](COMPLETE_SETUP_GUIDE.md) - Comprehensive instructions and troubleshooting
- **🤖 Automated Setup**: Run `setup.ps1` (PowerShell) or `setup.bat` (Command Prompt) for automatic installation

### Manual Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/puneetrinity/ideal-octo-goggles.git
    cd ideal-octo-goggles
    ```

2.  **Create a `.env` file:**
    Copy the `.env.example` file to `.env` and customize the values if needed.
    ```bash
    cp .env.example .env
    ```

3.  **Navigate to the project directory:**
    ```bash
    cd ultra_fast_search_system
    ```

4.  **Build and start the services:**
    Use Docker Compose to build the Docker image and start the FastAPI application and the Nginx proxy.
    ```bash
    docker-compose up --build
    ```
    The first time you start the application, it will download the sentence-transformer model, which may take a few minutes.

5.  **Build the search indexes:**
    The system will automatically load indexes if they exist in the `indexes/` directory. If not, you need to build them. Open a **new terminal** and run the following `curl` command:
    ```bash
    curl -X POST -H "Content-Type: application/json" -d "{\"data_source\": \"data/resumes.json\"}" http://localhost/api/v2/admin/build-indexes
    ```
    Once built, the indexes will be saved to the `indexes/` directory and loaded automatically on subsequent startups.

6.  **Verify the system:**
    Test that everything is working with our automated test script:
    ```powershell
    # Run comprehensive system tests
    .\test-system.ps1
    ```

7.  **Perform a search:**
    After the indexes are built, you can perform searches. See the API Endpoints section below for examples.

### System Verification

After setup, verify your system is working correctly:

- **Health Check**: http://localhost/api/v2/health
- **API Documentation**: http://localhost/docs  
- **System Metrics**: http://localhost/api/v2/metrics
- **Run Full Test Suite**: `.\test-system.ps1`

## Testing

To run the test suite, execute the following command:

```bash
pytest
```

## API Endpoints

### Build Indexes

- **POST** `/api/v2/admin/build-indexes`
- **Description:** Triggers the offline index building process.
- **Body:**
  ```json
  {
    "data_source": "data/resumes.json"
  }
  ```

### Search

- **POST** `/api/v2/search/ultra-fast`
- **Description:** Performs a hybrid search query.
- **Body:**
  ```json
  {
    "query": "your search query",
    "num_results": 10,
    "filters": {
      "min_experience": 5,
      "required_skills": ["Python", "AWS"]
    }
  }
  ```

#### Example Search Queries

- **Simple search:**
  ```bash
  curl -X POST -H "Content-Type: application/json" -d "{\"query\": \"python developer\"}" http://localhost/api/v2/search/ultra-fast
  ```

- **Search with filters:**
  ```bash
  curl -X POST -H "Content-Type: application/json" -d "{\"query\": \"senior engineer with java and kubernetes\", \"filters\": {\"min_experience\": 7}}" http://localhost/api/v2/search/ultra-fast
  ```

### Get Performance Stats

- **GET** `/api/v2/search/performance`
- **Description:** Retrieves performance statistics about the search engine.