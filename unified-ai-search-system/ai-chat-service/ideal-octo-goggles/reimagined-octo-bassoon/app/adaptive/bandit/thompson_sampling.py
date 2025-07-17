"""
Thompson Sampling Multi-Armed Bandit for Adaptive Routing
Bayesian approach to balance exploration vs exploitation
"""

import time
from dataclasses import asdict, dataclass
from typing import Dict, List, Optional, Tuple

import structlog

# Try to import scipy/numpy, fall back to simple implementation
try:
    import numpy as np
    from scipy.stats import beta

    SCIPY_AVAILABLE = True
except ImportError:
    SCIPY_AVAILABLE = False
    logger = structlog.get_logger(__name__)
    logger.warning("scipy/numpy not available, using simple Thompson sampling fallback")

logger = structlog.get_logger(__name__)


@dataclass
class BanditArm:
    """Represents a routing option with Thompson Sampling parameters"""

    arm_id: str
    name: str
    alpha: float = 1.0  # Success parameter (starts at 1 for uniform prior)
    beta_param: float = 1.0  # Failure parameter (starts at 1 for uniform prior)
    total_pulls: int = 0
    total_rewards: float = 0.0
    last_updated: float = 0.0

    def __post_init__(self):
        self.last_updated = time.time()

    @property
    def success_rate(self) -> float:
        """Expected success rate (mean of beta distribution)"""
        return self.alpha / (self.alpha + self.beta_param)

    @property
    def confidence_interval(self) -> Tuple[float, float]:
        """95% confidence interval for success rate"""
        return beta.interval(0.95, self.alpha, self.beta_param)

    def sample_reward_probability(self) -> float:
        """Sample from posterior beta distribution"""
        return np.random.beta(self.alpha, self.beta_param)

    def update(self, reward: float) -> None:
        """Update arm parameters with new reward (0-1 scale)"""
        self.total_pulls += 1
        self.total_rewards += reward

        # Update beta distribution parameters
        # High reward increases alpha, low reward increases beta
        self.alpha += reward
        self.beta_param += 1.0 - reward

        self.last_updated = time.time()

        logger.info(
            "bandit_arm_updated",
            arm_id=self.arm_id,
            reward=reward,
            alpha=self.alpha,
            beta=self.beta_param,
            success_rate=self.success_rate,
            total_pulls=self.total_pulls,
        )


class ThompsonSamplingBandit:
    """
    Thompson Sampling bandit for adaptive route selection

    Better than epsilon-greedy because:
    - Handles uncertainty naturally with Bayesian approach
    - Balances exploration/exploitation automatically
    - Works well with small data samples
    - Provides confidence intervals
    """

    def __init__(self, arms: List[Dict[str, str]], min_exploration_rate: float = 0.05):
        """
        Initialize bandit with routing arms

        Args:
            arms: List of arm configs [{"arm_id": "fast_route", "name": "Fast Route"}, ...]
            min_exploration_rate: Minimum exploration probability (safety net)
        """
        self.arms: Dict[str, BanditArm] = {}
        self.min_exploration_rate = min_exploration_rate
        self.total_pulls = 0
        self.start_time = time.time()

        # Initialize arms
        for arm_config in arms:
            arm = BanditArm(arm_id=arm_config["arm_id"], name=arm_config["name"])
            self.arms[arm.arm_id] = arm

        logger.info(
            "thompson_bandit_initialized",
            num_arms=len(self.arms),
            arm_ids=list(self.arms.keys()),
            min_exploration_rate=min_exploration_rate,
        )

    def select_arm(self, context: Optional[Dict] = None) -> Tuple[str, float]:
        """
        Select arm using Thompson Sampling

        Args:
            context: Optional context info (for future contextual bandits)

        Returns:
            Tuple of (arm_id, confidence_score)
        """
        if not self.arms:
            raise ValueError("No arms available for selection")

        # Sample from each arm's posterior distribution
        arm_samples = {}
        for arm_id, arm in self.arms.items():
            sample = arm.sample_reward_probability()
            arm_samples[arm_id] = sample

        # Select arm with highest sample
        selected_arm_id = max(arm_samples, key=arm_samples.get)
        confidence_score = arm_samples[selected_arm_id]

        # Safety: ensure minimum exploration
        if np.random.random() < self.min_exploration_rate:
            # Random exploration
            selected_arm_id = np.random.choice(list(self.arms.keys()))
            confidence_score = 0.0  # Low confidence for random selection

            logger.info(
                "bandit_random_exploration",
                selected_arm=selected_arm_id,
                exploration_rate=self.min_exploration_rate,
            )

        self.total_pulls += 1

        logger.info(
            "bandit_arm_selected",
            selected_arm=selected_arm_id,
            confidence_score=confidence_score,
            arm_samples=arm_samples,
            total_pulls=self.total_pulls,
            context=context,
        )

        return selected_arm_id, confidence_score

    def update_arm(self, arm_id: str, reward: float) -> None:
        """
        Update arm with reward feedback

        Args:
            arm_id: ID of arm to update
            reward: Reward value (0.0 to 1.0, where 1.0 is best)
        """
        if arm_id not in self.arms:
            logger.error(
                "invalid_arm_update",
                arm_id=arm_id,
                available_arms=list(self.arms.keys()),
            )
            return

        # Clamp reward to valid range
        reward = max(0.0, min(1.0, reward))

        self.arms[arm_id].update(reward)

        logger.info(
            "bandit_updated",
            arm_id=arm_id,
            reward=reward,
            arm_stats=self.get_arm_stats(arm_id),
        )

    def get_arm_stats(self, arm_id: str) -> Dict:
        """Get statistics for specific arm"""
        if arm_id not in self.arms:
            return {}

        arm = self.arms[arm_id]
        ci_low, ci_high = arm.confidence_interval

        return {
            "arm_id": arm.arm_id,
            "name": arm.name,
            "success_rate": arm.success_rate,
            "confidence_interval": {"low": ci_low, "high": ci_high},
            "total_pulls": arm.total_pulls,
            "total_rewards": arm.total_rewards,
            "alpha": arm.alpha,
            "beta": arm.beta_param,
            "last_updated": arm.last_updated,
        }

    def get_all_stats(self) -> Dict:
        """Get comprehensive bandit statistics"""
        stats = {
            "total_pulls": self.total_pulls,
            "uptime_seconds": time.time() - self.start_time,
            "arms": {},
        }

        for arm_id in self.arms:
            stats["arms"][arm_id] = self.get_arm_stats(arm_id)

        # Calculate best arm
        if self.arms:
            best_arm_id = max(self.arms.keys(), key=lambda x: self.arms[x].success_rate)
            stats["best_arm"] = best_arm_id
            stats["best_arm_confidence"] = self.arms[best_arm_id].success_rate

        return stats

    def save_state(self) -> Dict:
        """Save bandit state for persistence"""
        state = {
            "total_pulls": self.total_pulls,
            "start_time": self.start_time,
            "min_exploration_rate": self.min_exploration_rate,
            "arms": {},
        }

        for arm_id, arm in self.arms.items():
            state["arms"][arm_id] = asdict(arm)

        return state

    def load_state(self, state: Dict) -> None:
        """Load bandit state from persistence"""
        self.total_pulls = state.get("total_pulls", 0)
        self.start_time = state.get("start_time", time.time())
        self.min_exploration_rate = state.get("min_exploration_rate", 0.05)

        self.arms = {}
        for arm_id, arm_data in state.get("arms", {}).items():
            self.arms[arm_id] = BanditArm(**arm_data)

        logger.info(
            "bandit_state_loaded",
            total_pulls=self.total_pulls,
            num_arms=len(self.arms),
            arm_ids=list(self.arms.keys()),
        )


# Example routing arms for your system
DEFAULT_ROUTING_ARMS = [
    {"arm_id": "fast_chat", "name": "Fast Chat Route (Local Models)"},
    {"arm_id": "search_augmented", "name": "Search-Augmented Route"},
    {"arm_id": "api_fallback", "name": "API Fallback Route"},
    {"arm_id": "hybrid_mode", "name": "Hybrid Local+API Route"},
]


def create_routing_bandit():
    """Create a bandit configured for routing decisions"""
    if SCIPY_AVAILABLE:
        return ThompsonSamplingBandit(
            arms=DEFAULT_ROUTING_ARMS,
            min_exploration_rate=0.05,  # 5% minimum exploration
        )
    else:
        # Fall back to simple implementation
        from app.adaptive.bandit.simple_thompson import create_simple_routing_bandit

        logger.warning("Using simple Thompson sampling fallback (scipy not available)")
        return create_simple_routing_bandit()
