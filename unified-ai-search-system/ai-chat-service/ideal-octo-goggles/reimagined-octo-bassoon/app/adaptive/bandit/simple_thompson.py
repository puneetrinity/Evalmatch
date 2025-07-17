"""
Simple Thompson Sampling without scipy dependency
Fallback implementation for environments without scipy
"""

import math
import random
import time
from dataclasses import asdict, dataclass
from typing import Dict, List, Optional, Tuple

import structlog

logger = structlog.get_logger(__name__)


@dataclass
class SimpleBanditArm:
    """Simple bandit arm without scipy dependencies"""

    arm_id: str
    name: str
    alpha: float = 1.0  # Success parameter
    beta_param: float = 1.0  # Failure parameter
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
        """Approximate 95% confidence interval"""
        # Simplified confidence interval calculation
        n = self.alpha + self.beta_param - 2
        if n <= 0:
            return (0.0, 1.0)

        p = self.success_rate
        # Simple normal approximation for large n
        if n > 30:
            std_err = math.sqrt(p * (1 - p) / n)
            margin = 1.96 * std_err  # 95% CI
            return (max(0.0, p - margin), min(1.0, p + margin))
        else:
            # Wide interval for small samples
            margin = 0.5 / (n + 1)
            return (max(0.0, p - margin), min(1.0, p + margin))

    def sample_reward_probability(self) -> float:
        """Simple approximation of beta distribution sampling"""
        # Use success rate with some exploration noise
        base_prob = self.success_rate

        # Add uncertainty-based exploration
        uncertainty = 1.0 / (self.alpha + self.beta_param)  # Higher for less data
        noise_scale = uncertainty * 0.3  # Scale noise by uncertainty

        # Random noise around the success rate
        noise = (random.random() - 0.5) * noise_scale * 2
        sampled_prob = base_prob + noise

        # Keep in valid range
        return max(0.0, min(1.0, sampled_prob))

    def update(self, reward: float) -> None:
        """Update arm parameters with new reward"""
        self.total_pulls += 1
        self.total_rewards += reward

        # Update beta distribution parameters
        self.alpha += reward
        self.beta_param += 1.0 - reward

        self.last_updated = time.time()

        logger.info(
            "simple_bandit_arm_updated",
            arm_id=self.arm_id,
            reward=reward,
            alpha=self.alpha,
            beta=self.beta_param,
            success_rate=self.success_rate,
            total_pulls=self.total_pulls,
        )


class SimpleThompsonBandit:
    """
    Simple Thompson Sampling bandit without scipy dependency

    Uses approximations for beta distribution sampling
    Good enough for MVP testing and environments without scipy
    """

    def __init__(self, arms: List[Dict[str, str]], min_exploration_rate: float = 0.05):
        """Initialize simple bandit"""
        self.arms: Dict[str, SimpleBanditArm] = {}
        self.min_exploration_rate = min_exploration_rate
        self.total_pulls = 0
        self.start_time = time.time()

        # Initialize arms
        for arm_config in arms:
            arm = SimpleBanditArm(arm_id=arm_config["arm_id"], name=arm_config["name"])
            self.arms[arm.arm_id] = arm

        logger.info(
            "simple_thompson_bandit_initialized",
            num_arms=len(self.arms),
            arm_ids=list(self.arms.keys()),
            min_exploration_rate=min_exploration_rate,
        )

    def select_arm(self, context: Optional[Dict] = None) -> Tuple[str, float]:
        """Select arm using simple Thompson Sampling"""
        if not self.arms:
            raise ValueError("No arms available for selection")

        # Sample from each arm's approximate posterior
        arm_samples = {}
        for arm_id, arm in self.arms.items():
            sample = arm.sample_reward_probability()
            arm_samples[arm_id] = sample

        # Select arm with highest sample
        selected_arm_id = max(arm_samples, key=arm_samples.get)
        confidence_score = arm_samples[selected_arm_id]

        # Safety: ensure minimum exploration
        if random.random() < self.min_exploration_rate:
            selected_arm_id = random.choice(list(self.arms.keys()))
            confidence_score = 0.0

            logger.info(
                "simple_bandit_random_exploration",
                selected_arm=selected_arm_id,
                exploration_rate=self.min_exploration_rate,
            )

        self.total_pulls += 1

        logger.info(
            "simple_bandit_arm_selected",
            selected_arm=selected_arm_id,
            confidence_score=confidence_score,
            arm_samples=arm_samples,
            total_pulls=self.total_pulls,
            context=context,
        )

        return selected_arm_id, confidence_score

    def update_arm(self, arm_id: str, reward: float) -> None:
        """Update arm with reward feedback"""
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
            "simple_bandit_updated",
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
            self.arms[arm_id] = SimpleBanditArm(**arm_data)

        logger.info(
            "simple_bandit_state_loaded",
            total_pulls=self.total_pulls,
            num_arms=len(self.arms),
            arm_ids=list(self.arms.keys()),
        )


# Fallback creation function
def create_simple_routing_bandit() -> SimpleThompsonBandit:
    """Create a simple bandit for environments without scipy"""
    from app.adaptive.bandit.thompson_sampling import DEFAULT_ROUTING_ARMS

    return SimpleThompsonBandit(arms=DEFAULT_ROUTING_ARMS, min_exploration_rate=0.05)
