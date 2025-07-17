# Developer Onboarding Guide

Welcome to the Ultra-Fast Data Analysis System project! This guide will help you get up to speed with the codebase, architecture, and development workflow.

## 1. Project Overview

This system is a high-performance search and data analysis engine designed for sub-second response times on large datasets. It uses a hybrid search model, combining vector-based semantic search with traditional keyword-based search to deliver highly relevant results.

**Key Goals:**

-   **Performance:** Achieve sub-second query latency.
-   **Scalability:** Efficiently handle datasets with over 100,000 documents.
-   **Accuracy:** Provide highly relevant and accurate search results.

## 2. Getting Started: Development Environment

We use Docker for development to ensure a consistent and reproducible environment. Please make sure you have **Docker** and **Docker Compose** installed.

1.  **Clone the repository or download the files.**

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
    ```bash
    docker-compose up --build
    ```
    This will start the FastAPI application and the Nginx proxy. The application code is mounted as a volume, so changes you make to the code will be automatically reflected in the running container.

5.  **Build the initial search indexes:**
    The system will automatically load indexes if they exist. To build them for the first time, run this command in a separate terminal:
    ```bash
    curl -X POST -H "Content-Type: application/json" -d "{\"data_source\": \"data/resumes.json\"}" http://localhost/api/v2/admin/build-indexes
    ```

## 3. Project Structure

```
.ultra_fast_search_system/
├── app/ # Main application source code
│   ├── api/ # FastAPI endpoints
│   ├── config.py # Configuration management
│   ├── logger.py # Logging configuration
│   ├── math/ # Core mathematical algorithms
│   ├── processing/ # Batch processing logic
│   ├── search/ # Search engine implementation
│   └── main.py # FastAPI application entry point
├── data/ # Sample data
├── indexes/ # Saved search indexes
├── tests/ # Pytest test suite
├── .env # Environment variables
├── .env.example # Example environment variables
├── Dockerfile # Defines the production Docker image
├── docker-compose.yml # Orchestrates the environment
├── nginx.conf # Nginx configuration
├── requirements.txt # Python dependencies
└── README.md # Project overview
```

## 4. Core Components

### a. `ultra_fast_engine.py`

This is the heart of the system. The `UltraFastSearchEngine` class orchestrates the entire search process, from building and saving indexes to executing queries.

### b. Configuration (`app/config.py` and `.env`)

Application settings are managed via the `Settings` class in `app/config.py`, which loads values from the `.env` file. This allows for easy configuration without modifying the source code.

### c. Index Persistence

The `UltraFastSearchEngine` now includes `save_indexes` and `load_indexes` methods. After a successful build, the indexes are saved to the directory specified by the `INDEX_PATH` in your `.env` file. On startup, the application will load these indexes if they exist.

### d. Logging (`app/logger.py`)

We use Python's built-in `logging` module for structured logging. All `print` statements have been replaced with logger calls, providing more informative output for monitoring and debugging.

## 5. Development Workflow

1.  **Make your changes:** Modify the code in the `app/` directory.
2.  **Automatic Reloading:** The `uvicorn` server running inside the Docker container is configured to automatically reload when it detects code changes.
3.  **Testing:**
    -   **Run the test suite:** We use `pytest` for testing. To run the tests, execute the following command from the project root:
        ```bash
        pytest
        ```
    -   **Adding new tests:** Add new test files and functions to the `tests/` directory.
4.  **Linting and Formatting:** Please adhere to the PEP 8 style guide. We recommend using a linter like `flake8` or `ruff`.

## 6. Key Technologies

-   **Python 3.11**
-   **FastAPI:** For building the high-performance API.
-   **Pydantic:** For data validation and settings management.
-   **Faiss:** The core library for HNSW and Product Quantization.
-   **Sentence-Transformers:** For state-of-the-art text embeddings.
-   **Pytest:** For testing the application.
-   **Docker & Docker Compose:** For containerization and deployment.

---

Thank you for contributing to the Ultra-Fast Data Analysis System! If you have any questions, please don't hesitate to ask.