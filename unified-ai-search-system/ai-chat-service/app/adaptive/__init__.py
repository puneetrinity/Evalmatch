"""
Adaptive Routing System - Thompson Sampling with Shadow Mode
Week 1 MVP for risk-free bandit testing
"""

from app.adaptive.bandit.thompson_sampling import (
    DEFAULT_ROUTING_ARMS,
    ThompsonSamplingBandit,
    create_routing_bandit,
)
from app.adaptive.rewards.calculator import (
    RewardTracker,
    RouteMetrics,
    SimpleRewardCalculator,
    create_mvp_reward_calculator,
)
from app.adaptive.shadow.shadow_router import ShadowResult, ShadowRouter

__all__ = [
    "ThompsonSamplingBandit",
    "create_routing_bandit",
    "DEFAULT_ROUTING_ARMS",
    "SimpleRewardCalculator",
    "create_mvp_reward_calculator",
    "RewardTracker",
    "RouteMetrics",
    "ShadowRouter",
    "ShadowResult",
]
