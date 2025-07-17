# Multi-stage build for production ML app
FROM python:3.11-slim as builder

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    libgomp1 \
    libopenblas-dev \
    libblas-dev \
    liblapack-dev \
    gfortran \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip install --upgrade pip setuptools wheel

# Install core dependencies
RUN pip install --no-cache-dir \
    fastapi==0.104.1 \
    uvicorn[standard]==0.24.0 \
    pydantic==2.5.0 \
    pydantic-settings \
    python-multipart \
    numpy==1.25.2 \
    scipy==1.11.4 \
    scikit-learn==1.3.2

# Install ML dependencies
RUN pip install --no-cache-dir \
    torch==2.1.1+cpu --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir \
    transformers \
    huggingface_hub \
    sentence-transformers \
    faiss-cpu \
    mmh3 \
    numba \
    PyPDF2 \
    pdfplumber \
    python-docx \
    openpyxl \
    xlrd \
    python-magic \
    chardet

# Production stage
FROM python:3.11-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    libgomp1 \
    libopenblas0 \
    && rm -rf /var/lib/apt/lists/*

# Copy Python packages from builder
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

WORKDIR /app

# Copy application code (including updated UI with bulk upload)
COPY ./app /app/app

# Create directories for data and indexes
RUN mkdir -p /app/data/indexes /app/indexes /tmp/indexes /tmp/data

# Expose port
EXPOSE 8000

# Command to run the full ML search application
CMD ["sh", "-c", "uvicorn app.main_ml_full:app --host 0.0.0.0 --port ${PORT:-8000}"]