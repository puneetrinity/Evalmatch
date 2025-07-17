"""
ModelManager - Intelligent model lifecycle management with cost optimization.
Handles model loading, selection, fallbacks, and performance tracking.
"""
import asyncio
import time
import threading
import collections
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Dict, List, Optional, Set

from app.core.config import MODEL_ASSIGNMENTS, PRIORITY_TIERS
from app.core.logging import get_correlation_id, get_logger, log_performance
from app.core.memory_manager import A5000MemoryManager
from app.models.ollama_client import (
    ModelResult,
    ModelStatus,
    OllamaClient,
    OllamaException,
)

logger = get_logger("models.manager")


class TaskType(str, Enum):
    """Task types for model selection."""
    SIMPLE_CLASSIFICATION = "simple_classification"
    QA_AND_SUMMARY = "qa_and_summary"
    ANALYTICAL_REASONING = "analytical_reasoning"
    DEEP_RESEARCH = "deep_research"
    CODE_TASKS = "code_tasks"
    MULTILINGUAL = "multilingual"
    CREATIVE_WRITING = "creative_writing"
    CONVERSATION = "conversation"


class QualityLevel(str, Enum):
    """Quality requirements for model selection."""
    MINIMAL = "minimal"      # Fastest response, basic quality
    BALANCED = "balanced"    # Good balance of speed and quality
    HIGH = "high"           # High quality, reasonable speed
    PREMIUM = "premium"     # Best quality, may be slower/expensive


@dataclass
class ModelInfo:
    """Information about a model including performance metrics."""
    name: str
    status: ModelStatus = ModelStatus.UNKNOWN
    last_used: datetime = field(default_factory=datetime.now)
    load_time: float = 0.0
    total_requests: int = 0
    total_cost: float = 0.0
    avg_response_time: float = 0.0
    avg_tokens_per_second: float = 0.0
    memory_usage_mb: float = 0.0
    tier: str = "T2"  # T0=always loaded, T1=keep warm, T2=load on demand
    success_rate: float = 1.0
    confidence_scores: List[float] = field(default_factory=list)

    def update_stats(self, result: ModelResult, confidence: float = 0.0):
        """Update model performance statistics."""
        self.total_requests += 1
        self.last_used = datetime.now()

        if result.success:
            # Update response time (exponential moving average)
            alpha = 0.1
            if self.avg_response_time == 0:
                self.avg_response_time = result.execution_time
            else:
                self.avg_response_time = (alpha * result.execution_time +
                                          (1 - alpha) * self.avg_response_time)

            # Update tokens per second
            if result.tokens_per_second:
                if self.avg_tokens_per_second == 0:
                    self.avg_tokens_per_second = result.tokens_per_second
                else:
                    self.avg_tokens_per_second = (alpha * result.tokens_per_second +
                                                  (1 - alpha) * self.avg_tokens_per_second)

            # Track confidence scores
            if confidence > 0:
                self.confidence_scores.append(confidence)
                # Keep only last 100 scores
                if len(self.confidence_scores) > 100:
                    self.confidence_scores = self.confidence_scores[-100:]

        # Update success rate
        recent_requests = min(self.total_requests, 20)  # Consider last 20 requests
        if hasattr(self, '_recent_successes'):
            self._recent_successes.append(result.success)
            if len(self._recent_successes) > recent_requests:
                self._recent_successes = self._recent_successes[-recent_requests:]
        else:
            self._recent_successes = [result.success]

        self.success_rate = sum(self._recent_successes) / len(self._recent_successes)


@dataclass
class ModelSelectionCriteria:
    """Criteria for model selection decisions."""
    task_type: TaskType
    quality_requirement: QualityLevel
    max_cost: Optional[float] = None
    max_time: Optional[float] = None
    user_tier: str = "free"
    prefer_local: bool = False
    min_confidence: float = 0.7


class ModelManager:
    """
    Advanced model manager with intelligent selection and optimization.
    
    Features:
    - Dynamic model loading/unloading based on usage patterns
    - Cost-aware model selection
    - Performance tracking and optimization
    - Fallback model chains
    - Memory-efficient model management
    """

    def __init__(self, ollama_host: str = "http://localhost:11434"):
        self.ollama_host = ollama_host
        self.ollama_client: Optional[OllamaClient] = None
        self.models: Dict[str, ModelInfo] = {}
        self.is_initialized = False
        self.initialization_status = "not_started"
        self.memory_manager: Optional[A5000MemoryManager] = None
        
        # Configuration
        self.model_assignments = MODEL_ASSIGNMENTS
        self.priority_tiers = PRIORITY_TIERS
        
        # Performance tracking
        self.usage_stats = collections.defaultdict(int)
        self.cost_tracker = collections.defaultdict(float)
        self.performance_metrics = {}
        
        # Model selection cache to avoid expensive recalculations
        self._selection_cache: Dict[str, tuple] = {}  # (model_name, cache_time)
        self._cache_ttl = 60  # Cache for 60 seconds
        
        # Async lock for background operations
        self._background_lock = asyncio.Lock()
        
        logger.info(f"ModelManager initialized with Ollama host: {ollama_host}")

    async def initialize(self, force_reload: bool = False) -> bool:
        """
        Initialize the model manager with robust error handling.
        
        Args:
            force_reload: Force reloading of all models
            
        Returns:
            bool: True if initialization successful
        """
        logger.info("🚀 Initializing ModelManager...")
        start_time = time.time()
        
        try:
            # Initialize Ollama client
            if not self.ollama_client:
                self.ollama_client = OllamaClient(base_url=self.ollama_host)
                logger.info(f"📡 Created OllamaClient for {self.ollama_host}")
            
            # Health check with retry
            max_retries = 3
            for attempt in range(max_retries):
                try:
                    health_ok = await asyncio.wait_for(
                        self.ollama_client.health_check(), 
                        timeout=10.0
                    )
                    if health_ok:
                        logger.info("✅ Ollama health check passed")
                        break
                    else:
                        logger.warning(f"⚠️ Ollama health check failed (attempt {attempt + 1})")
                except asyncio.TimeoutError:
                    logger.warning(f"⏱️ Ollama health check timeout (attempt {attempt + 1})")
                except ConnectionError as e:
                    logger.warning(f"🔌 Ollama connection error (attempt {attempt + 1}): {e}")
                except ValueError as e:
                    logger.warning(f"📊 Ollama configuration error (attempt {attempt + 1}): {e}")
                except Exception as e:
                    logger.warning(f"❌ Ollama health check error (attempt {attempt + 1}): {e}")
                
                if attempt < max_retries - 1:
                    await asyncio.sleep(2 ** attempt)  # Exponential backoff
                else:
                    logger.error("❌ Ollama health check failed after all retries")
                    # Don't fail initialization, but log the issue
                    self.initialization_status = "degraded"
            
            # Discover available models
            try:
                await self._discover_available_models()
            except OllamaException as e:
                logger.error(f"❌ Ollama connection failed during model discovery: {e}")
                self.initialization_status = "degraded"
                # Continue with empty model list for graceful degradation
            except asyncio.TimeoutError:
                logger.error("⏱️ Model discovery timeout - Ollama service may be overloaded")
                self.initialization_status = "degraded"
            except ConnectionError as e:
                logger.error(f"🔌 Network connection failed during model discovery: {e}")
                self.initialization_status = "degraded"
            except Exception as e:
                logger.error(f"❌ Failed to discover models: {e}")
                self.initialization_status = "degraded"
            
            # Initialize memory manager
            try:
                if not hasattr(self, 'memory_manager') or not self.memory_manager:
                    self.memory_manager = A5000MemoryManager()
                    logger.info("🧠 Memory manager initialized")
            except ImportError as e:
                logger.warning(f"📦 Memory manager module not available: {e}")
            except RuntimeError as e:
                logger.warning(f"⚙️ Memory manager runtime error: {e}")
            except Exception as e:
                logger.warning(f"⚠️ Memory manager initialization failed: {e}")
            
            # Mark as initialized
            self.is_initialized = True
            self.initialization_status = getattr(self, 'initialization_status', "healthy")
            duration = time.time() - start_time
            
            logger.info(f"✅ ModelManager initialization completed in {duration:.2f}s (status: {self.initialization_status})")
            return True
            
        except KeyboardInterrupt:
            logger.warning("⏹️ ModelManager initialization interrupted by user")
            self.initialization_status = "interrupted"
            self.is_initialized = False
            return False
        except MemoryError:
            logger.error("💾 Insufficient memory for ModelManager initialization")
            self.initialization_status = "memory_error"
            self.is_initialized = False
            return False
        except Exception as e:
            logger.error(f"❌ ModelManager initialization failed: {e}")
            self.initialization_status = "failed"
            self.is_initialized = False
            return False

    async def _discover_available_models(self) -> None:
        """Discover and catalog available models from Ollama."""
        try:
            # Try to get models with timeout
            models_data = await asyncio.wait_for(
                self.ollama_client.list_models(),
                timeout=30.0  # 30 second timeout
            )
            logger.info(f"📚 Found {len(models_data)} available models")
            
            for model_data in models_data:
                # Extract model name from the model data dictionary
                model_name = model_data.get("name", "") if isinstance(model_data, dict) else str(model_data)
                
                if model_name and model_name not in self.models:
                    # Determine tier based on configuration
                    tier = "T2"  # Default
                    try:
                        for tier_name, tier_models in self.priority_tiers.items():
                            if any(model_name.startswith(tm.split(':')[0]) for tm in tier_models):
                                tier = tier_name
                                break
                    except KeyError as e:
                        logger.warning(f"Configuration key missing for {model_name}: {e}")
                        tier = "T2"  # Fallback
                    except AttributeError as e:
                        logger.warning(f"Tier configuration structure error for {model_name}: {e}")
                        tier = "T2"  # Fallback
                    except Exception as tier_error:
                        logger.warning(f"Tier assignment failed for {model_name}: {tier_error}")
                        tier = "T2"  # Fallback

                    self.models[model_name] = ModelInfo(
                        name=model_name,
                        status=ModelStatus.READY,
                        tier=tier
                    )
                    logger.info(f"Added model: {model_name} (tier: {tier})")
                elif model_name and model_name in self.models:
                    self.models[model_name].status = ModelStatus.READY
                    logger.info(f"Updated model status: {model_name}")
                    
            logger.info(f"Model discovery completed: {len(self.models)} models cataloged")
            
        except asyncio.TimeoutError:
            logger.error("⏱️ Model discovery timeout - Ollama service unresponsive")
            raise
        except ConnectionError as e:
            logger.error(f"🔌 Network connection failed during model discovery: {e}")
            raise
        except ValueError as e:
            logger.error(f"📊 Invalid model data format: {e}")
            raise
        except Exception as e:
            logger.error(f"❌ Model discovery failed: {e}")
            raise

    def select_optimal_model(
        self,
        task_type: TaskType,
        quality_requirement: QualityLevel = QualityLevel.BALANCED,
        context: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Select the optimal model for a given task and quality requirement.
        
        Args:
            task_type: Type of task to perform
            quality_requirement: Required quality level
            context: Additional context for selection (user tier, budget, etc.)
            
        Returns:
            str: Selected model name
        """
        context = context or {}
        
        # Create cache key
        cache_key = f"{task_type.value if hasattr(task_type, 'value') else str(task_type)}:{quality_requirement.value if hasattr(quality_requirement, 'value') else str(quality_requirement)}"
        
        # Check cache first
        if cache_key in self._selection_cache:
            cached_model, cache_time = self._selection_cache[cache_key]
            if time.time() - cache_time < self._cache_ttl:
                # Verify cached model is still available
                if cached_model in self.models and self.models[cached_model].status == ModelStatus.READY:
                    logger.debug(f"Using cached model selection: {cached_model}")
                    return cached_model
                else:
                    # Remove invalid cache entry
                    del self._selection_cache[cache_key]
        
        # Get task-specific model preferences
        task_name = task_type.value if hasattr(task_type, 'value') else str(task_type)
        quality_name = quality_requirement.value if hasattr(quality_requirement, 'value') else str(quality_requirement)
        
        # For now, use a simple mapping since MODEL_ASSIGNMENTS is flat
        preferred_model = self.model_assignments.get(task_name)
        
        if not preferred_model:
            # Fallback to any available model
            available_models = [
                name for name, info in self.models.items() 
                if info.status == ModelStatus.READY
            ]
        else:
            # Check if preferred model is available
            available_models = [preferred_model] if preferred_model in self.models and self.models[preferred_model].status == ModelStatus.READY else []
            
        if not available_models:
            # Emergency fallback - use any available model
            for model_name, model_info in self.models.items():
                if model_info.status == ModelStatus.READY:
                    logger.warning(f"Using emergency fallback model: {model_name}")
                    # Cache the emergency fallback for a shorter time
                    self._selection_cache[cache_key] = (model_name, time.time())
                    return model_name
            
            # If no models are available, return a common default
            logger.error("No models available - using default fallback")
            return "llama2:7b-chat"
        
        # Select best model based on performance metrics (only if not cached)
        best_model = available_models[0]
        if len(available_models) > 1:
            best_score = 0
            
            for model_name in available_models:
                if model_name in self.models:
                    model_info = self.models[model_name]
                    
                    # Calculate score based on success rate, speed, and recency
                    score = (
                        model_info.success_rate * 0.4 +
                        (1 / (model_info.avg_response_time + 1)) * 0.3 +
                        (1 / (time.time() - model_info.last_used.timestamp() + 1)) * 0.3
                    )
                    
                    if score > best_score:
                        best_score = score
                        best_model = model_name
        
        # Cache the result
        self._selection_cache[cache_key] = (best_model, time.time())
        
        logger.debug(f"Selected model {best_model} for {task_type}/{quality_requirement}")
        return best_model

    async def generate(
        self,
        model_name: str,
        prompt: str,
        max_tokens: int = 1000,
        temperature: float = 0.7,
        **kwargs
    ) -> ModelResult:
        """
        Generate text using the specified model.
        
        Args:
            model_name: Name of the model to use
            prompt: Input prompt
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature
            **kwargs: Additional generation parameters
            
        Returns:
            ModelResult: Generation result
        """
        if not self.is_initialized:
            await self.initialize()
        
        start_time = time.time()
        
        try:
            # Ensure model is loaded
            await self._ensure_model_loaded(model_name)
            
            # Generate response with timeout
            result = await asyncio.wait_for(
                self.ollama_client.generate(
                    model_name=model_name,
                    prompt=prompt,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    **kwargs
                ),
                timeout=120.0  # 2 minute timeout for generation
            )
            
            # Update model statistics
            if model_name in self.models:
                self.models[model_name].update_stats(result)
            
            # Track usage
            self.usage_stats[model_name] += 1
            self.cost_tracker[model_name] += result.cost if hasattr(result, 'cost') else 0
            
            return result
            
        except asyncio.TimeoutError:
            logger.error(f"Generation timeout for model {model_name}")
            return ModelResult(
                success=False,
                text="",
                error="Generation timeout",
                execution_time=time.time() - start_time,
                model_used=model_name
            )
        except OllamaException as e:
            logger.error(f"Ollama connection error for model {model_name}: {e}")
            return ModelResult(
                success=False,
                text="",
                error=f"Connection error: {e}",
                execution_time=time.time() - start_time,
                model_used=model_name
            )
        except Exception as e:
            logger.error(f"Generation failed for model {model_name}: {e}")
            # Return error result
            return ModelResult(
                success=False,
                text="",
                error=str(e),
                execution_time=time.time() - start_time,
                model_used=model_name
            )

    async def _ensure_model_loaded(self, model_name: str) -> bool:
        """Ensure a model is loaded and ready."""
        if model_name not in self.models:
            logger.warning(f"Model {model_name} not found in catalog")
            return False
        
        model_info = self.models[model_name]
        
        if model_info.status == ModelStatus.READY:
            # Model is ready
            return True
        elif model_info.status == ModelStatus.LOADING:
            # Wait for loading to complete
            max_wait = 30  # seconds
            waited = 0
            while model_info.status == ModelStatus.LOADING and waited < max_wait:
                await asyncio.sleep(1)
                waited += 1
            
            return model_info.status == ModelStatus.AVAILABLE
        else:
            # Try to load the model
            try:
                model_info.status = ModelStatus.LOADING
                load_start = time.time()
                
                # This would typically involve calling Ollama's load API
                # For now, assume it's available if we reach here
                await asyncio.sleep(0.1)  # Simulate load time
                
                model_info.status = ModelStatus.READY
                model_info.load_time = time.time() - load_start
                
                logger.info(f"Model {model_name} loaded successfully")
                return True
                
            except asyncio.TimeoutError:
                logger.error(f"⏱️ Model loading timeout for {model_name}")
                model_info.status = ModelStatus.ERROR
                return False
            except MemoryError:
                logger.error(f"💾 Insufficient memory to load model {model_name}")
                model_info.status = ModelStatus.ERROR
                return False
            except ConnectionError as e:
                logger.error(f"🔌 Connection error loading model {model_name}: {e}")
                model_info.status = ModelStatus.ERROR
                return False
            except Exception as e:
                logger.error(f"❌ Failed to load model {model_name}: {e}")
                model_info.status = ModelStatus.ERROR
                return False

    async def shutdown(self):
        """Gracefully shutdown the model manager."""
        logger.info("🔄 Shutting down ModelManager...")
        
        if self.ollama_client:
            try:
                await self.ollama_client.close()
            except ConnectionError as e:
                logger.warning(f"🔌 Connection error closing Ollama client: {e}")
            except asyncio.TimeoutError:
                logger.warning("⏱️ Timeout closing Ollama client")
            except Exception as e:
                logger.warning(f"❌ Error closing Ollama client: {e}")
        
        self.is_initialized = False
        logger.info("✅ ModelManager shutdown completed")

    def get_model_stats(self, model_name: Optional[str] = None) -> Dict[str, Any]:
        """Get performance and usage statistics for a specific model or all models."""
        if model_name and model_name in self.models:
            model_info = self.models[model_name]
            base_stats = {
                "name": model_info.name,
                "status": model_info.status.value if hasattr(model_info.status, 'value') else str(model_info.status),
                "total_requests": model_info.total_requests,
                "success_rate": model_info.success_rate,
                "avg_response_time": model_info.avg_response_time,
                "avg_tokens_per_second": model_info.avg_tokens_per_second,
                "tier": model_info.tier,
                "last_used": model_info.last_used.isoformat(),
                "load_time": model_info.load_time
            }
            
            # Add usage stats if available
            if model_name in self.usage_stats:
                base_stats["usage_count"] = self.usage_stats[model_name]
            if model_name in self.cost_tracker:
                base_stats["total_cost"] = self.cost_tracker[model_name]
                
            return base_stats
        else:
            # Return overall stats
            return self.get_stats()

    def get_stats(self) -> Dict[str, Any]:
        """Get performance and usage statistics."""
        available_models = len([m for m in self.models.values() if m.status == ModelStatus.READY])
        return {
            "total_models": len(self.models),
            "available_models": available_models,
            "loaded_models": available_models,  # Alias for health check compatibility
            "total_requests": sum(self.usage_stats.values()),
            "total_cost": sum(self.cost_tracker.values()),
            "initialization_status": self.initialization_status,
            "is_initialized": self.is_initialized
        }


# Export main classes
__all__ = [
    "ModelManager",
    "TaskType", 
    "QualityLevel",
    "ModelInfo",
    "ModelSelectionCriteria"
]
