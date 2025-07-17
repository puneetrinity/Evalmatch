from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import asyncio
import os
import json
import logging
from contextlib import asynccontextmanager
import uuid
from datetime import datetime
import io

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Log environment variables for debugging
logger.info(f"PORT environment variable: {os.getenv('PORT', 'NOT SET')}")
logger.info(f"PYTHON_ENV: {os.getenv('PYTHON_ENV', 'NOT SET')}")
logger.info(f"EMBEDDING_DIM: {os.getenv('EMBEDDING_DIM', 'NOT SET')}")
logger.info(f"USE_GPU: {os.getenv('USE_GPU', 'NOT SET')}")
logger.info(f"INDEX_PATH: {os.getenv('INDEX_PATH', 'NOT SET')}")
logger.info(f"UPLOAD_PATH: {os.getenv('UPLOAD_PATH', 'NOT SET')}")

# Global search engine instance
search_engine = None

# Import ML components
try:
    from app.search.ultra_fast_engine import UltraFastSearchEngine
    from app.config import settings
    ML_AVAILABLE = True
    logger.info("ML components loaded successfully")
except ImportError as e:
    logger.error(f"ML components not available: {e}")
    ML_AVAILABLE = False

# Pydantic models
class DocumentUpload(BaseModel):
    name: str
    title: str
    description: str
    skills: List[str] = []
    technologies: List[str] = []
    experience_years: int = 0
    seniority_level: str = "junior"
    experience: str = ""
    projects: str = ""

class SearchRequest(BaseModel):
    query: str
    num_results: int = 10
    filters: Optional[Dict] = None

class SearchResponse(BaseModel):
    query: str
    results: List[Dict]
    total_found: int
    response_time_ms: float
    search_engine_status: str

class BulkUploadResponse(BaseModel):
    processed: int
    failed: int
    errors: List[str]

# Global document storage
documents_store = {}

async def initialize_search_engine():
    """Initialize the ML search engine"""
    global search_engine
    
    if not ML_AVAILABLE:
        logger.warning("ML components not available, using mock search")
        return None
    
    try:
        # Get configuration from environment
        embedding_dim = int(os.getenv('EMBEDDING_DIM', '384'))
        use_gpu = os.getenv('USE_GPU', 'false').lower() == 'true'
        
        logger.info(f"Initializing search engine with embedding_dim={embedding_dim}, use_gpu={use_gpu}")
        
        # Initialize search engine
        search_engine = UltraFastSearchEngine(
            embedding_dim=embedding_dim,
            use_gpu=use_gpu
        )
        
        # Load sample data if available
        await load_sample_data()
        
        logger.info("Search engine initialized successfully")
        return search_engine
        
    except Exception as e:
        logger.error(f"Failed to initialize search engine: {e}")
        return None

async def load_sample_data():
    """Load sample data for demonstration"""
    global search_engine, documents_store
    
    if search_engine is None:
        return
    
    try:
        # Sample documents for demonstration
        sample_docs = [
            {
                "id": "doc1",
                "name": "John Doe",
                "title": "Senior Software Engineer",
                "description": "Experienced full-stack developer with expertise in Python, JavaScript, and cloud technologies",
                "skills": ["Python", "JavaScript", "React", "Node.js", "AWS", "Docker"],
                "technologies": ["FastAPI", "PostgreSQL", "Redis", "Kubernetes"],
                "experience_years": 8,
                "seniority_level": "senior",
                "experience": "8 years developing scalable web applications and microservices",
                "projects": "Built e-commerce platform serving 1M+ users, developed ML recommendation system"
            },
            {
                "id": "doc2", 
                "name": "Jane Smith",
                "title": "Data Scientist",
                "description": "ML engineer specializing in NLP and computer vision with strong Python background",
                "skills": ["Python", "Machine Learning", "TensorFlow", "PyTorch", "NLP"],
                "technologies": ["Jupyter", "Pandas", "NumPy", "Scikit-learn", "BERT"],
                "experience_years": 5,
                "seniority_level": "mid",
                "experience": "5 years in ML research and production ML systems",
                "projects": "Developed chatbot with 95% accuracy, built image classification system"
            },
            {
                "id": "doc3",
                "name": "Mike Johnson", 
                "title": "DevOps Engineer",
                "description": "Cloud infrastructure specialist with expertise in automation and monitoring",
                "skills": ["DevOps", "Kubernetes", "Docker", "Terraform", "AWS", "Python"],
                "technologies": ["Jenkins", "Prometheus", "Grafana", "ELK Stack"],
                "experience_years": 6,
                "seniority_level": "senior",
                "experience": "6 years managing cloud infrastructure and CI/CD pipelines",
                "projects": "Migrated legacy systems to cloud, reduced deployment time by 80%"
            }
        ]
        
        # Store documents
        for doc in sample_docs:
            documents_store[doc['id']] = doc
        
        # Build search indexes
        await search_engine.build_indexes(sample_docs)
        
        logger.info(f"Loaded {len(sample_docs)} sample documents and built indexes")
        
    except Exception as e:
        logger.error(f"Failed to load sample data: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    logger.info("Starting Ultra-Fast Search System (Full ML Edition)...")
    logger.info(f"Starting on Fly.io with PORT: {os.getenv('PORT', '8000')}")
    
    # Initialize search engine
    await initialize_search_engine()
    
    # Create storage directories
    try:
        index_path = os.getenv('INDEX_PATH', '/app/data/indexes')
        data_path = os.getenv('UPLOAD_PATH', '/app/data/uploads')
        
        os.makedirs(index_path, exist_ok=True)
        os.makedirs(data_path, exist_ok=True)
        os.makedirs('/app/data', exist_ok=True)
        
        logger.info(f"Storage directories created: {index_path}, {data_path}")
    except Exception as e:
        logger.error(f"Failed to create directories: {e}")
    
    yield
    
    logger.info("Shutting down Ultra-Fast Search System...")

# Create FastAPI app
app = FastAPI(
    title="Ultra-Fast Search System",
    description="High-performance ML search engine with RAG capabilities - Full ML Edition",
    version="2.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
app.mount("/static", StaticFiles(directory="app/static"), name="static")

# UI endpoint
@app.get("/ui")
async def ui():
    html_content = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ML Search System</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            background: white;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
            text-align: center;
            margin-bottom: 30px;
        }
        .search-box {
            display: flex;
            gap: 10px;
            margin-bottom: 30px;
        }
        input[type="text"] {
            flex: 1;
            padding: 12px;
            border: 2px solid #ddd;
            border-radius: 6px;
            font-size: 16px;
        }
        button {
            padding: 12px 24px;
            background: #007bff;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 16px;
        }
        button:hover {
            background: #0056b3;
        }
        .results {
            margin-top: 20px;
        }
        .result-item {
            background: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 6px;
            padding: 20px;
            margin-bottom: 15px;
        }
        .result-name {
            font-size: 18px;
            font-weight: bold;
            color: #333;
            margin-bottom: 5px;
        }
        .result-title {
            color: #666;
            font-size: 14px;
            margin-bottom: 10px;
        }
        .result-description {
            margin-bottom: 10px;
            line-height: 1.5;
        }
        .result-skills {
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
            margin-bottom: 10px;
        }
        .skill-tag {
            background: #e7f3ff;
            color: #0066cc;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
        }
        .result-meta {
            font-size: 12px;
            color: #888;
            display: flex;
            gap: 15px;
        }
        .upload-form {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 6px;
            margin-top: 30px;
        }
        .form-row {
            display: flex;
            gap: 15px;
            margin-bottom: 15px;
        }
        .form-group {
            flex: 1;
        }
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: 500;
        }
        input, select, textarea {
            width: 100%;
            padding: 8px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
        }
        textarea {
            height: 60px;
            resize: vertical;
        }
        .loading {
            text-align: center;
            padding: 20px;
            color: #666;
        }
        .error {
            background: #f8d7da;
            color: #721c24;
            padding: 10px;
            border-radius: 4px;
            margin: 10px 0;
        }
        .success {
            background: #d4edda;
            color: #155724;
            padding: 10px;
            border-radius: 4px;
            margin: 10px 0;
        }
        .stats {
            background: #e9ecef;
            padding: 15px;
            border-radius: 6px;
            margin-bottom: 20px;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔍 ML Search System</h1>
        
        <div class="stats" id="stats">
            Loading system status...
        </div>

        <div class="search-box">
            <input type="text" id="searchQuery" placeholder="Search for skills, technologies, experience..." />
            <button onclick="search()">Search</button>
        </div>

        <div id="results" class="results"></div>

        <div class="upload-form">
            <h3>📋 Add New Profile</h3>
            <div class="form-row">
                <div class="form-group">
                    <label>Name</label>
                    <input type="text" id="name" placeholder="John Doe" />
                </div>
                <div class="form-group">
                    <label>Title</label>
                    <input type="text" id="title" placeholder="Senior Software Engineer" />
                </div>
            </div>
            <div class="form-group">
                <label>Description</label>
                <textarea id="description" placeholder="Brief description of expertise and background"></textarea>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Skills (comma-separated)</label>
                    <input type="text" id="skills" placeholder="Python, JavaScript, React, Node.js" />
                </div>
                <div class="form-group">
                    <label>Technologies (comma-separated)</label>
                    <input type="text" id="technologies" placeholder="Docker, Kubernetes, AWS, PostgreSQL" />
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Experience Years</label>
                    <input type="number" id="experience_years" min="0" max="50" value="3" />
                </div>
                <div class="form-group">
                    <label>Seniority Level</label>
                    <select id="seniority_level">
                        <option value="junior">Junior</option>
                        <option value="mid">Mid-level</option>
                        <option value="senior">Senior</option>
                        <option value="lead">Lead</option>
                        <option value="principal">Principal</option>
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label>Experience Details</label>
                <textarea id="experience" placeholder="Detailed experience description"></textarea>
            </div>
            <div class="form-group">
                <label>Notable Projects</label>
                <textarea id="projects" placeholder="Key projects and achievements"></textarea>
            </div>
            <button onclick="addProfile()" style="width: 100%; margin-top: 10px;">Add Profile</button>
            <div id="uploadStatus"></div>
        </div>
    </div>

    <script>
        const API_BASE = '';

        // Load system stats on page load
        window.onload = function() {
            loadStats();
            // Allow Enter key to trigger search
            document.getElementById('searchQuery').addEventListener('keypress', function(e) {
                if (e.key === 'Enter') search();
            });
        };

        async function loadStats() {
            try {
                const response = await fetch(`${API_BASE}/api/status`);
                const data = await response.json();
                document.getElementById('stats').innerHTML = `
                    📊 System: ${data.system} | 
                    🔍 Search Engine: ${data.search_engine} | 
                    📚 Documents: ${data.documents.total_indexed} | 
                    🧠 ML: ${data.ml_components.sentence_transformers ? 'Active' : 'Fallback'}
                `;
            } catch (error) {
                document.getElementById('stats').innerHTML = '⚠️ Unable to load system status';
            }
        }

        async function search() {
            const query = document.getElementById('searchQuery').value.trim();
            if (!query) return;

            const resultsDiv = document.getElementById('results');
            resultsDiv.innerHTML = '<div class="loading">🔍 Searching...</div>';

            try {
                const response = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}&limit=20`);
                const data = await response.json();

                if (data.results.length === 0) {
                    resultsDiv.innerHTML = '<div class="loading">No results found. Try different keywords.</div>';
                    return;
                }

                resultsDiv.innerHTML = `
                    <h3>🎯 Found ${data.total_found} result(s) in ${data.response_time_ms}ms</h3>
                    ${data.results.map(result => `
                        <div class="result-item">
                            <div class="result-name">${result.name}</div>
                            <div class="result-title">${result.title}</div>
                            <div class="result-description">${result.description}</div>
                            <div class="result-skills">
                                ${result.skills.map(skill => `<span class="skill-tag">${skill}</span>`).join('')}
                            </div>
                            <div class="result-meta">
                                <span>📅 ${result.experience_years} years</span>
                                <span>🎖️ ${result.seniority_level}</span>
                                <span>🔢 Score: ${result.scores?.combined || 'N/A'}</span>
                            </div>
                        </div>
                    `).join('')}
                `;
            } catch (error) {
                resultsDiv.innerHTML = '<div class="error">❌ Search failed. Please try again.</div>';
            }
        }

        async function addProfile() {
            const profile = {
                name: document.getElementById('name').value.trim(),
                title: document.getElementById('title').value.trim(),
                description: document.getElementById('description').value.trim(),
                skills: document.getElementById('skills').value.split(',').map(s => s.trim()).filter(s => s),
                technologies: document.getElementById('technologies').value.split(',').map(s => s.trim()).filter(s => s),
                experience_years: parseInt(document.getElementById('experience_years').value) || 0,
                seniority_level: document.getElementById('seniority_level').value,
                experience: document.getElementById('experience').value.trim(),
                projects: document.getElementById('projects').value.trim()
            };

            if (!profile.name || !profile.title) {
                document.getElementById('uploadStatus').innerHTML = '<div class="error">Name and title are required</div>';
                return;
            }

            document.getElementById('uploadStatus').innerHTML = '<div class="loading">⬆️ Uploading...</div>';

            try {
                const response = await fetch(`${API_BASE}/api/documents`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(profile)
                });

                const data = await response.json();
                
                if (data.status === 'success') {
                    document.getElementById('uploadStatus').innerHTML = '<div class="success">✅ Profile added successfully!</div>';
                    // Clear form
                    ['name', 'title', 'description', 'skills', 'technologies', 'experience', 'projects'].forEach(id => {
                        document.getElementById(id).value = '';
                    });
                    document.getElementById('experience_years').value = '3';
                    document.getElementById('seniority_level').value = 'junior';
                    // Refresh stats
                    loadStats();
                } else {
                    throw new Error(data.message || 'Upload failed');
                }
            } catch (error) {
                document.getElementById('uploadStatus').innerHTML = '<div class="error">❌ Upload failed. Please try again.</div>';
            }
        }
    </script>
</body>
</html>"""
    from fastapi.responses import HTMLResponse
    return HTMLResponse(content=html_content)

# Root endpoint (API info)
@app.get("/api")
async def root():
    return {
        "message": "Ultra-Fast Search System - Full ML Edition",
        "version": "2.0.0",
        "status": "running",
        "port": os.getenv("PORT", "8000"),
        "environment": os.getenv("PYTHON_ENV", "development"),
        "ml_available": ML_AVAILABLE,
        "search_engine_ready": search_engine is not None,
        "documents_indexed": len(documents_store),
        "storage": {
            "index_path": os.getenv('INDEX_PATH', '/app/data/indexes'),
            "data_path": os.getenv('UPLOAD_PATH', '/app/data/uploads')
        }
    }

# Redirect root to UI
@app.get("/")
async def redirect_to_ui():
    """Serve the main UI from static files"""
    return FileResponse("app/static/index.html")

# Health check endpoint
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "environment": os.getenv("PYTHON_ENV", "development"),
        "ml_available": ML_AVAILABLE,
        "search_engine_ready": search_engine is not None,
        "documents_indexed": len(documents_store),
        "port": os.getenv("PORT", "8000")
    }

# Search endpoint
@app.post("/api/search")
async def search_documents(request: SearchRequest):
    """Advanced ML-powered search with filters and ranking"""
    
    if not ML_AVAILABLE or search_engine is None:
        # Fallback to basic search
        return await basic_search(request.query, request.num_results)
    
    try:
        import time
        start_time = time.time()
        
        # Perform ML search
        results = await search_engine.search(
            query=request.query,
            num_results=request.num_results,
            filters=request.filters
        )
        
        # Format results
        formatted_results = []
        for result in results:
            doc_data = documents_store.get(result.doc_id, {})
            formatted_results.append({
                "id": result.doc_id,
                "name": doc_data.get("name", "Unknown"),
                "title": doc_data.get("title", ""),
                "description": doc_data.get("description", ""),
                "skills": doc_data.get("skills", []),
                "technologies": doc_data.get("technologies", []),
                "experience_years": doc_data.get("experience_years", 0),
                "seniority_level": doc_data.get("seniority_level", "unknown"),
                "scores": {
                    "similarity": round(result.similarity_score, 3),
                    "bm25": round(result.bm25_score, 3),
                    "combined": round(result.combined_score, 3)
                }
            })
        
        response_time = (time.time() - start_time) * 1000
        
        return SearchResponse(
            query=request.query,
            results=formatted_results,
            total_found=len(formatted_results),
            response_time_ms=round(response_time, 2),
            search_engine_status="ml_active"
        )
        
    except Exception as e:
        logger.error(f"Search failed: {e}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

# Basic search fallback
async def basic_search(query: str, limit: int = 10):
    """Basic search when ML is not available"""
    results = []
    
    # Simple text matching in stored documents
    for doc_id, doc in documents_store.items():
        text_to_search = f"{doc.get('name', '')} {doc.get('title', '')} {doc.get('description', '')} {' '.join(doc.get('skills', []))}"
        
        if query.lower() in text_to_search.lower():
            results.append({
                "id": doc_id,
                "name": doc.get("name", "Unknown"),
                "title": doc.get("title", ""),
                "description": doc.get("description", ""),
                "skills": doc.get("skills", []),
                "technologies": doc.get("technologies", []),
                "experience_years": doc.get("experience_years", 0),
                "seniority_level": doc.get("seniority_level", "unknown"),
                "scores": {
                    "similarity": 0.8,
                    "bm25": 0.7,
                    "combined": 0.75
                }
            })
    
    return SearchResponse(
        query=query,
        results=results[:limit],
        total_found=len(results),
        response_time_ms=10.0,
        search_engine_status="basic_fallback"
    )

# GET search endpoint for backward compatibility
@app.get("/api/search")
async def search_get(
    q: str = Query(..., description="Search query"),
    limit: int = Query(10, description="Number of results to return"),
    min_experience: Optional[int] = Query(None, description="Minimum years of experience"),
    seniority_level: Optional[str] = Query(None, description="Seniority level filter")
):
    """GET endpoint for search with query parameters"""
    
    filters = {}
    if min_experience is not None:
        filters["min_experience"] = min_experience
    if seniority_level is not None:
        filters["seniority_levels"] = [seniority_level]
    
    request = SearchRequest(
        query=q,
        num_results=limit,
        filters=filters if filters else None
    )
    
    return await search_documents(request)

# Document upload endpoint
@app.post("/api/documents")
async def upload_document(document: DocumentUpload, background_tasks: BackgroundTasks):
    """Upload a single document and index it"""
    
    try:
        # Generate unique ID
        doc_id = str(uuid.uuid4())
        
        # Convert to internal format
        doc_data = {
            "id": doc_id,
            "name": document.name,
            "title": document.title,
            "description": document.description,
            "skills": document.skills,
            "technologies": document.technologies,
            "experience_years": document.experience_years,
            "seniority_level": document.seniority_level,
            "experience": document.experience,
            "projects": document.projects,
            "created_at": datetime.now().isoformat()
        }
        
        # Store document
        documents_store[doc_id] = doc_data
        
        # Rebuild indexes in background if ML is available
        if ML_AVAILABLE and search_engine is not None:
            background_tasks.add_task(rebuild_indexes)
        
        return {
            "status": "success",
            "document_id": doc_id,
            "message": "Document uploaded and indexed successfully"
        }
        
    except Exception as e:
        logger.error(f"Document upload failed: {e}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

# Bulk upload endpoint
@app.post("/api/documents/bulk")
async def bulk_upload(
    file: UploadFile = File(..., description="JSON file containing documents array"),
    background_tasks: BackgroundTasks = None
):
    """Bulk upload documents from JSON file"""
    
    try:
        # Read and parse JSON file
        content = await file.read()
        data = json.loads(content)
        
        if not isinstance(data, list):
            raise HTTPException(status_code=400, detail="JSON file must contain an array of documents")
        
        processed = 0
        failed = 0
        errors = []
        
        for i, doc_data in enumerate(data):
            try:
                # Generate unique ID
                doc_id = str(uuid.uuid4())
                
                # Add metadata
                doc_data["id"] = doc_id
                doc_data["created_at"] = datetime.now().isoformat()
                
                # Store document
                documents_store[doc_id] = doc_data
                processed += 1
                
            except Exception as e:
                failed += 1
                errors.append(f"Document {i}: {str(e)}")
        
        # Rebuild indexes in background if ML is available
        if ML_AVAILABLE and search_engine is not None and processed > 0:
            background_tasks.add_task(rebuild_indexes)
        
        return BulkUploadResponse(
            processed=processed,
            failed=failed,
            errors=errors
        )
        
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON file")
    except Exception as e:
        logger.error(f"Bulk upload failed: {e}")
        raise HTTPException(status_code=500, detail=f"Bulk upload failed: {str(e)}")

# File upload endpoint for various document types
@app.post("/api/documents/upload")
async def upload_file(
    file: UploadFile = File(..., description="Document file (PDF, DOCX, XLSX, TXT, etc.)"),
    title: Optional[str] = Form(None, description="Document title"),
    description: Optional[str] = Form(None, description="Document description"),
    tags: Optional[str] = Form("", description="Comma-separated tags"),
    background_tasks: BackgroundTasks = None
):
    """Upload and process document files (PDF, DOCX, XLSX, TXT, HTML, etc.)"""
    
    try:
        # Validate file
        if not file.filename:
            raise HTTPException(status_code=400, detail="No filename provided")
        
        # Check file size (50MB limit)
        file_content = await file.read()
        if len(file_content) > 50 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File too large (max 50MB)")
        
        # Detect file type from filename
        from pathlib import Path
        file_ext = Path(file.filename).suffix.lower()
        
        # Initialize document processor
        try:
            from app.rag.models import DocumentProcessor
            processor = DocumentProcessor()
            
            # Check if file type is supported
            if file_ext not in processor.supported_types:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Unsupported file type: {file_ext}. Supported types: {', '.join(processor.supported_types)}"
                )
            
            # Process document
            document = processor.process_document(
                content=file_content,
                filename=file.filename,
                content_type=file_ext
            )
            
            # Generate unique ID
            doc_id = str(uuid.uuid4())
            
            # Parse tags
            tag_list = [tag.strip() for tag in tags.split(",") if tag.strip()] if tags else []
            
            # Create document entry for search
            doc_data = {
                "id": doc_id,
                "name": title or file.filename,
                "title": title or file.filename,
                "description": document.content,  # Extracted text content
                "filename": file.filename,
                "file_type": file_ext,
                "file_size": len(file_content),
                "tags": tag_list,
                "skills": [],  # Can be enhanced with NLP extraction later
                "technologies": [],  # Can be enhanced with NLP extraction later
                "experience_years": 0,
                "seniority_level": "unknown",
                "experience": "",
                "projects": "",
                "upload_type": "file",
                "created_at": datetime.now().isoformat()
            }
            
            # Store document
            documents_store[doc_id] = doc_data
            
            # Rebuild indexes in background if ML is available
            if ML_AVAILABLE and search_engine is not None:
                background_tasks.add_task(rebuild_indexes)
            
            return {
                "status": "success",
                "document_id": doc_id,
                "filename": file.filename,
                "file_type": file_ext,
                "file_size": len(file_content),
                "content_length": len(document.content),
                "message": f"File '{file.filename}' uploaded and processed successfully"
            }
            
        except ImportError:
            # Fallback if RAG models not available
            raise HTTPException(status_code=503, detail="Document processing not available")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"File upload failed: {e}")
        raise HTTPException(status_code=500, detail=f"File upload failed: {str(e)}")

# Documents list endpoint
@app.get("/api/documents")
async def list_documents(
    limit: int = Query(50, description="Number of documents to return"),
    offset: int = Query(0, description="Number of documents to skip")
):
    """List all indexed documents"""
    
    docs_list = list(documents_store.values())
    total = len(docs_list)
    
    # Apply pagination
    paginated_docs = docs_list[offset:offset + limit]
    
    return {
        "documents": paginated_docs,
        "total": total,
        "limit": limit,
        "offset": offset
    }

# Get single document
@app.get("/api/documents/{doc_id}")
async def get_document(doc_id: str):
    """Get a specific document by ID"""
    
    if doc_id not in documents_store:
        raise HTTPException(status_code=404, detail="Document not found")
    
    return documents_store[doc_id]

# Delete document
@app.delete("/api/documents/{doc_id}")
async def delete_document(doc_id: str, background_tasks: BackgroundTasks):
    """Delete a document and rebuild indexes"""
    
    if doc_id not in documents_store:
        raise HTTPException(status_code=404, detail="Document not found")
    
    del documents_store[doc_id]
    
    # Rebuild indexes in background if ML is available
    if ML_AVAILABLE and search_engine is not None:
        background_tasks.add_task(rebuild_indexes)
    
    return {"status": "success", "message": "Document deleted successfully"}

# System status endpoint
@app.get("/api/status")
async def system_status():
    """Get comprehensive system status"""
    
    status = {
        "system": "operational",
        "search_engine": "ml_active" if (ML_AVAILABLE and search_engine is not None) else "basic_fallback",
        "ml_components": {
            "sentence_transformers": ML_AVAILABLE,
            "faiss": ML_AVAILABLE,
            "search_engine_initialized": search_engine is not None
        },
        "storage": {
            "index_path": os.getenv('INDEX_PATH', '/app/data/indexes'),
            "data_path": os.getenv('UPLOAD_PATH', '/app/data/uploads')
        },
        "documents": {
            "total_indexed": len(documents_store),
            "storage_type": "in_memory"
        },
        "features": [
            "ml_search",
            "document_upload",
            "bulk_upload", 
            "filtering",
            "scoring",
            "health_check",
            "status"
        ],
        "environment": os.getenv("PYTHON_ENV", "development")
    }
    
    # Add performance stats if ML engine is available
    if search_engine is not None:
        try:
            performance_stats = search_engine.get_performance_stats()
            status["performance"] = performance_stats
        except Exception as e:
            logger.warning(f"Failed to get performance stats: {e}")
    
    return status

# Performance stats endpoint
@app.get("/api/performance")
async def get_performance_stats():
    """Get detailed performance statistics"""
    
    if not ML_AVAILABLE or search_engine is None:
        return {"error": "ML search engine not available"}
    
    try:
        stats = search_engine.get_performance_stats()
        return {
            "search_performance": stats,
            "system_info": {
                "documents_indexed": len(documents_store),
                "ml_available": ML_AVAILABLE,
                "search_engine_ready": search_engine is not None
            }
        }
    except Exception as e:
        logger.error(f"Failed to get performance stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to get performance stats")

# Rebuild indexes endpoint
@app.post("/api/rebuild-indexes")
async def rebuild_indexes_endpoint(background_tasks: BackgroundTasks):
    """Manually trigger index rebuilding"""
    
    if not ML_AVAILABLE or search_engine is None:
        raise HTTPException(status_code=400, detail="ML search engine not available")
    
    background_tasks.add_task(rebuild_indexes)
    
    return {
        "status": "success", 
        "message": "Index rebuild started in background",
        "documents_to_index": len(documents_store)
    }

# Background task for rebuilding indexes
async def rebuild_indexes():
    """Background task to rebuild search indexes"""
    
    if search_engine is None or not documents_store:
        return
    
    try:
        logger.info(f"Rebuilding indexes for {len(documents_store)} documents...")
        
        documents_list = list(documents_store.values())
        await search_engine.build_indexes(documents_list)
        
        logger.info("Index rebuilding completed successfully")
        
    except Exception as e:
        logger.error(f"Index rebuilding failed: {e}")

# Duplicate health endpoint removed - using the one at line 914

# Test endpoint for development
@app.get("/api/test")
async def test_endpoint():
    """Test endpoint for development and debugging"""
    
    return {
        "message": "Test endpoint working",
        "ml_available": ML_AVAILABLE,
        "search_engine_ready": search_engine is not None,
        "documents_count": len(documents_store),
        "sample_document_ids": list(documents_store.keys())[:5]
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("app.main_ml_full:app", host="0.0.0.0", port=port, reload=False)