"""
Enhanced Reward Calculator for Week 2
Adds cost efficiency, user satisfaction, and business metrics
"""

import time
from dataclasses import dataclass
from typing import Dict, Optional

import structlog

from app.adaptive.rewards.calculator import RouteMetrics

logger = structlog.get_logger(__name__)


@dataclass
class EnhancedRouteMetrics(RouteMetrics):
    """Extended metrics for Week 2 features"""

    # Cost tracking
    api_calls_made: int = 0
    tokens_consumed: int = 0
    estimated_cost_usd: float = 0.0

    # User experience
    user_feedback_score: Optional[float] = None  # -1 to 1 (thumbs down to up)
    bounce_rate: Optional[float] = None  # Did user abandon after this response?
    followup_questions: int = 0  # Number of followup questions (engagement)

    # Business metrics
    conversion_event: bool = False  # Did this lead to a business conversion?
    user_satisfaction_predicted: Optional[float] = None  # ML-predicted satisfaction

    # Technical metrics
    cache_hit_rate: float = 0.0
    memory_usage_mb: float = 0.0
    cpu_utilization: float = 0.0


class EnhancedRewardCalculator:
    """
    Week 2 enhanced reward calculator with business and cost awareness

    Components:
    - Performance (speed + reliability): 40%
    - Cost efficiency: 30%
    - User experience: 20%
    - Business impact: 10%
    """

    def __init__(
        self,
        # Performance weights
        performance_weight: float = 0.4,
        target_response_time: float = 2.5,
        max_response_time: float = 10.0,
        # Cost weights
        cost_weight: float = 0.3,
        target_cost_cents: float = 2.0,  # Target cost per request
        max_cost_cents: float = 10.0,  # Maximum acceptable cost
        # User experience weights
        ux_weight: float = 0.2,
        # Business impact weights
        business_weight: float = 0.1,
        # Monthly budget tracking
        monthly_budget_usd: float = 50.0,
        cost_penalty_threshold: float = 0.8,  # Start penalizing at 80% budget
    ):
        self.performance_weight = performance_weight
        self.cost_weight = cost_weight
        self.ux_weight = ux_weight
        self.business_weight = business_weight

        # Performance params
        self.target_response_time = target_response_time
        self.max_response_time = max_response_time

        # Cost params
        self.target_cost_cents = target_cost_cents
        self.max_cost_cents = max_cost_cents

        # Budget tracking
        self.monthly_budget_usd = monthly_budget_usd
        self.cost_penalty_threshold = cost_penalty_threshold
        self.monthly_spend_tracker = 0.0
        self.budget_reset_time = time.time()

        # Validate weights
        total_weight = performance_weight + cost_weight + ux_weight + business_weight
        if abs(total_weight - 1.0) > 0.01:
            logger.warning(
                "reward_weights_dont_sum_to_one",
                total_weight=total_weight,
                weights={
                    "performance": performance_weight,
                    "cost": cost_weight,
                    "ux": ux_weight,
                    "business": business_weight,
                },
            )

        logger.info(
            "enhanced_reward_calculator_initialized",
            weights={
                "performance": performance_weight,
                "cost": cost_weight,
                "ux": ux_weight,
                "business": business_weight,
            },
            monthly_budget=monthly_budget_usd,
        )

    def calculate_enhanced_reward(self, metrics: EnhancedRouteMetrics) -> Dict:
        """
        Calculate comprehensive reward from enhanced metrics

        Returns detailed breakdown for analysis and tuning
        """
        # Update budget tracking
        self._update_budget_tracking(metrics.estimated_cost_usd)

        # Component 1: Performance score (speed + reliability)
        performance_score = self._calculate_performance_score(metrics)

        # Component 2: Cost efficiency score
        cost_score = self._calculate_cost_efficiency_score(metrics)

        # Component 3: User experience score
        ux_score = self._calculate_ux_score(metrics)

        # Component 4: Business impact score
        business_score = self._calculate_business_score(metrics)

        # Combine with weights
        total_reward = (
            performance_score * self.performance_weight
            + cost_score * self.cost_weight
            + ux_score * self.ux_weight
            + business_score * self.business_weight
        )

        # Apply budget penalty if over threshold
        budget_multiplier = self._get_budget_multiplier()
        adjusted_reward = total_reward * budget_multiplier

        reward_breakdown = {
            "total_reward": adjusted_reward,
            "base_reward": total_reward,
            "budget_multiplier": budget_multiplier,
            "components": {
                "performance": {
                    "score": performance_score,
                    "weight": self.performance_weight,
                    "contribution": performance_score * self.performance_weight,
                },
                "cost": {
                    "score": cost_score,
                    "weight": self.cost_weight,
                    "contribution": cost_score * self.cost_weight,
                },
                "ux": {
                    "score": ux_score,
                    "weight": self.ux_weight,
                    "contribution": ux_score * self.ux_weight,
                },
                "business": {
                    "score": business_score,
                    "weight": self.business_weight,
                    "contribution": business_score * self.business_weight,
                },
            },
            "metrics_used": {
                "response_time": metrics.response_time_seconds,
                "success": metrics.success,
                "cost_cents": metrics.estimated_cost_usd * 100,
                "user_feedback": metrics.user_feedback_score,
                "conversion": metrics.conversion_event,
            },
            "budget_status": {
                "monthly_spend": self.monthly_spend_tracker,
                "budget_remaining": self.monthly_budget_usd
                - self.monthly_spend_tracker,
                "budget_utilization": self.monthly_spend_tracker
                / self.monthly_budget_usd,
            },
        }

        logger.info(
            "enhanced_reward_calculated",
            total_reward=adjusted_reward,
            breakdown=reward_breakdown,
        )

        return reward_breakdown

    def _calculate_performance_score(self, metrics: EnhancedRouteMetrics) -> float:
        """Calculate performance score (speed + reliability + resource efficiency)"""
        # Speed component (50% of performance score)
        if metrics.response_time_seconds <= self.target_response_time:
            speed_score = 1.0
        elif metrics.response_time_seconds >= self.max_response_time:
            speed_score = 0.0
        else:
            decay_range = self.max_response_time - self.target_response_time
            excess_time = metrics.response_time_seconds - self.target_response_time
            speed_score = 1.0 - (excess_time / decay_range) * 0.9

        # Reliability component (40% of performance score)
        reliability_score = 1.0 if metrics.success else 0.0

        # Resource efficiency component (10% of performance score)
        # Reward cache hits and efficient resource usage
        cache_bonus = min(metrics.cache_hit_rate, 1.0) * 0.2  # Up to 20% bonus
        memory_penalty = (
            max(0, (metrics.memory_usage_mb - 1000) / 1000) * 0.1
        )  # Penalty for >1GB
        cpu_penalty = (
            max(0, (metrics.cpu_utilization - 0.8)) * 0.2
        )  # Penalty for >80% CPU

        efficiency_score = max(0.0, 1.0 + cache_bonus - memory_penalty - cpu_penalty)

        # Combine performance components
        performance_score = (
            speed_score * 0.5 + reliability_score * 0.4 + efficiency_score * 0.1
        )

        return max(0.0, min(1.0, performance_score))

    def _calculate_cost_efficiency_score(self, metrics: EnhancedRouteMetrics) -> float:
        """Calculate cost efficiency score"""
        cost_cents = metrics.estimated_cost_usd * 100

        if cost_cents <= self.target_cost_cents:
            return 1.0
        elif cost_cents >= self.max_cost_cents:
            return 0.0
        else:
            # Linear decay from target to max cost
            cost_range = self.max_cost_cents - self.target_cost_cents
            excess_cost = cost_cents - self.target_cost_cents
            return 1.0 - (excess_cost / cost_range) * 0.9  # Decay to 0.1 minimum

    def _calculate_ux_score(self, metrics: EnhancedRouteMetrics) -> float:
        """Calculate user experience score"""
        ux_components = []

        # User feedback component (60% of UX score)
        if metrics.user_feedback_score is not None:
            # Convert -1 to 1 scale to 0 to 1 scale
            feedback_score = (metrics.user_feedback_score + 1.0) / 2.0
            ux_components.append(("feedback", feedback_score, 0.6))

        # Engagement component (25% of UX score)
        # More followup questions = higher engagement
        engagement_score = min(
            1.0, metrics.followup_questions / 3.0
        )  # Cap at 3 questions
        ux_components.append(("engagement", engagement_score, 0.25))

        # Bounce rate component (15% of UX score)
        if metrics.bounce_rate is not None:
            retention_score = 1.0 - metrics.bounce_rate  # Lower bounce = higher score
            ux_components.append(("retention", retention_score, 0.15))

        # Calculate weighted average, handling missing components
        if not ux_components:
            return 0.5  # Neutral score when no UX data available

        total_weight = sum(weight for _, _, weight in ux_components)
        weighted_sum = sum(score * weight for _, score, weight in ux_components)

        return weighted_sum / total_weight if total_weight > 0 else 0.5

    def _calculate_business_score(self, metrics: EnhancedRouteMetrics) -> float:
        """Calculate business impact score"""
        business_components = []

        # Conversion component (70% of business score)
        conversion_score = 1.0 if metrics.conversion_event else 0.0
        business_components.append(("conversion", conversion_score, 0.7))

        # Predicted satisfaction component (30% of business score)
        if metrics.user_satisfaction_predicted is not None:
            satisfaction_score = max(0.0, min(1.0, metrics.user_satisfaction_predicted))
            business_components.append(("satisfaction", satisfaction_score, 0.3))

        # Calculate weighted average
        if not business_components:
            return 0.5  # Neutral score when no business data available

        total_weight = sum(weight for _, _, weight in business_components)
        weighted_sum = sum(score * weight for _, score, weight in business_components)

        return weighted_sum / total_weight if total_weight > 0 else 0.5

    def _update_budget_tracking(self, cost_usd: float) -> None:
        """Update monthly budget tracking"""
        current_time = time.time()

        # Reset monthly tracker if needed (30 days)
        if current_time - self.budget_reset_time > (30 * 24 * 3600):
            self.monthly_spend_tracker = 0.0
            self.budget_reset_time = current_time
            logger.info("monthly_budget_tracker_reset")

        # Add current cost
        self.monthly_spend_tracker += cost_usd

    def _get_budget_multiplier(self) -> float:
        """Calculate budget penalty multiplier"""
        budget_utilization = self.monthly_spend_tracker / self.monthly_budget_usd

        if budget_utilization < self.cost_penalty_threshold:
            return 1.0  # No penalty
        elif budget_utilization >= 1.0:
            return 0.1  # Severe penalty for over-budget
        else:
            # Linear penalty from threshold to budget limit
            penalty_range = 1.0 - self.cost_penalty_threshold
            excess_utilization = budget_utilization - self.cost_penalty_threshold
            penalty = (excess_utilization / penalty_range) * 0.9
            return 1.0 - penalty

    def get_budget_status(self) -> Dict:
        """Get current budget status"""
        utilization = self.monthly_spend_tracker / self.monthly_budget_usd

        return {
            "monthly_budget_usd": self.monthly_budget_usd,
            "current_spend_usd": self.monthly_spend_tracker,
            "remaining_budget_usd": self.monthly_budget_usd
            - self.monthly_spend_tracker,
            "budget_utilization": utilization,
            "penalty_active": utilization > self.cost_penalty_threshold,
            "budget_multiplier": self._get_budget_multiplier(),
            "days_since_reset": (time.time() - self.budget_reset_time) / (24 * 3600),
        }

    def update_weights(
        self,
        performance_weight: Optional[float] = None,
        cost_weight: Optional[float] = None,
        ux_weight: Optional[float] = None,
        business_weight: Optional[float] = None,
    ) -> None:
        """Update reward component weights (for A/B testing)"""
        if performance_weight is not None:
            self.performance_weight = performance_weight
        if cost_weight is not None:
            self.cost_weight = cost_weight
        if ux_weight is not None:
            self.ux_weight = ux_weight
        if business_weight is not None:
            self.business_weight = business_weight

        logger.info(
            "enhanced_reward_weights_updated",
            weights={
                "performance": self.performance_weight,
                "cost": self.cost_weight,
                "ux": self.ux_weight,
                "business": self.business_weight,
            },
        )


def create_week2_reward_calculator() -> EnhancedRewardCalculator:
    """Create enhanced reward calculator for Week 2"""
    return EnhancedRewardCalculator(
        performance_weight=0.4,  # 40% - Speed and reliability
        cost_weight=0.3,  # 30% - Cost efficiency
        ux_weight=0.2,  # 20% - User experience
        business_weight=0.1,  # 10% - Business impact
        monthly_budget_usd=50.0,  # $50/month budget
    )
