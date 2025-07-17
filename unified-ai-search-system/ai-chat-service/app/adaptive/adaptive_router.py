"""
Adaptive Router with Thompson Sampling + Shadow Mode
Integrates with existing IntelligentRouter for MVP testing
"""

import time
from typing import Any, Dict

import structlog

from app.adaptive.bandit.thompson_sampling import create_routing_bandit
from app.adaptive.rewards.calculator import RewardTracker, create_mvp_reward_calculator
from app.adaptive.shadow.shadow_router import ShadowRouter
from app.cache.redis_client import CacheManager
from app.graphs.base import GraphState, GraphType
from app.graphs.chat_graph import ChatGraph
from app.graphs.search_graph import SearchGraph
from app.models.manager import ModelManager

logger = structlog.get_logger(__name__)


class AdaptiveIntelligentRouter:
    """
    Enhanced IntelligentRouter with Thompson Sampling bandit + shadow mode

    Week 1 MVP Strategy:
    - Keep existing IntelligentRouter as production route
    - Add Thompson Sampling bandit for shadow testing
    - Learn from parallel executions without affecting users
    - Gradually increase confidence in adaptive routing
    """

    def __init__(
        self,
        model_manager: ModelManager,
        cache_manager: CacheManager,
        enable_adaptive: bool = True,
        shadow_rate: float = 0.3,  # Start with 30% shadow testing
    ):
        # Original router (production path)
        from app.graphs.intelligent_router import IntelligentRouter

        self.intelligent_router = IntelligentRouter(model_manager, cache_manager)

        # Adaptive components
        self.model_manager = model_manager
        self.cache_manager = cache_manager
        self.enable_adaptive = enable_adaptive

        # Initialize adaptive system
        if enable_adaptive:
            self.bandit = create_routing_bandit()
            self.reward_calculator = create_mvp_reward_calculator()
            self.reward_tracker = RewardTracker()
            self.shadow_router = ShadowRouter(
                bandit=self.bandit,
                reward_calculator=self.reward_calculator,
                reward_tracker=self.reward_tracker,
                shadow_rate=shadow_rate,
                timeout_seconds=15.0,  # Conservative timeout
            )
        else:
            self.bandit = None
            self.shadow_router = None

        # Initialize graphs for shadow testing
        self.graphs = {
            GraphType.CHAT: ChatGraph(model_manager, cache_manager),
            GraphType.SEARCH: SearchGraph(model_manager, cache_manager),
        }

        logger.info(
            "adaptive_router_initialized",
            enable_adaptive=enable_adaptive,
            shadow_rate=shadow_rate if enable_adaptive else 0,
        )

    async def initialize(self):
        """Initialize the adaptive router system"""
        try:
            # Initialize original router
            if hasattr(self.intelligent_router, 'initialize'):
                await self.intelligent_router.initialize()

            # Initialize graphs
            for graph_type, graph in self.graphs.items():
                if hasattr(graph, 'initialize'):
                    await graph.initialize()
                    logger.debug(f"Initialized {graph_type.value} graph")

            # Initialize adaptive components if enabled
            if self.enable_adaptive and self.shadow_router:
                if hasattr(self.shadow_router, 'initialize'):
                    await self.shadow_router.initialize()

            logger.info("adaptive_router_system_initialized")
        except Exception as e:
            logger.error(f"adaptive_router_initialization_failed: {e}")
            raise

    async def route_query(self, query: str, state: GraphState) -> Any:
        """
        Route query with optional shadow testing

        Strategy:
        1. Always execute production route (IntelligentRouter)
        2. Optionally execute shadow route in parallel (bandit selection)
        3. Learn from shadow results to improve bandit
        4. Return production result to user
        """
        if not self.enable_adaptive or not self.shadow_router:
            # Fallback to original router
            return await self._execute_production_route(query, state)

        # Create shadow route map
        shadow_routes = self._create_shadow_route_map()

        # Execute with shadow testing
        production_result, shadow_result = await self.shadow_router.route_with_shadow(
            state=state,
            production_router_func=lambda s: self._execute_production_route(query, s),
            shadow_route_map=shadow_routes,
        )

        # Log shadow comparison (for analysis)
        if shadow_result:
            await self._log_shadow_comparison(
                query, state, production_result, shadow_result
            )

        return production_result

    async def _execute_production_route(self, query: str, state: GraphState) -> Any:
        """Execute the production route using IntelligentRouter"""
        start_time = time.time()

        try:
            # Get routing decision from intelligent router
            routing_decision = await self.intelligent_router.route_query(query, state)

            # Execute the selected graph
            selected_graph = self.graphs.get(routing_decision.selected_graph)
            if not selected_graph:
                raise ValueError(
                    f"Graph not available: {routing_decision.selected_graph}"
                )

            result = await selected_graph.execute(state)

            execution_time = time.time() - start_time

            logger.info(
                "production_route_executed",
                query_id=getattr(state, "query_id", "unknown"),
                graph_type=routing_decision.selected_graph.value,
                execution_time=execution_time,
                success=True,
            )

            return result

        except Exception as e:
            execution_time = time.time() - start_time
            logger.error(
                "production_route_failed",
                query_id=getattr(state, "query_id", "unknown"),
                error=str(e),
                execution_time=execution_time,
            )
            raise

    def _create_shadow_route_map(self) -> Dict[str, callable]:
        """Create mapping of bandit arms to shadow route functions"""

        async def fast_chat_route(state: GraphState) -> Any:
            """Fast chat route using local models only"""
            chat_graph = self.graphs[GraphType.CHAT]
            return await chat_graph.execute(state)

        async def search_augmented_route(state: GraphState) -> Any:
            """Search-augmented route for complex queries"""
            search_graph = self.graphs[GraphType.SEARCH]
            return await search_graph.execute(state)

        async def api_fallback_route(state: GraphState) -> Any:
            """API fallback route (simulated for now)"""
            # For MVP, this is the same as fast_chat but with different routing logic
            return await fast_chat_route(state)

        async def hybrid_route(state: GraphState) -> Any:
            """Hybrid local+API route"""
            # For MVP, alternate between chat and search based on query complexity
            query = getattr(state, "original_query", "")
            if len(query.split()) > 10:  # Complex query
                return await search_augmented_route(state)
            else:
                return await fast_chat_route(state)

        return {
            "fast_chat": fast_chat_route,
            "search_augmented": search_augmented_route,
            "api_fallback": api_fallback_route,
            "hybrid_mode": hybrid_route,
        }

    async def _log_shadow_comparison(
        self, query: str, state: GraphState, production_result: Any, shadow_result: Any
    ) -> None:
        """Log comparison between production and shadow results"""
        try:
            comparison_data = {
                "query": query,
                "query_id": getattr(state, "query_id", "unknown"),
                "production_success": production_result is not None,
                "shadow_arm": shadow_result.arm_id,
                "shadow_success": shadow_result.success,
                "shadow_response_time": shadow_result.response_time,
                "shadow_error": shadow_result.error_type,
            }

            logger.info("shadow_comparison", **comparison_data)

            # Store for analysis (optional: persist to database/analytics)
            await self._store_comparison_data(comparison_data)

        except Exception as e:
            logger.error("shadow_comparison_logging_failed", error=str(e))

    async def _store_comparison_data(self, comparison_data: Dict) -> None:
        """Store comparison data for analysis (Week 2 feature)"""
        try:
            # For MVP, store in Redis with TTL
            cache_key = f"shadow_comparison:{comparison_data['query_id']}"
            await self.cache_manager.set(
                cache_key, comparison_data, ttl=86400  # 24 hours
            )
        except Exception as e:
            logger.warning("comparison_data_storage_failed", error=str(e))

    def get_adaptive_stats(self) -> Dict:
        """Get adaptive routing statistics"""
        if not self.enable_adaptive or not self.shadow_router:
            return {"adaptive_enabled": False}

        bandit_stats = self.bandit.get_all_stats()
        shadow_stats = self.shadow_router.get_shadow_stats()

        # Add performance analysis
        performance_stats = {}
        for arm_id in bandit_stats.get("arms", {}):
            arm_perf = self.reward_tracker.get_arm_performance(arm_id)
            if "error" not in arm_perf:
                performance_stats[arm_id] = arm_perf

        return {
            "adaptive_enabled": True,
            "bandit_stats": bandit_stats,
            "shadow_stats": shadow_stats,
            "performance_stats": performance_stats,
        }

    def update_shadow_rate(self, new_rate: float) -> None:
        """Update shadow testing rate"""
        if self.shadow_router:
            self.shadow_router.update_shadow_rate(new_rate)

    def enable_adaptive_mode(self, enabled: bool = True) -> None:
        """Enable/disable adaptive mode"""
        old_state = self.enable_adaptive
        self.enable_adaptive = enabled

        if self.shadow_router:
            self.shadow_router.enable_shadow_mode(enabled)

        logger.info("adaptive_mode_toggled", old_state=old_state, new_state=enabled)

    async def get_routing_recommendation(self, query: str, state: GraphState) -> Dict:
        """Get bandit recommendation without executing (for analysis)"""
        if not self.enable_adaptive or not self.bandit:
            return {"error": "adaptive_mode_disabled"}

        try:
            selected_arm, confidence = self.bandit.select_arm(
                context={
                    "query": query,
                    "user_id": getattr(state, "user_id", "anonymous"),
                }
            )

            return {
                "recommended_arm": selected_arm,
                "confidence": confidence,
                "bandit_stats": self.bandit.get_all_stats(),
            }
        except Exception as e:
            logger.error("recommendation_failed", error=str(e))
            return {"error": str(e)}


# Factory function for easy setup
async def create_adaptive_router(
    model_manager: ModelManager,
    cache_manager: CacheManager,
    enable_adaptive: bool = True,
    shadow_rate: float = 0.3,
) -> AdaptiveIntelligentRouter:
    """Create and initialize adaptive router"""
    router = AdaptiveIntelligentRouter(
        model_manager=model_manager,
        cache_manager=cache_manager,
        enable_adaptive=enable_adaptive,
        shadow_rate=shadow_rate,
    )

    await router.initialize()
    return router
