"""
Simple Reward Calculator for Thompson Sampling Bandit
Week 1 MVP: Response time + Success rate
Week 2: Add cost efficiency
"""

import time
from dataclasses import dataclass
from typing import Dict, Optional

import structlog

logger = structlog.get_logger(__name__)


@dataclass
class RouteMetrics:
    """Metrics collected from a route execution"""

    success: bool
    response_time_seconds: float
    error_type: Optional[str] = None
    cost_cents: Optional[float] = None
    user_feedback: Optional[float] = None  # Future: thumbs up/down

    def __post_init__(self):
        self.response_time_seconds = max(0.0, self.response_time_seconds)


class SimpleRewardCalculator:
    """
    MVP reward calculator focusing on performance and reliability

    Week 1: response_time + success_rate
    Week 2: + cost_efficiency
    """

    def __init__(
        self,
        target_response_time: float = 2.5,  # Target response time in seconds
        max_response_time: float = 10.0,  # Maximum acceptable response time
        response_weight: float = 0.5,  # Weight for response time component
        success_weight: float = 0.5,  # Weight for success component
        cost_weight: float = 0.0,  # Week 2: Add cost component
    ):
        self.target_response_time = target_response_time
        self.max_response_time = max_response_time
        self.response_weight = response_weight
        self.success_weight = success_weight
        self.cost_weight = cost_weight

        # Validate weights sum to 1.0
        total_weight = response_weight + success_weight + cost_weight
        if abs(total_weight - 1.0) > 0.01:
            logger.warning(
                "reward_weights_dont_sum_to_one",
                total_weight=total_weight,
                weights={
                    "response": response_weight,
                    "success": success_weight,
                    "cost": cost_weight,
                },
            )

        logger.info(
            "reward_calculator_initialized",
            target_response_time=target_response_time,
            max_response_time=max_response_time,
            weights={
                "response": response_weight,
                "success": success_weight,
                "cost": cost_weight,
            },
        )

    def calculate_reward(self, metrics: RouteMetrics) -> Dict:
        """
        Calculate reward from route metrics

        Returns:
            Dict with reward score (0-1) and component breakdown
        """
        # Component 1: Response time score (0-1, higher is better)
        response_score = self._calculate_response_time_score(
            metrics.response_time_seconds
        )

        # Component 2: Success score (0-1, higher is better)
        success_score = 1.0 if metrics.success else 0.0

        # Component 3: Cost score (Week 2 feature)
        cost_score = (
            self._calculate_cost_score(metrics.cost_cents)
            if self.cost_weight > 0
            else 0.0
        )

        # Combine components
        total_reward = (
            response_score * self.response_weight
            + success_score * self.success_weight
            + cost_score * self.cost_weight
        )

        reward_breakdown = {
            "total_reward": total_reward,
            "response_score": response_score,
            "success_score": success_score,
            "cost_score": cost_score,
            "metrics": {
                "success": metrics.success,
                "response_time": metrics.response_time_seconds,
                "error_type": metrics.error_type,
                "cost_cents": metrics.cost_cents,
            },
        }

        logger.info(
            "reward_calculated", total_reward=total_reward, breakdown=reward_breakdown
        )

        return reward_breakdown

    def _calculate_response_time_score(self, response_time: float) -> float:
        """
        Calculate response time score (0-1 scale)

        Score calculation:
        - response_time <= target: score = 1.0
        - target < response_time <= max: linear decay from 1.0 to 0.1
        - response_time > max: score = 0.0
        """
        if response_time <= self.target_response_time:
            return 1.0
        elif response_time >= self.max_response_time:
            return 0.0
        else:
            # Linear decay from 1.0 to 0.1
            decay_range = self.max_response_time - self.target_response_time
            excess_time = response_time - self.target_response_time
            decay_factor = excess_time / decay_range
            return 1.0 - (decay_factor * 0.9)  # Decay from 1.0 to 0.1

    def _calculate_cost_score(self, cost_cents: Optional[float]) -> float:
        """
        Calculate cost efficiency score (Week 2 feature)

        For now, returns neutral score until we implement cost tracking
        """
        if cost_cents is None:
            return 0.5  # Neutral score for missing cost data

        # Week 2: Implement cost-based scoring
        # For now, simple inverse relationship
        if cost_cents <= 1.0:  # Very cheap
            return 1.0
        elif cost_cents >= 10.0:  # Expensive
            return 0.0
        else:
            # Linear decay
            return 1.0 - ((cost_cents - 1.0) / 9.0)

    def update_weights(
        self,
        response_weight: Optional[float] = None,
        success_weight: Optional[float] = None,
        cost_weight: Optional[float] = None,
    ) -> None:
        """Update reward component weights (for A/B testing)"""
        if response_weight is not None:
            self.response_weight = response_weight
        if success_weight is not None:
            self.success_weight = success_weight
        if cost_weight is not None:
            self.cost_weight = cost_weight

        logger.info(
            "reward_weights_updated",
            weights={
                "response": self.response_weight,
                "success": self.success_weight,
                "cost": self.cost_weight,
            },
        )


class RewardTracker:
    """Tracks reward statistics for analysis"""

    def __init__(self):
        self.rewards_by_arm: Dict[str, list] = {}
        self.recent_rewards: list = []
        self.max_recent_rewards = 1000

    def record_reward(self, arm_id: str, reward_data: Dict) -> None:
        """Record reward for analysis"""
        if arm_id not in self.rewards_by_arm:
            self.rewards_by_arm[arm_id] = []

        reward_entry = {"timestamp": time.time(), "arm_id": arm_id, **reward_data}

        self.rewards_by_arm[arm_id].append(reward_entry)
        self.recent_rewards.append(reward_entry)

        # Keep only recent rewards in memory
        if len(self.recent_rewards) > self.max_recent_rewards:
            self.recent_rewards = self.recent_rewards[-self.max_recent_rewards :]

    def get_arm_performance(self, arm_id: str, window_hours: int = 24) -> Dict:
        """Get performance stats for an arm"""
        if arm_id not in self.rewards_by_arm:
            return {"error": "arm_not_found"}

        cutoff_time = time.time() - (window_hours * 3600)
        recent_rewards = [
            r for r in self.rewards_by_arm[arm_id] if r["timestamp"] > cutoff_time
        ]

        if not recent_rewards:
            return {"error": "no_recent_data"}

        total_rewards = [r["total_reward"] for r in recent_rewards]
        response_times = [r["metrics"]["response_time"] for r in recent_rewards]

        return {
            "arm_id": arm_id,
            "sample_count": len(recent_rewards),
            "avg_reward": sum(total_rewards) / len(total_rewards),
            "avg_response_time": sum(response_times) / len(response_times),
            "success_rate": sum(1 for r in recent_rewards if r["metrics"]["success"])
            / len(recent_rewards),
            "window_hours": window_hours,
        }


# Create default instances
def create_mvp_reward_calculator() -> SimpleRewardCalculator:
    """Create MVP reward calculator for Week 1"""
    return SimpleRewardCalculator(
        target_response_time=2.5,  # Target 2.5s response
        max_response_time=10.0,  # 10s max acceptable
        response_weight=0.6,  # 60% weight on speed
        success_weight=0.4,  # 40% weight on success
        cost_weight=0.0,  # Week 2: Add cost component
    )
