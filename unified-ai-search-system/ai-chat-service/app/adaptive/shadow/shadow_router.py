"""
Shadow Mode Router for Risk-Free Bandit Testing
Runs bandit-selected routes in parallel with production without affecting users
"""

import asyncio
import time
import uuid
from dataclasses import asdict, dataclass
from typing import Any, Dict, Optional, Tuple

import structlog

from app.adaptive.bandit.thompson_sampling import ThompsonSamplingBandit
from app.adaptive.rewards.calculator import (
    RewardTracker,
    RouteMetrics,
    SimpleRewardCalculator,
)

logger = structlog.get_logger(__name__)


@dataclass
class ShadowRequest:
    """Request data for shadow testing"""

    request_id: str
    original_query: str
    user_id: str
    session_id: str
    timestamp: float
    context: Dict[str, Any]

    @classmethod
    def from_state(cls, state: Any) -> "ShadowRequest":
        """Create from GraphState or similar"""
        return cls(
            request_id=str(uuid.uuid4()),
            original_query=getattr(state, "original_query", ""),
            user_id=getattr(state, "user_id", "anonymous"),
            session_id=getattr(state, "session_id", "unknown"),
            timestamp=time.time(),
            context=getattr(state, "context", {}),
        )


@dataclass
class ShadowResult:
    """Result from shadow route execution"""

    request_id: str
    arm_id: str
    success: bool
    response_time: float
    error_type: Optional[str] = None
    result_data: Optional[Dict] = None

    def to_metrics(self) -> RouteMetrics:
        """Convert to RouteMetrics for reward calculation"""
        return RouteMetrics(
            success=self.success,
            response_time_seconds=self.response_time,
            error_type=self.error_type,
        )


class ShadowRouter:
    """
    Shadow routing system for risk-free bandit testing

    How it works:
    1. Production request flows through normal route
    2. Simultaneously, bandit selects a route for shadow testing
    3. Shadow route executes in parallel (async)
    4. Results compared and used to train bandit
    5. Only production result returned to user
    """

    def __init__(
        self,
        bandit: ThompsonSamplingBandit,
        reward_calculator: SimpleRewardCalculator,
        reward_tracker: RewardTracker,
        shadow_enabled: bool = True,
        shadow_rate: float = 1.0,  # Percentage of requests to shadow test
        timeout_seconds: float = 30.0,
    ):
        self.bandit = bandit
        self.reward_calculator = reward_calculator
        self.reward_tracker = reward_tracker
        self.shadow_enabled = shadow_enabled
        self.shadow_rate = shadow_rate
        self.timeout_seconds = timeout_seconds

        # Statistics
        self.shadow_executions = 0
        self.shadow_timeouts = 0
        self.shadow_errors = 0

        logger.info(
            "shadow_router_initialized",
            shadow_enabled=shadow_enabled,
            shadow_rate=shadow_rate,
            timeout_seconds=timeout_seconds,
        )

    async def route_with_shadow(
        self,
        state: Any,
        production_router_func: callable,
        shadow_route_map: Dict[str, callable],
    ) -> Tuple[Any, Optional[ShadowResult]]:
        """
        Execute production route with optional shadow testing

        Args:
            state: Request state/data
            production_router_func: Function to execute production route
            shadow_route_map: Map of arm_id -> route function for shadow testing

        Returns:
            Tuple of (production_result, shadow_result)
        """
        shadow_request = ShadowRequest.from_state(state)

        # Always execute production route
        production_start = time.time()
        try:
            production_result = await production_router_func(state)
            production_time = time.time() - production_start
            production_success = True
        except Exception as e:
            logger.error(
                "production_route_failed",
                error=str(e),
                request_id=shadow_request.request_id,
            )
            production_result = None
            production_time = time.time() - production_start
            production_success = False
            raise  # Re-raise production errors

        # Execute shadow test if enabled
        shadow_result = None
        if self.shadow_enabled and self._should_shadow_test():
            shadow_result = await self._execute_shadow_test(
                shadow_request, shadow_route_map, state
            )

        # Log production metrics for analysis
        logger.info(
            "production_route_completed",
            request_id=shadow_request.request_id,
            success=production_success,
            response_time=production_time,
            shadow_tested=shadow_result is not None,
        )

        return production_result, shadow_result

    async def _execute_shadow_test(
        self,
        shadow_request: ShadowRequest,
        shadow_route_map: Dict[str, callable],
        state: Any,
    ) -> Optional[ShadowResult]:
        """Execute shadow test with bandit-selected route"""

        # Select arm using bandit
        try:
            selected_arm, confidence = self.bandit.select_arm(
                context={
                    "query": shadow_request.original_query,
                    "user_id": shadow_request.user_id,
                }
            )
        except Exception as e:
            logger.error("bandit_selection_failed", error=str(e))
            return None

        # Check if selected arm has a route
        if selected_arm not in shadow_route_map:
            logger.error(
                "shadow_route_not_found",
                selected_arm=selected_arm,
                available_routes=list(shadow_route_map.keys()),
            )
            return None

        # Execute shadow route with timeout
        shadow_start = time.time()
        try:
            shadow_route_func = shadow_route_map[selected_arm]

            # Execute with timeout
            shadow_task = asyncio.create_task(shadow_route_func(state))
            result_data = await asyncio.wait_for(
                shadow_task, timeout=self.timeout_seconds
            )

            shadow_time = time.time() - shadow_start
            shadow_result = ShadowResult(
                request_id=shadow_request.request_id,
                arm_id=selected_arm,
                success=True,
                response_time=shadow_time,
                result_data=result_data,
            )

            self.shadow_executions += 1

        except asyncio.TimeoutError:
            shadow_time = time.time() - shadow_start
            shadow_result = ShadowResult(
                request_id=shadow_request.request_id,
                arm_id=selected_arm,
                success=False,
                response_time=shadow_time,
                error_type="timeout",
            )
            self.shadow_timeouts += 1

        except Exception as e:
            shadow_time = time.time() - shadow_start
            shadow_result = ShadowResult(
                request_id=shadow_request.request_id,
                arm_id=selected_arm,
                success=False,
                response_time=shadow_time,
                error_type=str(type(e).__name__),
            )
            self.shadow_errors += 1

            logger.error(
                "shadow_route_failed",
                selected_arm=selected_arm,
                error=str(e),
                request_id=shadow_request.request_id,
            )

        # Calculate reward and update bandit
        await self._process_shadow_result(shadow_result)

        return shadow_result

    async def _process_shadow_result(self, shadow_result: ShadowResult) -> None:
        """Process shadow result and update bandit"""
        try:
            # Calculate reward
            metrics = shadow_result.to_metrics()
            reward_data = self.reward_calculator.calculate_reward(metrics)

            # Update bandit
            self.bandit.update_arm(shadow_result.arm_id, reward_data["total_reward"])

            # Track for analysis
            self.reward_tracker.record_reward(shadow_result.arm_id, reward_data)

            logger.info(
                "shadow_result_processed",
                request_id=shadow_result.request_id,
                arm_id=shadow_result.arm_id,
                reward=reward_data["total_reward"],
                success=shadow_result.success,
                response_time=shadow_result.response_time,
            )

        except Exception as e:
            logger.error(
                "shadow_result_processing_failed",
                error=str(e),
                shadow_result=asdict(shadow_result),
            )

    def _should_shadow_test(self) -> bool:
        """Determine if this request should be shadow tested"""
        import random

        return random.random() < self.shadow_rate

    def get_shadow_stats(self) -> Dict:
        """Get shadow testing statistics"""
        total_attempts = (
            self.shadow_executions + self.shadow_timeouts + self.shadow_errors
        )

        return {
            "enabled": self.shadow_enabled,
            "shadow_rate": self.shadow_rate,
            "total_attempts": total_attempts,
            "successful_executions": self.shadow_executions,
            "timeouts": self.shadow_timeouts,
            "errors": self.shadow_errors,
            "success_rate": self.shadow_executions / max(1, total_attempts),
            "bandit_stats": self.bandit.get_all_stats(),
        }

    def update_shadow_rate(self, new_rate: float) -> None:
        """Update shadow testing rate (for gradual rollout)"""
        old_rate = self.shadow_rate
        self.shadow_rate = max(0.0, min(1.0, new_rate))

        logger.info("shadow_rate_updated", old_rate=old_rate, new_rate=self.shadow_rate)

    def enable_shadow_mode(self, enabled: bool = True) -> None:
        """Enable/disable shadow mode"""
        self.shadow_enabled = enabled
        logger.info("shadow_mode_toggled", enabled=enabled)


# Example usage patterns
async def example_production_route(state):
    """Example production route function"""
    await asyncio.sleep(0.1)  # Simulate work
    return {"response": "production result", "route": "production"}


async def example_fast_route(state):
    """Example fast shadow route"""
    await asyncio.sleep(0.05)  # Faster
    return {"response": "fast result", "route": "fast_chat"}


async def example_search_route(state):
    """Example search-augmented shadow route"""
    await asyncio.sleep(0.3)  # Slower but more thorough
    return {"response": "search result", "route": "search_augmented"}


# Shadow route map for testing
EXAMPLE_SHADOW_ROUTES = {
    "fast_chat": example_fast_route,
    "search_augmented": example_search_route,
    "api_fallback": example_production_route,  # Same as production for testing
    "hybrid_mode": example_search_route,
}
