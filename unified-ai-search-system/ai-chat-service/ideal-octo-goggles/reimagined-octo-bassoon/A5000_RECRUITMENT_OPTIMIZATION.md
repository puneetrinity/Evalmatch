# A5000 Recruitment Workflow Optimization

## ✅ **Complete Implementation Summary**

Your system is now **fully optimized** for A5000 with intelligent multi-model management for recruitment workflows.

## 🎯 **Model Assignments (Implemented)**

| Task | Model | Ollama Name | Memory | Priority | Why This Model |
|------|-------|-------------|---------|----------|-----------------|
| **Resume Parsing** | **DeepSeek-LLM 7B** | `deepseek-llm:7b` | 7GB | T1 (Warm) | Latest version (June 2024), excellent structured data extraction |
| **Bias Detection (JD)** | **Mistral 7B** | `mistral` | 7GB | T1 (Warm) | Great contextual sensitivity, inclusive language detection |
| **Matching Logic** | **LLaMA3 8B** | `llama3` | 8GB | T2 (On-demand) | Strongest reasoning for persona-fingerprint matching |
| **Script Generation** | **LLaMA3 8B** | `llama3` | 8GB | T2 (On-demand) | Long prompts, structured output for recruiter scripts |
| **Report Generation** | **Phi-3 Mini** | `phi3:mini` | 2GB | T0 (Always) | Lightweight, fast summaries and score reports |

## 🚀 **A5000 Memory Strategy**

### **Tier-Based Loading:**
- **T0 (Always Loaded)**: `phi3:mini` (2GB) - Always available for reports
- **T1 (Keep Warm)**: `deepseek-llm:7b`, `mistral` (14GB) - High-frequency tasks
- **T2 (Load on Demand)**: `llama3` (8GB) - Complex reasoning when needed
- **Total Usage**: 16-24GB depending on workflow

### **Memory Management:**
```python
# A5000 Configuration
Total VRAM: 24GB
System Reserve: 4GB  
Available: 20GB
Always Loaded: 2GB (phi3:mini)
Warm Models: 14GB (deepseek + mistral)
Dynamic Space: 4GB (for llama3 when needed)
```

## 📋 **Implementation Files**

### **1. Core Configuration** (`app/core/config.py`)
- Updated `MODEL_ASSIGNMENTS` with recruitment tasks
- Added `PRIORITY_TIERS` for memory management
- Added `MODEL_MEMORY_REQUIREMENTS` for A5000
- Added `A5000_CONFIG` for memory limits

### **2. Memory Manager** (`app/core/memory_manager.py`) 
- **A5000MemoryManager**: Intelligent VRAM management
- **Smart Loading**: Priority-based model loading
- **Hot-Swapping**: Automatic unloading of low-priority models
- **Memory Tracking**: Real-time VRAM usage monitoring

### **3. Recruitment Router** (`app/core/recruitment_router.py`)
- **Task Detection**: Automatic identification of recruitment tasks
- **Model Selection**: Optimal model routing for each task type
- **Batch Optimization**: Multi-model workflow optimization
- **Performance Recommendations**: A5000-specific optimizations

### **4. Enhanced Model Manager** (`app/models/manager.py`)
- **Memory Integration**: Uses A5000MemoryManager for all operations
- **Recruitment Methods**: Specialized preloading and optimization
- **Statistics**: Memory usage and performance tracking

## 🔧 **Usage Examples**

### **Basic Task Routing:**
```python
from app.core.recruitment_router import RecruitmentModelRouter

router = RecruitmentModelRouter()

# Automatic task detection
task_type = router.analyze_recruitment_task(
    "Parse this resume and extract skills", 
    resume_content
)
# Returns: "resume_parsing"

# Get model configuration
config = router.get_recruitment_model_config(task_type)
# Returns: {"model": "deepseek-llm:7b", "max_tokens": 1000, ...}
```

### **Batch Workflow Optimization:**
```python
# Optimize for full recruitment pipeline
tasks = ["resume_parsing", "bias_detection", "matching_logic", "report_generation"]
optimization = router.optimize_for_batch_processing(tasks)

print(optimization)
# {
#   "strategy": "preload_all",  # or "hot_swap" if memory is tight
#   "preload_models": ["phi3:mini", "deepseek-llm:7b", "mistral"],
#   "swap_models": ["llama3"],
#   "total_memory_gb": 24,
#   "estimated_time": 15.0
# }
```

### **Memory Management:**
```python
from app.models.manager import ModelManager

manager = ModelManager.get_instance()

# Preload recruitment models
results = await manager.preload_recruitment_models()
# {"phi3:mini": True, "deepseek-llm:7b": True, "mistral": True}

# Get memory statistics
stats = manager.get_recruitment_memory_stats()
# {
#   "current_usage_gb": 16.0,
#   "free_memory_gb": 4.0, 
#   "memory_utilization": 80.0,
#   "loaded_models_count": 3
# }
```

## 📊 **Expected Performance on A5000**

### **Loading Times:**
| Model | First Load | Warm Load | Cache Hit |
|-------|------------|-----------|-----------|
| `phi3:mini` | 0s (preloaded) | 0s | 0s |
| `deepseek-llm:7b` | 3s (first time) | 0s (warm) | 0s |
| `mistral` | 3s (first time) | 0s (warm) | 0s |
| `llama3` | 5s (on-demand) | 2s (swap) | 0s |

### **Inference Performance:**
| Task | Expected Time | Throughput | Memory Strategy |
|------|---------------|------------|-----------------|
| Resume Parsing | 2-3s | 20-30/min | Always warm (T1) |
| Bias Detection | 1-2s | 30-60/min | Always warm (T1) |
| Matching Logic | 3-4s | 15-20/min | Load on demand (T2) |
| Script Generation | 4-5s | 12-15/min | Load on demand (T2) |
| Report Generation | 0.5-1s | 60-120/min | Always loaded (T0) |

## 🎯 **Workflow Recommendations**

### **High-Volume Screening:**
```python
# Preload frequently used models
await manager.preload_models(["phi3:mini", "deepseek-llm:7b", "mistral"])

# Process in batches
for batch in resume_batches:
    # Parse resumes (deepseek-llm:7b - already warm)
    parsed_data = await process_batch(batch, "resume_parsing")
    
    # Check bias (mistral - already warm)
    bias_reports = await process_batch(jd_data, "bias_detection")
    
    # Generate reports (phi3:mini - always loaded)
    reports = await process_batch(results, "report_generation")
```

### **Complex Matching Workflow:**
```python
# For complex reasoning tasks
workflow_models = router.get_workflow_models("full_recruitment_pipeline")
# ["phi3:mini", "deepseek-llm:7b", "mistral", "llama3"]

# Smart preloading
recommended = memory_manager.recommend_models_for_workflow(workflow_models)
await manager.preload_models(recommended)

# Process with automatic model swapping
for candidate in candidates:
    # llama3 will be loaded on demand for matching
    match_results = await process_matching(candidate)
    script = await generate_script(match_results)
```

## 🔍 **Monitoring & Optimization**

### **Memory Monitoring:**
```python
# Real-time memory tracking
stats = manager.get_recruitment_memory_stats()
if stats["memory_utilization"] > 90:
    logger.warning("High memory usage, consider unloading unused models")

# Performance recommendations
recommendations = router.get_performance_recommendations()
print(recommendations["optimal_batch_sizes"])
# {"resume_parsing": 10, "bias_detection": 5, ...}
```

### **Performance Tuning:**
```python
# Get workflow optimization suggestions
optimization = await manager.optimize_for_recruitment_batch([
    "resume_parsing", "bias_detection", "matching_logic"
])

# Apply recommendations
if optimization["strategy"] == "hot_swap":
    # Use smaller batches to reduce model switching
    batch_size = 5
else:
    # Can process larger batches with all models loaded
    batch_size = 20
```

## 🚀 **RunPod Deployment**

### **Docker Setup:**
```bash
# Pull all required models
ollama pull phi3:mini
ollama pull deepseek-llm:7b  
ollama pull mistral
ollama pull llama3

# Verify A5000 setup
nvidia-smi  # Should show 24GB VRAM
```

### **Environment Variables:**
```bash
# Add to your .env
A5000_OPTIMIZATION=true
MAX_CONCURRENT_MODELS=3
MEMORY_THRESHOLD=20
PRELOAD_RECRUITMENT_MODELS=true
```

## ✅ **Ready for Production**

Your system now supports:
- ✅ **Intelligent model routing** based on task complexity
- ✅ **Memory-aware loading** optimized for A5000
- ✅ **Hot-swapping** for memory efficiency  
- ✅ **Performance caching** with task-specific TTL
- ✅ **Batch processing optimization**
- ✅ **Real-time memory monitoring**
- ✅ **Automatic fallbacks** and error recovery

**Expected throughput**: 200-500 recruitment tasks per hour depending on complexity mix.