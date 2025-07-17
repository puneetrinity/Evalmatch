"""
A/B Testing Framework for Bandit Validation
Week 2: Compare bandit performance against baseline routing
"""

import time
from dataclasses import dataclass
from enum import Enum
from typing import Dict, List, Optional

import structlog

logger = structlog.get_logger(__name__)


class ExperimentArm(Enum):
    """A/B test arms"""

    BASELINE = "baseline"  # Original IntelligentRouter
    BANDIT = "bandit"  # Thompson Sampling bandit
    CONTROL = "control"  # Random routing (for calibration)


@dataclass
class ExperimentUser:
    """User assigned to A/B test"""

    user_id: str
    assigned_arm: ExperimentArm
    assignment_time: float
    session_count: int = 0
    total_requests: int = 0

    # Performance metrics
    avg_response_time: float = 0.0
    success_rate: float = 0.0
    total_cost_usd: float = 0.0

    # User experience metrics
    satisfaction_score: Optional[float] = None
    retention_rate: float = 0.0
    conversion_events: int = 0


@dataclass
class ExperimentResult:
    """Result from a single A/B test request"""

    experiment_id: str
    user_id: str
    arm: ExperimentArm
    request_id: str
    timestamp: float

    # Performance metrics
    response_time: float
    success: bool
    cost_usd: float
    error_type: Optional[str] = None

    # User experience
    user_feedback: Optional[float] = None
    followup_questions: int = 0
    bounce: bool = False
    conversion: bool = False

    # Context
    query_type: Optional[str] = None
    query_complexity: Optional[float] = None


class ABTestManager:
    """
    A/B Testing Manager for Bandit Validation

    Features:
    - User assignment with consistent routing
    - Statistical significance testing
    - Real-time performance comparison
    - Automatic experiment stopping rules
    """

    def __init__(
        self,
        experiment_name: str,
        traffic_split: Dict[ExperimentArm, float] = None,
        min_sample_size: int = 1000,
        max_experiment_days: int = 14,
        significance_threshold: float = 0.05,
        min_effect_size: float = 0.05,  # 5% minimum improvement to be meaningful
    ):
        self.experiment_name = experiment_name
        self.experiment_id = f"{experiment_name}_{int(time.time())}"

        # Default traffic split: 40% baseline, 50% bandit, 10% control
        self.traffic_split = traffic_split or {
            ExperimentArm.BASELINE: 0.4,
            ExperimentArm.BANDIT: 0.5,
            ExperimentArm.CONTROL: 0.1,
        }

        # Experiment parameters
        self.min_sample_size = min_sample_size
        self.max_experiment_days = max_experiment_days
        self.significance_threshold = significance_threshold
        self.min_effect_size = min_effect_size

        # Experiment state
        self.start_time = time.time()
        self.is_active = True
        self.stop_reason: Optional[str] = None

        # User assignments (in production, store in Redis/database)
        self.user_assignments: Dict[str, ExperimentUser] = {}

        # Results storage (in production, use ClickHouse/database)
        self.results: List[ExperimentResult] = []

        # Performance tracking per arm
        self.arm_stats: Dict[ExperimentArm, Dict] = {
            arm: {
                "requests": 0,
                "users": 0,
                "avg_response_time": 0.0,
                "success_rate": 0.0,
                "avg_cost": 0.0,
                "satisfaction_score": 0.0,
                "conversion_rate": 0.0,
            }
            for arm in ExperimentArm
        }

        logger.info(
            "ab_test_initialized",
            experiment_id=self.experiment_id,
            traffic_split=self.traffic_split,
            min_sample_size=min_sample_size,
        )

    def assign_user(self, user_id: str) -> ExperimentArm:
        """Assign user to experiment arm"""
        if not self.is_active:
            return ExperimentArm.BASELINE  # Default to baseline if experiment stopped

        # Check if user already assigned
        if user_id in self.user_assignments:
            return self.user_assignments[user_id].assigned_arm

        # Assign new user based on traffic split
        import random

        rand_val = random.random()
        cumulative = 0.0

        for arm, percentage in self.traffic_split.items():
            cumulative += percentage
            if rand_val <= cumulative:
                assigned_arm = arm
                break
        else:
            assigned_arm = ExperimentArm.BASELINE  # Fallback

        # Store assignment
        self.user_assignments[user_id] = ExperimentUser(
            user_id=user_id, assigned_arm=assigned_arm, assignment_time=time.time()
        )

        # Update arm stats
        self.arm_stats[assigned_arm]["users"] += 1

        logger.info(
            "user_assigned_to_experiment",
            user_id=user_id,
            assigned_arm=assigned_arm.value,
            experiment_id=self.experiment_id,
        )

        return assigned_arm

    def record_result(self, result: ExperimentResult) -> None:
        """Record experiment result"""
        if not self.is_active:
            return

        # Store result
        self.results.append(result)

        # Update user statistics
        if result.user_id in self.user_assignments:
            user = self.user_assignments[result.user_id]
            user.total_requests += 1

            # Update running averages
            n = user.total_requests
            user.avg_response_time = (
                (user.avg_response_time * (n - 1)) + result.response_time
            ) / n
            user.success_rate = (
                (user.success_rate * (n - 1)) + (1.0 if result.success else 0.0)
            ) / n
            user.total_cost_usd += result.cost_usd

            if result.user_feedback is not None:
                user.satisfaction_score = result.user_feedback

            if result.conversion:
                user.conversion_events += 1

        # Update arm statistics
        arm_stat = self.arm_stats[result.arm]
        n = arm_stat["requests"] + 1
        arm_stat["requests"] = n

        # Update running averages
        arm_stat["avg_response_time"] = (
            (arm_stat["avg_response_time"] * (n - 1)) + result.response_time
        ) / n
        arm_stat["success_rate"] = (
            (arm_stat["success_rate"] * (n - 1)) + (1.0 if result.success else 0.0)
        ) / n
        arm_stat["avg_cost"] = ((arm_stat["avg_cost"] * (n - 1)) + result.cost_usd) / n

        if result.user_feedback is not None:
            arm_stat["satisfaction_score"] = (
                (arm_stat["satisfaction_score"] * (n - 1)) + result.user_feedback
            ) / n

        if result.conversion:
            arm_stat["conversion_rate"] = (
                (arm_stat["conversion_rate"] * (n - 1)) + 1.0
            ) / n

        # Check stopping conditions
        self._check_stopping_conditions()

        logger.debug(
            "experiment_result_recorded",
            experiment_id=self.experiment_id,
            arm=result.arm.value,
            response_time=result.response_time,
            success=result.success,
        )

    def _check_stopping_conditions(self) -> None:
        """Check if experiment should be stopped"""
        if not self.is_active:
            return

        # Check time limit
        elapsed_days = (time.time() - self.start_time) / (24 * 3600)
        if elapsed_days > self.max_experiment_days:
            self._stop_experiment("time_limit_reached")
            return

        # Check minimum sample size
        total_requests = sum(
            arm_stat["requests"] for arm_stat in self.arm_stats.values()
        )
        if total_requests < self.min_sample_size:
            return

        # Check for significant results
        significance_result = self._test_statistical_significance()
        if significance_result["significant"]:
            self._stop_experiment(
                f"statistical_significance_reached: {significance_result['reason']}"
            )
            return

        # Check for early stopping due to poor performance
        bandit_performance = self.arm_stats[ExperimentArm.BANDIT]
        baseline_performance = self.arm_stats[ExperimentArm.BASELINE]

        # Stop if bandit is significantly worse (safety check)
        if (
            bandit_performance["requests"] > 100
            and baseline_performance["requests"] > 100
            and bandit_performance["success_rate"]
            < baseline_performance["success_rate"] * 0.9
        ):
            self._stop_experiment("bandit_performance_poor")
            return

    def _test_statistical_significance(self) -> Dict:
        """Test for statistical significance between arms"""
        bandit_stats = self.arm_stats[ExperimentArm.BANDIT]
        baseline_stats = self.arm_stats[ExperimentArm.BASELINE]

        # Need minimum samples for meaningful comparison
        if bandit_stats["requests"] < 100 or baseline_stats["requests"] < 100:
            return {"significant": False, "reason": "insufficient_samples"}

        # Simple significance test (in production, use proper statistical tests)
        response_time_diff = abs(
            bandit_stats["avg_response_time"] - baseline_stats["avg_response_time"]
        )
        response_time_baseline = baseline_stats["avg_response_time"]

        success_rate_diff = (
            bandit_stats["success_rate"] - baseline_stats["success_rate"]
        )
        cost_diff = (
            baseline_stats["avg_cost"] - bandit_stats["avg_cost"]
        )  # Positive = bandit cheaper

        # Check for meaningful improvements
        meaningful_improvement = (
            success_rate_diff > self.min_effect_size  # 5% better success rate
            or cost_diff > self.min_effect_size  # 5% cost reduction
            or (response_time_diff / response_time_baseline)
            > self.min_effect_size  # 5% speed improvement
        )

        if meaningful_improvement:
            return {
                "significant": True,
                "reason": "meaningful_improvement_detected",
                "improvements": {
                    "success_rate_diff": success_rate_diff,
                    "cost_diff": cost_diff,
                    "response_time_improvement": response_time_diff
                    / response_time_baseline,
                },
            }

        return {"significant": False, "reason": "no_meaningful_difference"}

    def _stop_experiment(self, reason: str) -> None:
        """Stop the experiment"""
        self.is_active = False
        self.stop_reason = reason

        logger.info(
            "experiment_stopped",
            experiment_id=self.experiment_id,
            reason=reason,
            duration_days=(time.time() - self.start_time) / (24 * 3600),
            total_users=len(self.user_assignments),
            total_requests=sum(
                arm_stat["requests"] for arm_stat in self.arm_stats.values()
            ),
        )

    def get_experiment_status(self) -> Dict:
        """Get current experiment status and results"""
        elapsed_time = time.time() - self.start_time
        total_requests = sum(
            arm_stat["requests"] for arm_stat in self.arm_stats.values()
        )

        status = {
            "experiment_id": self.experiment_id,
            "experiment_name": self.experiment_name,
            "is_active": self.is_active,
            "stop_reason": self.stop_reason,
            "elapsed_hours": elapsed_time / 3600,
            "total_users": len(self.user_assignments),
            "total_requests": total_requests,
            "progress": {
                "sample_size_progress": total_requests / self.min_sample_size,
                "time_progress": (elapsed_time / (24 * 3600))
                / self.max_experiment_days,
            },
            "arm_performance": {},
        }

        # Add arm performance comparison
        for arm, stats in self.arm_stats.items():
            if stats["requests"] > 0:
                status["arm_performance"][arm.value] = {
                    "users": stats["users"],
                    "requests": stats["requests"],
                    "avg_response_time": stats["avg_response_time"],
                    "success_rate": stats["success_rate"],
                    "avg_cost_cents": stats["avg_cost"] * 100,
                    "satisfaction_score": stats["satisfaction_score"],
                    "conversion_rate": stats["conversion_rate"],
                }

        # Add statistical significance if available
        if total_requests >= 100:
            status["significance_test"] = self._test_statistical_significance()

        return status

    def force_stop(self, reason: str = "manual_stop") -> None:
        """Manually stop the experiment"""
        self._stop_experiment(reason)

    def get_user_arm(self, user_id: str) -> Optional[ExperimentArm]:
        """Get assigned arm for user"""
        if user_id in self.user_assignments:
            return self.user_assignments[user_id].assigned_arm
        return None


class ExperimentManager:
    """Manages multiple A/B experiments"""

    def __init__(self):
        self.active_experiments: Dict[str, ABTestManager] = {}
        self.experiment_history: List[ABTestManager] = []

    def create_experiment(
        self,
        experiment_name: str,
        traffic_split: Dict[ExperimentArm, float] = None,
        **kwargs,
    ) -> ABTestManager:
        """Create new A/B experiment"""
        # Stop any existing experiment with same name
        if experiment_name in self.active_experiments:
            old_experiment = self.active_experiments[experiment_name]
            old_experiment.force_stop("replaced_by_new_experiment")
            self.experiment_history.append(old_experiment)
            del self.active_experiments[experiment_name]

        # Create new experiment
        experiment = ABTestManager(
            experiment_name=experiment_name, traffic_split=traffic_split, **kwargs
        )

        self.active_experiments[experiment_name] = experiment

        logger.info(
            "new_experiment_created",
            experiment_name=experiment_name,
            experiment_id=experiment.experiment_id,
        )

        return experiment

    def get_experiment(self, experiment_name: str) -> Optional[ABTestManager]:
        """Get active experiment by name"""
        return self.active_experiments.get(experiment_name)

    def get_all_experiments(self) -> Dict[str, Dict]:
        """Get status of all experiments"""
        return {
            name: experiment.get_experiment_status()
            for name, experiment in self.active_experiments.items()
        }


# Global experiment manager instance
_experiment_manager = ExperimentManager()


def get_experiment_manager() -> ExperimentManager:
    """Get global experiment manager instance"""
    return _experiment_manager
