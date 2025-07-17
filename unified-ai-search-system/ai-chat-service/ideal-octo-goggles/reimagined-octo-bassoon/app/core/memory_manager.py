"""
Memory-Aware Model Management for A5000
Handles intelligent model loading, unloading, and hot-swapping based on VRAM constraints.
"""

import asyncio
import logging
import time
from dataclasses import dataclass
from typing import Dict, List, Optional

from app.core.config import A5000_CONFIG, MODEL_MEMORY_REQUIREMENTS, PRIORITY_TIERS

logger = logging.getLogger(__name__)


@dataclass
class ModelMemoryInfo:
    """Track memory usage and status for each model"""

    name: str
    memory_gb: float
    status: str  # "loaded", "loading", "unloaded", "error"
    last_used: float
    load_time: float
    priority_tier: str
    use_count: int = 0


class A5000MemoryManager:
    """Intelligent memory management for A5000 with 24GB VRAM"""

    def __init__(self):
        self.config = A5000_CONFIG
        self.memory_requirements = MODEL_MEMORY_REQUIREMENTS
        self.priority_tiers = PRIORITY_TIERS

        # Memory tracking
        self.loaded_models: Dict[str, ModelMemoryInfo] = {}
        self.current_usage_gb = 0.0
        
        # Thread-safe locking
        self._loading_locks: Dict[str, asyncio.Lock] = {}
        self._locks_lock = asyncio.Lock()  # Protects the locks dictionary
        self._memory_lock = asyncio.Lock()  # Protects memory operations

        # Statistics
        self.stats = {
            "total_loads": 0,
            "total_unloads": 0,
            "cache_hits": 0,
            "memory_pressure_events": 0,
        }

        logger.info(
            f"A5000MemoryManager initialized with {self.config['available_vram_gb']}GB available VRAM"
        )

    def get_model_priority_tier(self, model_name: str) -> str:
        """Determine which priority tier a model belongs to"""
        for tier, models in self.priority_tiers.items():
            if any(model_name.startswith(m.split(":")[0]) for m in models):
                return tier
        return "T3"  # Default to lowest priority

    def get_memory_requirement(self, model_name: str) -> float:
        """Get memory requirement for a model"""
        # Check exact match first
        if model_name in self.memory_requirements:
            return self.memory_requirements[model_name]

        # Check base model name (e.g., phi3:mini -> phi3)
        base_name = model_name.split(":")[0]
        for known_model, memory in self.memory_requirements.items():
            if known_model.startswith(base_name):
                return memory

        # Default estimation based on model size hints in name
        if "mini" in model_name.lower():
            return 2.0
        elif "7b" in model_name.lower():
            return 7.0
        elif "8b" in model_name.lower():
            return 8.0
        elif "13b" in model_name.lower():
            return 13.0
        else:
            return 7.0  # Conservative default

    def can_fit_model(
        self, model_name: str, required_models: Optional[List[str]] = None
    ) -> bool:
        """Check if we can fit a model in available VRAM"""
        required_memory = self.get_memory_requirement(model_name)

        # If model is already loaded, no additional memory needed
        if model_name in self.loaded_models:
            return True

        # Calculate available memory
        available = self.config["available_vram_gb"] - self.current_usage_gb

        # If we can't fit, see if we can make room by unloading lower priority models
        if available < required_memory:
            return self._can_make_room(required_memory, required_models or [])

        return True

    def _can_make_room(
        self, required_memory: float, protected_models: List[str]
    ) -> bool:
        """Check if we can free enough memory by unloading models"""
        available = self.config["available_vram_gb"] - self.current_usage_gb

        # Models we could potentially unload (not in protected list, not T0)
        unloadable = []
        for model_name, info in self.loaded_models.items():
            if (
                model_name not in protected_models
                and info.priority_tier != "T0"
                and info.status == "loaded"
            ):
                unloadable.append((model_name, info))

        # Sort by priority (T3 first, then T2, then T1) and last_used time
        def sort_key(item):
            model_name, info = item
            tier_priority = {"T3": 0, "T2": 1, "T1": 2, "T0": 3}
            return (tier_priority.get(info.priority_tier, 0), -info.last_used)

        unloadable.sort(key=sort_key)

        # Calculate how much we could free
        potential_freed = 0
        for model_name, info in unloadable:
            potential_freed += info.memory_gb
            if available + potential_freed >= required_memory:
                return True

        return False

    async def _get_loading_lock(self, model_name: str) -> asyncio.Lock:
        """Thread-safe lock acquisition for model loading."""
        async with self._locks_lock:
            if model_name not in self._loading_locks:
                self._loading_locks[model_name] = asyncio.Lock()
            return self._loading_locks[model_name]

    async def ensure_model_loaded(
        self, model_name: str, required_models: Optional[List[str]] = None
    ) -> bool:
        """Ensure a model is loaded, handling memory management with proper synchronization."""
        required_models = required_models or []

        # Fast path: check if already loaded without locks
        async with self._memory_lock:
            if (
                model_name in self.loaded_models
                and self.loaded_models[model_name].status == "loaded"
            ):
                self.loaded_models[model_name].last_used = time.time()
                self.loaded_models[model_name].use_count += 1
                self.stats["cache_hits"] += 1
                logger.debug(f"Model {model_name} already loaded (cache hit)")
                return True

        # Get model-specific loading lock
        loading_lock = await self._get_loading_lock(model_name)

        async with loading_lock:
            # Double-check after acquiring lock (another thread might have loaded it)
            async with self._memory_lock:
                if (
                    model_name in self.loaded_models
                    and self.loaded_models[model_name].status == "loaded"
                ):
                    self.loaded_models[model_name].last_used = time.time()
                    self.loaded_models[model_name].use_count += 1
                    self.stats["cache_hits"] += 1
                    logger.debug(f"Model {model_name} already loaded (double-check hit)")
                    return True

            # Check if we can fit the model
            if not self.can_fit_model(model_name, required_models):
                await self._free_memory_for_model(model_name, required_models)

            # Load the model
            return await self._load_model(model_name)

    async def _load_model(self, model_name: str) -> bool:
        """Actually load a model with proper synchronization."""
        start_time = time.time()
        required_memory = self.get_memory_requirement(model_name)
        priority_tier = self.get_model_priority_tier(model_name)

        try:
            # Mark as loading under lock
            async with self._memory_lock:
                if model_name not in self.loaded_models:
                    self.loaded_models[model_name] = ModelMemoryInfo(
                        name=model_name,
                        memory_gb=required_memory,
                        status="loading",
                        last_used=time.time(),
                        load_time=0.0,
                        priority_tier=priority_tier,
                    )
                else:
                    self.loaded_models[model_name].status = "loading"

            logger.info(
                f"Loading model {model_name} ({required_memory}GB, {priority_tier})"
            )

            # Here you would call your actual model loading logic
            # For now, simulate the loading process
            await asyncio.sleep(0.1)  # Simulate loading time

            # Update memory tracking atomically
            async with self._memory_lock:
                self.current_usage_gb += required_memory
                load_time = time.time() - start_time

                # Update model info
                self.loaded_models[model_name].status = "loaded"
                self.loaded_models[model_name].load_time = load_time
                self.loaded_models[model_name].last_used = time.time()

                self.stats["total_loads"] += 1

            logger.info(
                f"Model {model_name} loaded successfully in {load_time:.2f}s "
                f"(Memory usage: {self.current_usage_gb:.1f}/{self.config['available_vram_gb']}GB)"
            )

            return True

        except Exception as e:
            logger.error(f"Failed to load model {model_name}: {e}")
            async with self._memory_lock:
                if model_name in self.loaded_models:
                    self.loaded_models[model_name].status = "error"
            return False

    async def _free_memory_for_model(
        self, model_name: str, protected_models: List[str]
    ):
        """Free memory by unloading lower priority models"""
        required_memory = self.get_memory_requirement(model_name)
        available = self.config["available_vram_gb"] - self.current_usage_gb

        if available >= required_memory:
            return  # Already have enough space

        needed = required_memory - available
        logger.info(f"Need to free {needed:.1f}GB for {model_name}")

        # Get unloadable models
        unloadable = []
        for loaded_model, info in self.loaded_models.items():
            if (
                loaded_model not in protected_models
                and loaded_model != model_name
                and info.priority_tier != "T0"
                and info.status == "loaded"
            ):
                unloadable.append((loaded_model, info))

        # Sort by priority and usage
        def sort_key(item):
            model_name, info = item
            tier_priority = {"T3": 0, "T2": 1, "T1": 2}
            return (tier_priority.get(info.priority_tier, 0), -info.last_used)

        unloadable.sort(key=sort_key)

        # Unload models until we have enough space
        freed = 0
        for unload_model, info in unloadable:
            if freed >= needed:
                break

            await self._unload_model(unload_model)
            freed += info.memory_gb

        self.stats["memory_pressure_events"] += 1

    async def _unload_model(self, model_name: str):
        """Unload a model from memory with proper synchronization."""
        async with self._memory_lock:
            if model_name not in self.loaded_models:
                return

            info = self.loaded_models[model_name]
            if info.status != "loaded":
                return

            logger.info(f"Unloading model {model_name} to free {info.memory_gb}GB")

            # Mark as unloading to prevent race conditions
            info.status = "unloading"

        try:
            # Here you would call your actual model unloading logic
            await asyncio.sleep(0.05)  # Simulate unloading time

            # Update memory tracking atomically
            async with self._memory_lock:
                self.current_usage_gb -= info.memory_gb
                info.status = "unloaded"
                self.stats["total_unloads"] += 1

            logger.info(
                f"Model {model_name} unloaded (Memory usage: {self.current_usage_gb:.1f}GB)"
            )

        except Exception as e:
            logger.error(f"Failed to unload model {model_name}: {e}")
            async with self._memory_lock:
                if model_name in self.loaded_models:
                    self.loaded_models[model_name].status = "error"

    async def preload_priority_models(self) -> Dict[str, bool]:
        """Preload T0 and T1 priority models"""
        results = {}

        # Load T0 models (always loaded)
        for model_pattern in self.priority_tiers.get("T0", []):
            success = await self.ensure_model_loaded(model_pattern)
            results[model_pattern] = success

        # Load T1 models if memory allows
        for model_pattern in self.priority_tiers.get("T1", []):
            if self.can_fit_model(model_pattern):
                success = await self.ensure_model_loaded(model_pattern)
                results[model_pattern] = success
            else:
                logger.info(f"Skipping T1 model {model_pattern} - insufficient memory")
                results[model_pattern] = False

        return results

    def get_memory_stats(self) -> Dict:
        """Get current memory statistics"""
        loaded_count = sum(
            1 for info in self.loaded_models.values() if info.status == "loaded"
        )

        return {
            "total_vram_gb": self.config["total_vram_gb"],
            "available_vram_gb": self.config["available_vram_gb"],
            "current_usage_gb": round(self.current_usage_gb, 1),
            "free_memory_gb": round(
                self.config["available_vram_gb"] - self.current_usage_gb, 1
            ),
            "memory_utilization": round(
                (self.current_usage_gb / self.config["available_vram_gb"]) * 100, 1
            ),
            "loaded_models_count": loaded_count,
            "total_models_tracked": len(self.loaded_models),
            "stats": self.stats.copy(),
            "loaded_models": {
                name: {
                    "memory_gb": info.memory_gb,
                    "status": info.status,
                    "priority_tier": info.priority_tier,
                    "use_count": info.use_count,
                    "last_used": info.last_used,
                }
                for name, info in self.loaded_models.items()
                if info.status == "loaded"
            },
        }

    def recommend_models_for_workflow(self, workflow_models: List[str]) -> List[str]:
        """Recommend which models to keep loaded for a workflow"""
        total_memory_needed = sum(
            self.get_memory_requirement(model) for model in workflow_models
        )

        if total_memory_needed <= self.config["available_vram_gb"]:
            # Can fit all models
            return workflow_models
        else:
            # Need to prioritize
            priority_order = []

            # Add T0 models first
            for model in workflow_models:
                if self.get_model_priority_tier(model) == "T0":
                    priority_order.append(model)

            # Add T1 models
            for model in workflow_models:
                if (
                    self.get_model_priority_tier(model) == "T1"
                    and model not in priority_order
                ):
                    priority_order.append(model)

            # Add remaining models until memory limit
            current_memory = sum(
                self.get_memory_requirement(model) for model in priority_order
            )
            for model in workflow_models:
                if model not in priority_order:
                    model_memory = self.get_memory_requirement(model)
                    if (
                        current_memory + model_memory
                        <= self.config["available_vram_gb"]
                    ):
                        priority_order.append(model)
                        current_memory += model_memory

            return priority_order

    async def cleanup_unloaded_models(self):
        """Clean up tracking data for unloaded models to prevent memory leaks."""
        async with self._memory_lock:
            to_remove = []
            for model_name, info in self.loaded_models.items():
                if info.status == "unloaded":
                    to_remove.append(model_name)
            
            for model_name in to_remove:
                del self.loaded_models[model_name]
                
            # Also clean up unused locks
            async with self._locks_lock:
                unused_locks = []
                for model_name in self._loading_locks:
                    if model_name not in self.loaded_models:
                        unused_locks.append(model_name)
                
                for model_name in unused_locks:
                    del self._loading_locks[model_name]
                    
            if to_remove:
                logger.info(f"Cleaned up {len(to_remove)} unloaded model entries")

    async def shutdown(self):
        """Gracefully shutdown the memory manager."""
        logger.info("Shutting down A5000MemoryManager...")
        
        # Unload all models
        models_to_unload = []
        async with self._memory_lock:
            for model_name, info in self.loaded_models.items():
                if info.status == "loaded":
                    models_to_unload.append(model_name)
        
        for model_name in models_to_unload:
            await self._unload_model(model_name)
        
        # Clean up all tracking data
        async with self._memory_lock:
            self.loaded_models.clear()
            self.current_usage_gb = 0.0
            
        async with self._locks_lock:
            self._loading_locks.clear()
            
        logger.info("A5000MemoryManager shutdown completed")
