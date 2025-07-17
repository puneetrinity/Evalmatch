"""
Enhanced Adaptive Router - Week 2 Integration
Combines Thompson Sampling, A/B Testing, Gradual Rollout, and Advanced Monitoring
"""

import time
import uuid
from typing import Any, Dict

import structlog

from app.adaptive.bandit.thompson_sampling import create_routing_bandit
from app.adaptive.monitoring.advanced_metrics import AdaptiveMonitor
from app.adaptive.rewards.enhanced_calculator import (
    EnhancedRouteMetrics,
    create_week2_reward_calculator,
)
from app.adaptive.rollout.gradual_rollout import GradualRolloutManager
from app.adaptive.shadow.shadow_router import ShadowRouter
from app.adaptive.validation.ab_testing import (
    ExperimentArm,
    ExperimentResult,
    get_experiment_manager,
)
from app.cache.redis_client import CacheManager
from app.graphs.base import GraphState, GraphType
from app.graphs.chat_graph import ChatGraph
from app.graphs.search_graph import SearchGraph
from app.models.manager import ModelManager

logger = structlog.get_logger(__name__)


class EnhancedAdaptiveRouter:
    """
    Week 2 Enhanced Adaptive Router

    Features:
    - Thompson Sampling bandit with enhanced rewards
    - A/B testing framework for validation
    - Gradual rollout from shadow to production
    - Advanced monitoring and alerting
    - Cost tracking and budget management
    - Contextual routing decisions
    """

    def __init__(
        self,
        model_manager: ModelManager,
        cache_manager: CacheManager,
        enable_adaptive: bool = True,
        enable_ab_testing: bool = True,
        enable_gradual_rollout: bool = True,
        shadow_rate: float = 0.3,
    ):
        # Core dependencies
        self.model_manager = model_manager
        self.cache_manager = cache_manager
        self.enable_adaptive = enable_adaptive
        self.enable_ab_testing = enable_ab_testing
        self.enable_gradual_rollout = enable_gradual_rollout

        # Original router for baseline comparison
        from app.graphs.intelligent_router import IntelligentRouter

        self.intelligent_router = IntelligentRouter(model_manager, cache_manager)

        # Week 2 Enhanced Components
        if enable_adaptive:
            # Enhanced bandit with fallback capability
            self.bandit = create_routing_bandit()

            # Enhanced reward system with cost and UX tracking
            self.reward_calculator = create_week2_reward_calculator()

            # Advanced monitoring and alerting
            self.monitor = AdaptiveMonitor(
                retention_hours=48
            )  # 48h retention for Week 2

            # Shadow router for safe testing
            self.shadow_router = ShadowRouter(
                bandit=self.bandit,
                reward_calculator=self.reward_calculator,
                reward_tracker=None,  # Using enhanced monitoring instead
                shadow_rate=shadow_rate,
                timeout_seconds=30.0,
            )

            # Gradual rollout manager
            if enable_gradual_rollout:
                self.rollout_manager = GradualRolloutManager(
                    rollout_name="adaptive_routing_v2", auto_advance=True
                )
            else:
                self.rollout_manager = None

            # A/B testing manager
            if enable_ab_testing:
                self.experiment_manager = get_experiment_manager()
                self.current_experiment = None
            else:
                self.experiment_manager = None
                self.current_experiment = None

        # Initialize graphs for routing
        self.graphs = {
            GraphType.CHAT: ChatGraph(model_manager),
            GraphType.SEARCH: SearchGraph(model_manager, cache_manager),
        }

        # Performance tracking
        self.request_count = 0
        self.total_cost_usd = 0.0

        logger.info(
            "enhanced_adaptive_router_initialized",
            enable_adaptive=enable_adaptive,
            enable_ab_testing=enable_ab_testing,
            enable_gradual_rollout=enable_gradual_rollout,
            shadow_rate=shadow_rate,
        )

    async def initialize(self):
        """Initialize the enhanced adaptive router system"""
        # Initialize base components
        await self.intelligent_router.initialize()

        # Initialize graphs
        for graph in self.graphs.values():
            await graph.initialize()

        # Start A/B experiment if enabled
        if self.enable_ab_testing and self.experiment_manager:
            await self._start_default_experiment()

        logger.info("enhanced_adaptive_router_initialized")

    async def _start_default_experiment(self):
        """Start default A/B experiment"""
        try:
            self.current_experiment = self.experiment_manager.create_experiment(
                experiment_name="bandit_vs_baseline_v2",
                traffic_split={
                    ExperimentArm.BASELINE: 0.4,  # 40% baseline
                    ExperimentArm.BANDIT: 0.5,  # 50% bandit
                    ExperimentArm.CONTROL: 0.1,  # 10% random (for calibration)
                },
                min_sample_size=2000,  # Need more samples for Week 2
                max_experiment_days=21,  # 3 weeks max
            )

            logger.info(
                "ab_experiment_started",
                experiment_id=self.current_experiment.experiment_id,
            )
        except Exception as e:
            logger.error("failed_to_start_ab_experiment", error=str(e))

    async def route_query(self, query: str, state: GraphState) -> Any:
        """
        Enhanced query routing with Week 2 features

        Routing decision logic:
        1. A/B test assignment (if enabled)
        2. Gradual rollout percentage (if enabled)
        3. Enhanced routing execution
        4. Comprehensive metrics collection
        """
        request_start_time = time.time()
        request_id = str(uuid.uuid4())
        user_id = getattr(state, "user_id", "anonymous")

        self.request_count += 1

        # Determine routing strategy
        routing_strategy = await self._determine_routing_strategy(user_id, state)

        try:
            # Execute routing based on strategy
            if routing_strategy == "baseline":
                result = await self._execute_baseline_route(query, state, request_id)
                routing_arm = "baseline"
            elif routing_strategy == "bandit":
                result = await self._execute_bandit_route(query, state, request_id)
                routing_arm = "bandit"
            elif routing_strategy == "control":
                result = await self._execute_control_route(query, state, request_id)
                routing_arm = "control"
            else:
                # Default to baseline for safety
                result = await self._execute_baseline_route(query, state, request_id)
                routing_arm = "baseline"

            # Record successful completion
            response_time = time.time() - request_start_time
            await self._record_request_completion(
                request_id=request_id,
                user_id=user_id,
                query=query,
                routing_arm=routing_arm,
                response_time=response_time,
                success=True,
                result=result,
            )

            return result

        except Exception as e:
            # Record failure
            response_time = time.time() - request_start_time
            await self._record_request_completion(
                request_id=request_id,
                user_id=user_id,
                query=query,
                routing_arm=routing_strategy,
                response_time=response_time,
                success=False,
                error=str(e),
            )
            raise

    async def _determine_routing_strategy(self, user_id: str, state: GraphState) -> str:
        """Determine which routing strategy to use"""
        # 1. Check A/B test assignment first
        if self.enable_ab_testing and self.current_experiment:
            experiment_arm = self.current_experiment.assign_user(user_id)

            if experiment_arm == ExperimentArm.BASELINE:
                return "baseline"
            elif experiment_arm == ExperimentArm.CONTROL:
                return "control"
            elif experiment_arm == ExperimentArm.BANDIT:
                # Continue to rollout check
                pass

        # 2. Check gradual rollout for bandit traffic
        if self.enable_gradual_rollout and self.rollout_manager:
            if self.rollout_manager.should_use_bandit(user_id):
                return "bandit"
            else:
                return "baseline"

        # 3. Default fallback
        if self.enable_adaptive:
            return "bandit"
        else:
            return "baseline"

    async def _execute_baseline_route(
        self, query: str, state: GraphState, request_id: str
    ) -> Any:
        """Execute baseline routing using original IntelligentRouter"""
        routing_decision = await self.intelligent_router.route_query(query, state)

        # Execute the selected graph
        selected_graph = self.graphs.get(routing_decision.selected_graph)
        if not selected_graph:
            raise ValueError(f"Graph not available: {routing_decision.selected_graph}")

        result = await selected_graph.execute(state)

        logger.debug(
            "baseline_route_executed",
            request_id=request_id,
            graph_type=routing_decision.selected_graph.value,
        )

        return result

    async def _execute_bandit_route(
        self, query: str, state: GraphState, request_id: str
    ) -> Any:
        """Execute bandit routing with enhanced features"""
        if not self.enable_adaptive:
            return await self._execute_baseline_route(query, state, request_id)

        # Get context for bandit decision
        context = self._extract_routing_context(query, state)

        # Select arm using bandit
        selected_arm, confidence = self.bandit.select_arm(context)

        # Record bandit decision
        self.monitor.record_bandit_decision(selected_arm, confidence, context)

        # Execute selected route
        route_function = self._get_route_function(selected_arm)
        result = await route_function(state)

        logger.debug(
            "bandit_route_executed",
            request_id=request_id,
            selected_arm=selected_arm,
            confidence=confidence,
        )

        return result

    async def _execute_control_route(
        self, query: str, state: GraphState, request_id: str
    ) -> Any:
        """Execute control routing (random selection for calibration)"""
        import random

        # Random selection between available routes
        available_routes = [
            "fast_chat",
            "search_augmented",
            "api_fallback",
            "hybrid_mode",
        ]
        selected_arm = random.choice(available_routes)

        route_function = self._get_route_function(selected_arm)
        result = await route_function(state)

        logger.debug(
            "control_route_executed", request_id=request_id, selected_arm=selected_arm
        )

        return result

    def _extract_routing_context(self, query: str, state: GraphState) -> Dict[str, Any]:
        """Extract context for contextual bandit decisions"""
        context = {
            "query_length": len(query),
            "query_words": len(query.split()),
            "user_id": getattr(state, "user_id", "anonymous"),
            "session_id": getattr(state, "session_id", "unknown"),
        }

        # Add time-based context
        import datetime

        now = datetime.datetime.now()
        context.update(
            {
                "hour_of_day": now.hour,
                "day_of_week": now.weekday(),
                "is_weekend": now.weekday() >= 5,
            }
        )

        # Add query complexity indicators
        complex_keywords = [
            "analyze",
            "compare",
            "research",
            "detailed",
            "comprehensive",
        ]
        search_keywords = ["latest", "recent", "current", "news", "today", "find"]

        context.update(
            {
                "has_complex_keywords": any(
                    keyword in query.lower() for keyword in complex_keywords
                ),
                "has_search_keywords": any(
                    keyword in query.lower() for keyword in search_keywords
                ),
                "query_complexity_score": self._calculate_query_complexity(query),
            }
        )

        return context

    def _calculate_query_complexity(self, query: str) -> float:
        """Calculate query complexity score (0-1)"""
        # Simple complexity calculation
        factors = []

        # Length factor
        factors.append(min(1.0, len(query) / 200))  # Cap at 200 chars

        # Word count factor
        factors.append(min(1.0, len(query.split()) / 30))  # Cap at 30 words

        # Question words factor
        question_words = ["what", "how", "why", "when", "where", "who", "which"]
        question_count = sum(1 for word in question_words if word in query.lower())
        factors.append(min(1.0, question_count / 3))

        return sum(factors) / len(factors)

    def _get_route_function(self, arm_id: str):
        """Get route function for bandit arm"""

        async def fast_chat_route(state: GraphState) -> Any:
            """Fast chat route using local models only"""
            chat_graph = self.graphs[GraphType.CHAT]
            return await chat_graph.execute(state)

        async def search_augmented_route(state: GraphState) -> Any:
            """Search-augmented route for complex queries"""
            search_graph = self.graphs[GraphType.SEARCH]
            return await search_graph.execute(state)

        async def api_fallback_route(state: GraphState) -> Any:
            """API fallback route (simulated)"""
            # Use chat graph with enhanced cost tracking
            chat_graph = self.graphs[GraphType.CHAT]
            result = await chat_graph.execute(state)
            # Track higher cost for API fallback simulation
            return result

        async def hybrid_route(state: GraphState) -> Any:
            """Hybrid local+API route"""
            query = getattr(state, "original_query", "")
            complexity = self._calculate_query_complexity(query)

            if complexity > 0.7:  # High complexity
                return await search_augmented_route(state)
            else:
                return await fast_chat_route(state)

        route_map = {
            "fast_chat": fast_chat_route,
            "search_augmented": search_augmented_route,
            "api_fallback": api_fallback_route,
            "hybrid_mode": hybrid_route,
        }

        return route_map.get(arm_id, fast_chat_route)  # Default to fast_chat

    async def _record_request_completion(
        self,
        request_id: str,
        user_id: str,
        query: str,
        routing_arm: str,
        response_time: float,
        success: bool,
        result: Any = None,
        error: str = None,
    ) -> None:
        """Record comprehensive request completion metrics"""

        # Estimate cost based on routing arm (simulated for now)
        estimated_cost = self._estimate_request_cost(routing_arm, query, success)
        self.total_cost_usd += estimated_cost

        # Record basic metrics
        if self.enable_adaptive and hasattr(self, "monitor"):
            self.monitor.record_request_completion(
                arm=routing_arm,
                response_time=response_time,
                success=success,
                cost_usd=estimated_cost,
            )

        # Record A/B experiment result
        if self.enable_ab_testing and self.current_experiment:
            experiment_result = ExperimentResult(
                experiment_id=self.current_experiment.experiment_id,
                user_id=user_id,
                arm=(
                    ExperimentArm(routing_arm)
                    if routing_arm in ["baseline", "bandit", "control"]
                    else ExperimentArm.BASELINE
                ),
                request_id=request_id,
                timestamp=time.time(),
                response_time=response_time,
                success=success,
                cost_usd=estimated_cost,
                error_type=error,
                query_type=self._classify_query_type(query),
                query_complexity=self._calculate_query_complexity(query),
            )

            self.current_experiment.record_result(experiment_result)

        # Record gradual rollout metrics
        if self.enable_gradual_rollout and self.rollout_manager:
            is_bandit_request = routing_arm == "bandit"
            self.rollout_manager.record_request_metrics(
                success=success,
                response_time=response_time,
                cost=estimated_cost,
                bandit_confidence=0.8,  # Would get from actual bandit
                is_bandit_request=is_bandit_request,
            )

        # Enhanced reward calculation for bandit learning
        if success and routing_arm == "bandit" and self.enable_adaptive:
            enhanced_metrics = EnhancedRouteMetrics(
                success=success,
                response_time_seconds=response_time,
                estimated_cost_usd=estimated_cost,
                api_calls_made=self._estimate_api_calls(routing_arm),
                tokens_consumed=self._estimate_tokens(query, result),
                cache_hit_rate=0.8,  # Real cache tracking would require integration
                memory_usage_mb=500,  # Real memory tracking would require system integration
                cpu_utilization=0.6,  # Real CPU tracking would require system integration
            )

            reward_data = self.reward_calculator.calculate_enhanced_reward(
                enhanced_metrics
            )

            # Update bandit with enhanced reward
            selected_arm = routing_arm  # Would need to track which bandit arm was used
            self.bandit.update_arm(selected_arm, reward_data["total_reward"])

    def _estimate_request_cost(
        self, routing_arm: str, query: str, success: bool
    ) -> float:
        """Estimate cost based on routing arm and query characteristics"""
        base_costs = {
            "baseline": 0.002,  # $0.002 per request
            "fast_chat": 0.001,  # Cheaper local processing
            "search_augmented": 0.005,  # More expensive due to search
            "api_fallback": 0.020,  # Most expensive API calls
            "hybrid_mode": 0.003,  # Mixed cost
            "bandit": 0.002,  # Average bandit cost
            "control": 0.002,  # Average control cost
        }

        base_cost = base_costs.get(routing_arm, 0.002)

        # Adjust based on query complexity
        complexity = self._calculate_query_complexity(query)
        cost_multiplier = 1.0 + (complexity * 0.5)  # Up to 50% more for complex queries

        # Penalty for failures (retry costs)
        if not success:
            cost_multiplier *= 1.2

        return base_cost * cost_multiplier

    def _estimate_api_calls(self, routing_arm: str) -> int:
        """Estimate number of API calls made"""
        api_call_estimates = {
            "fast_chat": 0,  # Local only
            "search_augmented": 2,  # Search + LLM
            "api_fallback": 3,  # Multiple API calls
            "hybrid_mode": 1,  # Mixed
            "baseline": 1,
            "bandit": 1,
            "control": 1,
        }

        return api_call_estimates.get(routing_arm, 1)

    def _estimate_tokens(self, query: str, result: Any) -> int:
        """Estimate tokens consumed"""
        # Simple token estimation
        query_tokens = len(query.split()) * 1.3  # Rough token estimate

        # Estimate response tokens (would be more accurate with real tokenizer)
        if result and hasattr(result, "__str__"):
            response_tokens = len(str(result).split()) * 1.3
        else:
            response_tokens = 100  # Default estimate

        return int(query_tokens + response_tokens)

    def _classify_query_type(self, query: str) -> str:
        """Classify query type for analysis"""
        query_lower = query.lower()

        if any(word in query_lower for word in ["search", "find", "latest", "recent"]):
            return "search"
        elif any(word in query_lower for word in ["analyze", "compare", "research"]):
            return "analysis"
        elif any(word in query_lower for word in ["code", "programming", "debug"]):
            return "code"
        elif any(
            word in query_lower for word in ["hello", "hi", "thanks", "thank you"]
        ):
            return "social"
        else:
            return "general"

    def get_comprehensive_status(self) -> Dict[str, Any]:
        """Get comprehensive status of all Week 2 features"""
        status = {
            "router_config": {
                "enable_adaptive": self.enable_adaptive,
                "enable_ab_testing": self.enable_ab_testing,
                "enable_gradual_rollout": self.enable_gradual_rollout,
            },
            "request_stats": {
                "total_requests": self.request_count,
                "total_cost_usd": self.total_cost_usd,
                "avg_cost_per_request": self.total_cost_usd
                / max(1, self.request_count),
            },
        }

        # Add component statuses
        if self.enable_adaptive and hasattr(self, "monitor"):
            status["monitoring"] = self.monitor.get_dashboard_data()

        if self.enable_ab_testing and self.current_experiment:
            status["ab_testing"] = self.current_experiment.get_experiment_status()

        if self.enable_gradual_rollout and self.rollout_manager:
            status["gradual_rollout"] = self.rollout_manager.get_rollout_status()

        if self.enable_adaptive and hasattr(self, "bandit"):
            status["bandit"] = self.bandit.get_all_stats()

        if self.enable_adaptive and hasattr(self, "reward_calculator"):
            status["budget"] = self.reward_calculator.get_budget_status()

        return status


# Factory function for enhanced router
async def create_enhanced_adaptive_router(
    model_manager: ModelManager,
    cache_manager: CacheManager,
    enable_adaptive: bool = True,
    enable_ab_testing: bool = True,
    enable_gradual_rollout: bool = True,
    shadow_rate: float = 0.3,
) -> EnhancedAdaptiveRouter:
    """Create and initialize enhanced adaptive router"""
    router = EnhancedAdaptiveRouter(
        model_manager=model_manager,
        cache_manager=cache_manager,
        enable_adaptive=enable_adaptive,
        enable_ab_testing=enable_ab_testing,
        enable_gradual_rollout=enable_gradual_rollout,
        shadow_rate=shadow_rate,
    )

    await router.initialize()
    return router
