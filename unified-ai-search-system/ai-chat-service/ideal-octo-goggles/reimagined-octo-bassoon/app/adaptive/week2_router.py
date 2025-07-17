"""
Week 2 Adaptive Router - Simplified and Focused
Key improvements: Enhanced rewards, gradual rollout, cost tracking
"""

import time
from typing import Any, Dict, Optional

import structlog

from app.adaptive.adaptive_router import AdaptiveIntelligentRouter
from app.adaptive.rewards.enhanced_calculator import (
    EnhancedRouteMetrics,
    create_week2_reward_calculator,
)
from app.cache.redis_client import CacheManager
from app.graphs.base import GraphState
from app.models.manager import ModelManager
from app.monitoring.cost_tracker import get_cost_tracker
from app.monitoring.system_metrics import (
    get_cache_metrics_tracker,
    get_system_metrics_collector,
)
from app.storage.clickhouse_client import get_clickhouse_manager

logger = structlog.get_logger(__name__)


class Week2AdaptiveRouter(AdaptiveIntelligentRouter):
    """
    Week 2 Enhanced Adaptive Router

    Key Week 2 Features:
    1. Enhanced reward system with cost tracking
    2. Gradual real traffic rollout (1% -> 5% -> 15%)
    3. Safety mechanisms and automatic rollback
    4. Performance validation and comparison
    5. Budget management and cost optimization
    """

    def __init__(
        self,
        model_manager: ModelManager,
        cache_manager: CacheManager,
        enable_adaptive: bool = True,
        real_traffic_percentage: float = 0.01,  # Start with 1% real traffic
        enable_cost_tracking: bool = True,
        monthly_budget_usd: float = 50.0,
    ):
        # Initialize base router
        super().__init__(model_manager, cache_manager, enable_adaptive, shadow_rate=0.3)

        # Week 2 enhancements
        self.real_traffic_percentage = real_traffic_percentage
        self.enable_cost_tracking = enable_cost_tracking
        self.monthly_budget_usd = monthly_budget_usd

        # Enhanced reward calculator
        if enable_adaptive and enable_cost_tracking:
            self.enhanced_reward_calculator = create_week2_reward_calculator()
            self.enhanced_reward_calculator.monthly_budget_usd = monthly_budget_usd
        else:
            self.enhanced_reward_calculator = None

        # Real monitoring systems
        self.system_metrics = get_system_metrics_collector()
        self.cache_metrics = get_cache_metrics_tracker()
        self.cost_tracker = get_cost_tracker()

        # Performance tracking for comparison
        self.baseline_metrics = {
            "requests": 0,
            "total_response_time": 0.0,
            "total_cost": 0.0,
            "success_count": 0,
        }

        self.bandit_metrics = {
            "requests": 0,
            "total_response_time": 0.0,
            "total_cost": 0.0,
            "success_count": 0,
        }

        # Safety thresholds
        self.max_error_rate = 0.05  # 5% max error rate
        self.max_cost_increase = 0.20  # 20% max cost increase vs baseline
        self.min_confidence_threshold = 0.7  # Minimum bandit confidence

        logger.info(
            "week2_adaptive_router_initialized",
            real_traffic_percentage=real_traffic_percentage,
            enable_cost_tracking=enable_cost_tracking,
            monthly_budget_usd=monthly_budget_usd,
        )

    async def route_query(self, query: str, state: GraphState) -> Any:
        """
        Enhanced routing with Week 2 features

        Decision Logic:
        1. Check if user should get bandit routing (real traffic %)
        2. Execute appropriate routing
        3. Track enhanced metrics
        4. Update bandit with enhanced rewards
        5. Check safety conditions
        """
        user_id = getattr(state, "user_id", "anonymous")
        start_time = time.time()

        # Determine routing strategy
        use_bandit = self._should_use_bandit_routing(user_id)

        try:
            if use_bandit:
                # Execute bandit routing with enhanced tracking
                result = await self._execute_enhanced_bandit_routing(
                    query, state, start_time
                )
                routing_type = "bandit"
            else:
                # Execute baseline routing
                result = await self._execute_production_route(query, state)
                routing_type = "baseline"

            # Record metrics
            response_time = time.time() - start_time
            await self._record_enhanced_metrics(
                routing_type=routing_type,
                query=query,
                response_time=response_time,
                success=True,
                result=result,
            )

            return result

        except Exception as e:
            # Record failure
            response_time = time.time() - start_time
            await self._record_enhanced_metrics(
                routing_type="bandit" if use_bandit else "baseline",
                query=query,
                response_time=response_time,
                success=False,
                error=str(e),
            )
            raise

    def _should_use_bandit_routing(self, user_id: str) -> bool:
        """Determine if user should get bandit routing based on rollout percentage"""
        if not self.enable_adaptive:
            return False

        # Consistent user assignment using hash
        import hashlib

        hash_val = int(hashlib.md5(user_id.encode()).hexdigest()[:8], 16)
        user_threshold = (hash_val % 10000) / 10000.0  # 0.0 to 1.0

        return user_threshold < self.real_traffic_percentage

    async def _execute_enhanced_bandit_routing(
        self, query: str, state: GraphState, start_time: float
    ) -> Any:
        """Execute bandit routing with enhanced features"""

        # Get context for bandit decision
        context = self._extract_enhanced_context(query, state)

        # Select arm using bandit
        selected_arm, confidence = self.bandit.select_arm(context)

        # Safety check: revert to baseline if confidence too low
        if confidence < self.min_confidence_threshold:
            logger.warning(
                "bandit_confidence_too_low",
                confidence=confidence,
                threshold=self.min_confidence_threshold,
                reverting_to_baseline=True,
            )
            return await self._execute_production_route(query, state)

        # Execute selected route
        route_function = self._get_route_function(selected_arm)
        result = await route_function(state)

        # Calculate enhanced reward and update bandit
        if self.enhanced_reward_calculator:
            await self._update_bandit_with_enhanced_reward(
                selected_arm, query, result, time.time() - start_time, state
            )

        return result

    def _extract_enhanced_context(
        self, query: str, state: GraphState
    ) -> Dict[str, Any]:
        """Extract enhanced context for contextual bandit decisions"""
        # Get base context
        context = {
            "query_length": len(query),
            "query_words": len(query.split()),
            "user_id": getattr(state, "user_id", "anonymous"),
        }

        # Add cost-awareness context
        if hasattr(self, "enhanced_reward_calculator"):
            budget_status = self.enhanced_reward_calculator.get_budget_status()
            context.update(
                {
                    "budget_utilization": budget_status.get("budget_utilization", 0),
                    "budget_pressure": budget_status.get("budget_utilization", 0) > 0.8,
                }
            )

        # Add query complexity
        context["query_complexity"] = self._calculate_query_complexity(query)

        # Add time-based context
        import datetime

        now = datetime.datetime.now()
        context.update(
            {
                "hour_of_day": now.hour,
                "is_peak_hour": 9 <= now.hour <= 17,  # Business hours
                "is_weekend": now.weekday() >= 5,
            }
        )

        return context

    def _calculate_query_complexity(self, query: str) -> float:
        """Calculate query complexity score (0-1)"""
        # Enhanced complexity calculation
        complexity_indicators = {
            "length": min(1.0, len(query) / 200),
            "word_count": min(1.0, len(query.split()) / 30),
            "question_words": min(
                1.0,
                sum(
                    1
                    for word in ["what", "how", "why", "when", "where"]
                    if word in query.lower()
                )
                / 3,
            ),
            "complex_keywords": min(
                1.0,
                sum(
                    1
                    for keyword in ["analyze", "compare", "detailed", "comprehensive"]
                    if keyword in query.lower()
                )
                / 2,
            ),
        }

        return sum(complexity_indicators.values()) / len(complexity_indicators)

    async def _update_bandit_with_enhanced_reward(
        self,
        selected_arm: str,
        query: str,
        result: Any,
        response_time: float,
        state: GraphState,
    ) -> None:
        """Update bandit with enhanced reward calculation"""

        # Track actual cost using real cost tracker
        user_id = getattr(state, "user_id", "anonymous")
        request_id = f"req_{int(time.time() * 1000)}"
        actual_cost = self._track_route_cost(
            selected_arm, query, result, user_id, request_id
        )

        # Create enhanced metrics with real monitoring data
        enhanced_metrics = EnhancedRouteMetrics(
            success=True,  # If we got here, it was successful
            response_time_seconds=response_time,
            estimated_cost_usd=actual_cost,
            api_calls_made=self._estimate_api_calls(selected_arm),
            tokens_consumed=self._estimate_tokens(query, result),
            cache_hit_rate=self._get_cache_hit_rate(),
            memory_usage_mb=self._get_memory_usage(),
            cpu_utilization=self._get_cpu_usage(),
        )

        # Calculate enhanced reward
        reward_data = self.enhanced_reward_calculator.calculate_enhanced_reward(
            enhanced_metrics
        )

        # Update bandit
        self.bandit.update_arm(selected_arm, reward_data["total_reward"])

        # Store adaptive metrics in ClickHouse for analytics
        self._store_adaptive_metrics_async(
            routing_arm=selected_arm,
            success=True,
            response_time=response_time,
            cost_usd=actual_cost,
            user_id=user_id,
            query_complexity=self._calculate_query_complexity(query),
            bandit_confidence=getattr(self.bandit, "last_confidence", 0.5),
            reward_score=reward_data["total_reward"],
        )

        logger.debug(
            "enhanced_reward_calculated",
            arm=selected_arm,
            total_reward=reward_data["total_reward"],
            cost_usd=actual_cost,
            response_time=response_time,
        )

    def _track_route_cost(
        self,
        arm: str,
        query: str,
        result: Any,
        user_id: str = None,
        request_id: str = None,
    ) -> float:
        """Track actual cost for routing arm execution"""
        total_cost = 0.0

        # Estimate tokens from query and result
        query_tokens = len(query.split()) * 1.3
        result_tokens = len(str(result).split()) * 1.3 if result else 100
        total_tokens = int(query_tokens + result_tokens)

        if arm == "fast_chat":
            # Local model inference cost
            model_name = "phi3:mini"  # Default local model
            cost = self.cost_tracker.record_local_inference_cost(
                model_name=model_name,
                tokens=total_tokens,
                user_id=user_id,
                request_id=request_id,
            )
            total_cost += cost

        elif arm == "search_augmented":
            # Search API cost + local model cost
            search_cost = self.cost_tracker.record_search_api_cost(
                provider="brave",  # Default search provider
                query=query,
                results_count=10,  # Typical results
                user_id=user_id,
                request_id=request_id,
            )

            # Local model cost for processing
            model_cost = self.cost_tracker.record_local_inference_cost(
                model_name="phi3:mini",
                tokens=total_tokens + 500,  # Extra tokens for search processing
                user_id=user_id,
                request_id=request_id,
            )

            total_cost += search_cost + model_cost

        elif arm == "api_fallback":
            # External API cost (e.g., OpenAI)
            cost = self.cost_tracker.record_external_api_cost(
                provider="openai",
                model="gpt35_turbo",
                tokens=total_tokens,
                user_id=user_id,
                request_id=request_id,
            )
            total_cost += cost

        elif arm == "hybrid_mode":
            # Mix of local and search
            complexity = self._calculate_query_complexity(query)

            if complexity > 0.7:
                # Use search + local
                search_cost = self.cost_tracker.record_search_api_cost(
                    provider="brave",
                    query=query,
                    results_count=5,
                    user_id=user_id,
                    request_id=request_id,
                )
                total_cost += search_cost

            # Always use local model
            model_cost = self.cost_tracker.record_local_inference_cost(
                model_name="phi3:mini",
                tokens=total_tokens,
                user_id=user_id,
                request_id=request_id,
            )
            total_cost += model_cost

        else:
            # Default local inference
            cost = self.cost_tracker.record_local_inference_cost(
                model_name="phi3:mini",
                tokens=total_tokens,
                user_id=user_id,
                request_id=request_id,
            )
            total_cost += cost

        return total_cost

    def _estimate_api_calls(self, arm: str) -> int:
        """Estimate API calls made"""
        return {
            "fast_chat": 0,
            "search_augmented": 2,
            "api_fallback": 3,
            "hybrid_mode": 1,
        }.get(arm, 1)

    def _estimate_tokens(self, query: str, result: Any) -> int:
        """Estimate tokens consumed"""
        query_tokens = len(query.split()) * 1.3
        result_tokens = len(str(result).split()) * 1.3 if result else 100
        return int(query_tokens + result_tokens)

    def _get_memory_usage(self) -> float:
        """Get actual memory usage in MB"""
        return self.system_metrics.get_memory_usage_mb()

    def _get_cpu_usage(self) -> float:
        """Get actual CPU utilization"""
        return self.system_metrics.get_cpu_utilization()

    def _get_cache_hit_rate(self) -> float:
        """Get actual cache hit rate"""
        return self.cache_metrics.get_hit_rate()

    async def _record_enhanced_metrics(
        self,
        routing_type: str,
        query: str,
        response_time: float,
        success: bool,
        result: Any = None,
        error: str = None,
    ) -> None:
        """Record enhanced metrics for performance comparison"""

        # Use real cost tracking for enhanced metrics recording
        if hasattr(self, "cost_tracker") and routing_type != "baseline":
            # Get recent cost for this type of operation
            user_id = "metrics_tracking"
            estimated_cost = self._track_route_cost(
                routing_type, query, result or {}, user_id
            )
        else:
            estimated_cost = 0.002  # Fallback for baseline

        # Update appropriate metrics
        if routing_type == "baseline":
            metrics = self.baseline_metrics
        else:
            metrics = self.bandit_metrics

        metrics["requests"] += 1
        metrics["total_response_time"] += response_time
        metrics["total_cost"] += estimated_cost
        if success:
            metrics["success_count"] += 1

        # Check safety conditions
        await self._check_safety_conditions()

    async def _check_safety_conditions(self) -> None:
        """Check safety conditions and rollback if needed"""
        if self.bandit_metrics["requests"] < 10:
            return  # Need minimum data for meaningful comparison

        bandit_error_rate = 1.0 - (
            self.bandit_metrics["success_count"] / self.bandit_metrics["requests"]
        )

        # Safety check: error rate
        if bandit_error_rate > self.max_error_rate:
            await self._emergency_rollback(
                f"Error rate too high: {bandit_error_rate:.3f}"
            )
            return

        # Safety check: cost increase (if we have baseline data)
        if self.baseline_metrics["requests"] > 10:
            baseline_avg_cost = (
                self.baseline_metrics["total_cost"] / self.baseline_metrics["requests"]
            )
            bandit_avg_cost = (
                self.bandit_metrics["total_cost"] / self.bandit_metrics["requests"]
            )

            cost_increase = (bandit_avg_cost - baseline_avg_cost) / baseline_avg_cost
            if cost_increase > self.max_cost_increase:
                await self._emergency_rollback(
                    f"Cost increase too high: {cost_increase:.3f}"
                )
                return

    async def _emergency_rollback(self, reason: str) -> None:
        """Emergency rollback to shadow mode only"""
        old_percentage = self.real_traffic_percentage
        self.real_traffic_percentage = 0.0  # Stop all real traffic

        logger.error(
            "emergency_rollback_triggered",
            reason=reason,
            old_percentage=old_percentage,
            new_percentage=0.0,
        )

    def increase_rollout_percentage(self, new_percentage: float) -> bool:
        """Safely increase rollout percentage"""
        if new_percentage <= self.real_traffic_percentage:
            return False

        if new_percentage > 1.0:
            new_percentage = 1.0

        # Safety check before increasing
        if self.bandit_metrics["requests"] > 50:
            error_rate = 1.0 - (
                self.bandit_metrics["success_count"] / self.bandit_metrics["requests"]
            )
            if error_rate > self.max_error_rate:
                logger.warning(
                    "cannot_increase_rollout_high_error_rate", error_rate=error_rate
                )
                return False

        old_percentage = self.real_traffic_percentage
        self.real_traffic_percentage = new_percentage

        logger.info(
            "rollout_percentage_increased",
            old_percentage=old_percentage,
            new_percentage=new_percentage,
        )

        return True

    def _store_adaptive_metrics_async(
        self,
        routing_arm: str,
        success: bool,
        response_time: float,
        cost_usd: float,
        user_id: str = None,
        query_complexity: float = None,
        bandit_confidence: float = None,
        reward_score: float = None,
    ):
        """Store adaptive routing metrics in ClickHouse asynchronously"""
        import asyncio

        def store_adaptive_metrics():
            try:
                clickhouse_manager = get_clickhouse_manager()
                if clickhouse_manager:
                    asyncio.create_task(
                        clickhouse_manager.record_adaptive_metrics(
                            routing_arm=routing_arm,
                            success=success,
                            response_time=response_time,
                            cost_usd=cost_usd,
                            user_id=user_id,
                            query_complexity=query_complexity,
                            bandit_confidence=bandit_confidence,
                            reward_score=reward_score,
                        )
                    )
            except Exception as e:
                logger.warning(
                    "failed_to_store_adaptive_metrics_in_clickhouse", error=str(e)
                )

        # Schedule the task without blocking
        try:
            loop = asyncio.get_running_loop()
            loop.call_soon_threadsafe(store_adaptive_metrics)
        except RuntimeError:
            # No event loop running, skip ClickHouse storage
            pass

    def get_week2_status(self) -> Dict[str, Any]:
        """Get comprehensive Week 2 status"""
        status = {
            "week2_features": {
                "enhanced_rewards": self.enhanced_reward_calculator is not None,
                "cost_tracking": self.enable_cost_tracking,
                "real_traffic_percentage": self.real_traffic_percentage,
                "safety_monitoring": True,
            },
            "performance_comparison": self._get_performance_comparison(),
            "safety_status": self._get_safety_status(),
            "rollout_status": self._get_rollout_status(),
        }

        # Add budget status using real cost tracking
        if hasattr(self, "cost_tracker"):
            status["budget_status"] = self.cost_tracker.get_budget_status()
            status["cost_breakdown"] = self.cost_tracker.get_cost_breakdown(24)
        elif self.enhanced_reward_calculator:
            status[
                "budget_status"
            ] = self.enhanced_reward_calculator.get_budget_status()

        # Add base adaptive stats
        if self.enable_adaptive:
            status["bandit_stats"] = self.get_adaptive_stats()

        return status

    def _get_performance_comparison(self) -> Dict[str, Any]:
        """Compare bandit vs baseline performance"""
        comparison = {"data_available": False}

        if (
            self.baseline_metrics["requests"] > 0
            and self.bandit_metrics["requests"] > 0
        ):
            baseline_avg_time = (
                self.baseline_metrics["total_response_time"]
                / self.baseline_metrics["requests"]
            )
            bandit_avg_time = (
                self.bandit_metrics["total_response_time"]
                / self.bandit_metrics["requests"]
            )

            baseline_success_rate = (
                self.baseline_metrics["success_count"]
                / self.baseline_metrics["requests"]
            )
            bandit_success_rate = (
                self.bandit_metrics["success_count"] / self.bandit_metrics["requests"]
            )

            baseline_avg_cost = (
                self.baseline_metrics["total_cost"] / self.baseline_metrics["requests"]
            )
            bandit_avg_cost = (
                self.bandit_metrics["total_cost"] / self.bandit_metrics["requests"]
            )

            comparison = {
                "data_available": True,
                "baseline": {
                    "requests": self.baseline_metrics["requests"],
                    "avg_response_time": baseline_avg_time,
                    "success_rate": baseline_success_rate,
                    "avg_cost": baseline_avg_cost,
                },
                "bandit": {
                    "requests": self.bandit_metrics["requests"],
                    "avg_response_time": bandit_avg_time,
                    "success_rate": bandit_success_rate,
                    "avg_cost": bandit_avg_cost,
                },
                "improvements": {
                    "response_time_pct": (
                        (baseline_avg_time - bandit_avg_time) / baseline_avg_time
                    )
                    * 100,
                    "success_rate_pct": (bandit_success_rate - baseline_success_rate)
                    * 100,
                    "cost_change_pct": (
                        (bandit_avg_cost - baseline_avg_cost) / baseline_avg_cost
                    )
                    * 100,
                },
            }

        return comparison

    def _get_safety_status(self) -> Dict[str, Any]:
        """Get current safety status"""
        if self.bandit_metrics["requests"] == 0:
            return {"status": "no_data", "checks": []}

        error_rate = 1.0 - (
            self.bandit_metrics["success_count"] / self.bandit_metrics["requests"]
        )

        checks = [
            {
                "name": "error_rate",
                "current": error_rate,
                "threshold": self.max_error_rate,
                "status": "pass" if error_rate <= self.max_error_rate else "fail",
            }
        ]

        # Add cost check if baseline data available
        if self.baseline_metrics["requests"] > 0:
            baseline_avg_cost = (
                self.baseline_metrics["total_cost"] / self.baseline_metrics["requests"]
            )
            bandit_avg_cost = (
                self.bandit_metrics["total_cost"] / self.bandit_metrics["requests"]
            )
            cost_increase = (bandit_avg_cost - baseline_avg_cost) / baseline_avg_cost

            checks.append(
                {
                    "name": "cost_increase",
                    "current": cost_increase,
                    "threshold": self.max_cost_increase,
                    "status": (
                        "pass" if cost_increase <= self.max_cost_increase else "fail"
                    ),
                }
            )

        overall_status = (
            "pass" if all(check["status"] == "pass" for check in checks) else "fail"
        )

        return {"status": overall_status, "checks": checks}

    def _get_rollout_status(self) -> Dict[str, Any]:
        """Get rollout status and recommendations"""
        status = {
            "current_percentage": self.real_traffic_percentage,
            "stage": self._get_rollout_stage(),
            "can_increase": self._can_safely_increase_rollout(),
            "next_recommended_percentage": self._get_next_rollout_percentage(),
        }

        return status

    def _get_rollout_stage(self) -> str:
        """Get current rollout stage name"""
        if self.real_traffic_percentage == 0.0:
            return "shadow_only"
        elif self.real_traffic_percentage <= 0.01:
            return "canary_1_percent"
        elif self.real_traffic_percentage <= 0.05:
            return "small_rollout_5_percent"
        elif self.real_traffic_percentage <= 0.15:
            return "medium_rollout_15_percent"
        elif self.real_traffic_percentage <= 0.30:
            return "large_rollout_30_percent"
        elif self.real_traffic_percentage <= 0.60:
            return "majority_60_percent"
        else:
            return "full_rollout"

    def _can_safely_increase_rollout(self) -> bool:
        """Check if rollout can be safely increased"""
        if self.bandit_metrics["requests"] < 20:
            return False  # Need more data

        safety_status = self._get_safety_status()
        return safety_status["status"] == "pass"

    def _get_next_rollout_percentage(self) -> Optional[float]:
        """Get recommended next rollout percentage"""
        if not self._can_safely_increase_rollout():
            return None

        current = self.real_traffic_percentage

        if current == 0.0:
            return 0.01  # 1%
        elif current == 0.01:
            return 0.05  # 5%
        elif current == 0.05:
            return 0.15  # 15%
        elif current == 0.15:
            return 0.30  # 30%
        elif current == 0.30:
            return 0.60  # 60%
        elif current == 0.60:
            return 1.0  # 100%
        else:
            return None  # Already at max


# Factory function
async def create_week2_adaptive_router(
    model_manager: ModelManager,
    cache_manager: CacheManager,
    real_traffic_percentage: float = 0.01,
    monthly_budget_usd: float = 50.0,
) -> Week2AdaptiveRouter:
    """Create and initialize Week 2 adaptive router"""
    router = Week2AdaptiveRouter(
        model_manager=model_manager,
        cache_manager=cache_manager,
        enable_adaptive=True,
        real_traffic_percentage=real_traffic_percentage,
        enable_cost_tracking=True,
        monthly_budget_usd=monthly_budget_usd,
    )

    await router.initialize()
    return router
