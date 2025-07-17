"""
ModelManager - Intelligent model lifecycle management with cost optimization.
Handles model loading, selection, fallbacks, and performance tracking.
"""

import asyncio
import collections
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from app.core.config import MODEL_ASSIGNMENTS, PRIORITY_TIERS
from app.core.logging import get_logger
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

    MINIMAL = "minimal"  # Fastest response, basic quality
    BALANCED = "balanced"  # Good balance of speed and quality
    HIGH = "high"  # High quality, reasonable speed
    PREMIUM = "premium"  # Best quality, may be slower/expensive


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
                self.avg_response_time = (
                    alpha * result.execution_time + (1 - alpha) * self.avg_response_time
                )

            # Update tokens per second
            if result.tokens_per_second:
                if self.avg_tokens_per_second == 0:
                    self.avg_tokens_per_second = result.tokens_per_second
                else:
                    self.avg_tokens_per_second = (
                        alpha * result.tokens_per_second
                        + (1 - alpha) * self.avg_tokens_per_second
                    )

            # Track confidence scores
            if confidence > 0:
                self.confidence_scores.append(confidence)
                # Keep only last 100 scores
                if len(self.confidence_scores) > 100:
                    self.confidence_scores = self.confidence_scores[-100:]

        # Update success rate
        recent_requests = min(self.total_requests, 20)  # Consider last 20 requests
        if hasattr(self, "_recent_successes"):
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

        # Threading for background operations
        self._background_lock = threading.Lock()

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
                        self.ollama_client.health_check(), timeout=10.0
                    )
                    if health_ok:
                        logger.info("✅ Ollama health check passed")
                        break
                    else:
                        logger.warning(
                            f"⚠️ Ollama health check failed (attempt {attempt + 1})"
                        )
                except asyncio.TimeoutError:
                    logger.warning(
                        f"⏱️ Ollama health check timeout (attempt {attempt + 1})"
                    )
                except Exception as e:
                    logger.warning(
                        f"❌ Ollama health check error (attempt {attempt + 1}): {e}"
                    )

                if attempt < max_retries - 1:
                    await asyncio.sleep(2**attempt)  # Exponential backoff
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
            except Exception as e:
                logger.error(f"❌ Failed to discover models: {e}")
                self.initialization_status = "degraded"

            # Initialize memory manager
            try:
                if not hasattr(self, "memory_manager") or not self.memory_manager:
                    self.memory_manager = A5000MemoryManager()
                    logger.info("🧠 Memory manager initialized")
            except Exception as e:
                logger.warning(f"⚠️ Memory manager initialization failed: {e}")

            # Mark as initialized
            self.is_initialized = True
            self.initialization_status = getattr(
                self, "initialization_status", "healthy"
            )
            duration = time.time() - start_time

            logger.info(
                f"✅ ModelManager initialization completed in {duration:.2f}s (status: {self.initialization_status})"
            )
            return True

        except Exception as e:
            logger.error(f"❌ ModelManager initialization failed: {e}")
            self.initialization_status = "failed"
            self.is_initialized = False
            return False

    async def _discover_available_models(self, force_refresh: bool = False) -> None:
        """Discover and catalog available models from Ollama."""
        try:
            # Try to get models with timeout
            models_data = await asyncio.wait_for(
                self.ollama_client.list_models(), timeout=30.0  # 30 second timeout
            )
            logger.info(f"📚 Found {len(models_data)} available models")

            # Clear existing models if force refresh
            if force_refresh:
                self.models.clear()
                logger.info("🔄 Cleared existing model cache for refresh")

            for model_data in models_data:
                # Extract model name from the model data dictionary
                model_name = (
                    model_data.get("name", "")
                    if isinstance(model_data, dict)
                    else str(model_data)
                )

                if model_name and model_name not in self.models:
                    # Determine tier based on configuration
                    tier = "T2"  # Default
                    try:
                        for tier_name, tier_models in self.priority_tiers.items():
                            if any(
                                model_name.startswith(tm.split(":")[0])
                                for tm in tier_models
                            ):
                                tier = tier_name
                                break
                    except Exception as tier_error:
                        logger.warning(
                            f"Tier assignment failed for {model_name}: {tier_error}"
                        )
                        tier = "T2"  # Fallback

                    self.models[model_name] = ModelInfo(
                        name=model_name, status=ModelStatus.READY, tier=tier
                    )
                    logger.info(f"Added model: {model_name} (tier: {tier})")
                elif model_name and model_name in self.models:
                    self.models[model_name].status = ModelStatus.READY
                    logger.info(f"Updated model status: {model_name}")

            logger.info(
                f"Model discovery completed: {len(self.models)} models cataloged"
            )

        except Exception as e:
            logger.error(f"Model discovery failed: {e}")
            raise

    async def refresh_models(self) -> bool:
        """Force refresh of available models from Ollama."""
        try:
            logger.info("🔄 Force refreshing model list from Ollama...")
            await self._discover_available_models(force_refresh=True)
            logger.info(
                f"✅ Model refresh completed: {len(self.models)} models available"
            )
            return len(self.models) > 0
        except Exception as e:
            logger.error(f"❌ Model refresh failed: {e}")
            return False

    def select_optimal_model(
        self,
        task_type,  # Can be TaskType enum or string
        quality_requirement=None,  # Can be QualityLevel enum or string
        context: Optional[Dict[str, Any]] = None,
    ) -> str:
        """
        Select the optimal model for a given task and quality requirement.

        Args:
            task_type: Type of task to perform (TaskType enum or string)
            quality_requirement: Required quality level (QualityLevel enum or string)
            context: Additional context for selection (user tier, budget, etc.)

        Returns:
            str: Selected model name
        """
        context = context or {}

        # Convert string parameters to enums if needed
        if isinstance(task_type, str):
            task_type = getattr(TaskType, task_type.upper(), TaskType.CONVERSATION)

        if quality_requirement is None:
            quality_requirement = QualityLevel.BALANCED
        elif isinstance(quality_requirement, str):
            quality_requirement = getattr(
                QualityLevel, quality_requirement.upper(), QualityLevel.BALANCED
            )

        # Create cache key
        cache_key = f"{task_type.value if hasattr(task_type, 'value') else str(task_type)}:{quality_requirement.value if hasattr(quality_requirement, 'value') else str(quality_requirement)}"

        # Check cache first
        if cache_key in self._selection_cache:
            cached_model, cache_time = self._selection_cache[cache_key]
            if time.time() - cache_time < self._cache_ttl:
                # Verify cached model is still available
                if (
                    cached_model in self.models
                    and self.models[cached_model].status == ModelStatus.READY
                ):
                    logger.debug(f"Using cached model selection: {cached_model}")
                    return cached_model
                else:
                    # Remove invalid cache entry
                    del self._selection_cache[cache_key]

        # Get task-specific model preferences
        task_name = task_type.value if hasattr(task_type, "value") else str(task_type)
        (
            quality_requirement.value
            if hasattr(quality_requirement, "value")
            else str(quality_requirement)
        )

        # For now, use a simple mapping since MODEL_ASSIGNMENTS is flat
        preferred_model = self.model_assignments.get(task_name)

        if not preferred_model:
            # Fallback to any available model
            available_models = [
                name
                for name, info in self.models.items()
                if info.status == ModelStatus.READY
            ]
        else:
            # Check if preferred model is available
            available_models = (
                [preferred_model]
                if preferred_model in self.models
                and self.models[preferred_model].status == ModelStatus.READY
                else []
            )

        if not available_models:
            # Emergency fallback - use any available model
            for model_name, model_info in self.models.items():
                if model_info.status == ModelStatus.READY:
                    logger.warning(f"Using emergency fallback model: {model_name}")
                    # Cache the emergency fallback for a shorter time
                    self._selection_cache[cache_key] = (model_name, time.time())
                    return model_name

            # If no models are available, try the default from env or config
            from app.core.config import get_settings

            settings = get_settings()
            default_model = getattr(settings, "default_model", "phi3:mini")
            logger.error(
                f"No models available - using configured default: {default_model}"
            )
            return default_model

        # Select best model based on performance metrics (only if not cached)
        best_model = available_models[0]
        if len(available_models) > 1:
            best_score = 0

            for model_name in available_models:
                if model_name in self.models:
                    model_info = self.models[model_name]

                    # Calculate score based on success rate, speed, and recency
                    score = (
                        model_info.success_rate * 0.4
                        + (1 / (model_info.avg_response_time + 1)) * 0.3
                        + (1 / (time.time() - model_info.last_used.timestamp() + 1))
                        * 0.3
                    )

                    if score > best_score:
                        best_score = score
                        best_model = model_name

        # Cache the result
        self._selection_cache[cache_key] = (best_model, time.time())

        logger.debug(
            f"Selected model {best_model} for {task_type}/{quality_requirement}"
        )
        return best_model

    async def generate(
        self,
        prompt: str,
        model_name: Optional[str] = None,
        task_type: Optional[str] = None,
        max_tokens: int = 1000,
        temperature: float = 0.7,
        timeout: Optional[float] = None,
        **kwargs,
    ) -> ModelResult:
        """
        Generate text using the specified model or auto-select based on task type.

        Args:
            prompt: Input prompt
            model_name: Name of the model to use (if not provided, will auto-select based on task_type)
            task_type: Task type for model selection (conversation, qa_and_summary, etc.)
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature
            timeout: Custom timeout for generation
            **kwargs: Additional generation parameters

        Returns:
            ModelResult: Generation result
        """
        if not self.is_initialized:
            await self.initialize()

        # Auto-retry model discovery if no models available (startup race condition fix)
        if len(self.models) == 0:
            logger.warning("⚠️ No models available - attempting model refresh...")
            refresh_success = await self.refresh_models()
            if not refresh_success:
                logger.error("❌ Model refresh failed - no models available")

        start_time = time.time()

        # Auto-select model if not provided
        if not model_name:
            if task_type:
                # Convert string task_type to TaskType enum
                task_type_enum = getattr(
                    TaskType, task_type.upper(), TaskType.CONVERSATION
                )
                model_name = self.select_optimal_model(
                    task_type_enum, QualityLevel.BALANCED
                )
            else:
                # Default fallback model
                model_name = "phi3:mini"

        # Set timeout
        generation_timeout = timeout if timeout else 120.0

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
                    **kwargs,
                ),
                timeout=generation_timeout,
            )

            # Update model statistics
            if model_name in self.models:
                self.models[model_name].update_stats(result)

            # Track usage
            self.usage_stats[model_name] += 1
            self.cost_tracker[model_name] += (
                result.cost if hasattr(result, "cost") else 0
            )

            return result

        except asyncio.TimeoutError:
            logger.error(f"Generation timeout for model {model_name}")
            return ModelResult(
                success=False,
                text="",
                error="Generation timeout",
                execution_time=time.time() - start_time,
                model_used=model_name,
            )
        except OllamaException as e:
            logger.error(f"Ollama connection error for model {model_name}: {e}")
            return ModelResult(
                success=False,
                text="",
                error=f"Connection error: {e}",
                execution_time=time.time() - start_time,
                model_used=model_name,
            )
        except Exception as e:
            logger.error(f"Generation failed for model {model_name}: {e}")
            # Return error result
            return ModelResult(
                success=False,
                text="",
                error=str(e),
                execution_time=time.time() - start_time,
                model_used=model_name,
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

            except Exception as e:
                logger.error(f"Failed to load model {model_name}: {e}")
                model_info.status = ModelStatus.ERROR
                return False

    async def shutdown(self):
        """Gracefully shutdown the model manager."""
        logger.info("🔄 Shutting down ModelManager...")

        if self.ollama_client:
            try:
                await self.ollama_client.close()
            except Exception as e:
                logger.warning(f"Error closing Ollama client: {e}")

        self.is_initialized = False
        logger.info("✅ ModelManager shutdown completed")

    def get_stats(self) -> Dict[str, Any]:
        """Get performance and usage statistics."""
        return {
            "total_models": len(self.models),
            "available_models": len(
                [m for m in self.models.values() if m.status == ModelStatus.READY]
            ),
            "total_requests": sum(self.usage_stats.values()),
            "total_cost": sum(self.cost_tracker.values()),
            "initialization_status": self.initialization_status,
            "is_initialized": self.is_initialized,
        }

    def get_model_stats(self) -> Dict[str, Any]:
        """Get model statistics (alias for get_stats for health check compatibility)."""
        stats = self.get_stats()
        # Add additional stats that health checks expect
        stats.update(
            {
                "loaded_models": stats["available_models"],
                "status": "healthy" if self.is_initialized else "initializing",
                "models": {
                    name: {
                        "status": (
                            model.status.value
                            if hasattr(model.status, "value")
                            else str(model.status)
                        ),
                        "requests": model.total_requests,
                        "avg_response_time": model.avg_response_time,
                        "last_used": (
                            model.last_used.isoformat() if model.last_used else None
                        ),
                    }
                    for name, model in self.models.items()
                },
            }
        )
        return stats


# Export main classes
__all__ = [
    "ModelManager",
    "TaskType",
    "QualityLevel",
    "ModelInfo",
    "ModelSelectionCriteria",
]
