"""
Recruitment-Specific Model Router
Intelligent model selection for recruitment tasks with A5000 optimization.
"""

import logging
from typing import Any, Dict, List, Optional

from app.core.model_router import ModelRouter

logger = logging.getLogger(__name__)


class RecruitmentModelRouter(ModelRouter):
    """Enhanced model router specifically for recruitment workflows"""

    def __init__(self):
        super().__init__()

        # Recruitment-specific model configurations
        self.recruitment_configs = {
            "resume_parsing": {
                "model": "deepseek-llm:7b",
                "max_tokens": 1000,
                "use_case": "structured_data_extraction",
                "expected_time": 3.0,
                "priority": "high",
                "preload": True,
                "description": "Latest DeepSeek (June 2024) for structured data extraction",
            },
            "bias_detection": {
                "model": "mistral",
                "max_tokens": 300,
                "use_case": "language_analysis",
                "expected_time": 2.0,
                "priority": "high",
                "preload": True,
                "description": "Contextual sensitivity for inclusive language detection",
            },
            "matching_logic": {
                "model": "llama3",
                "max_tokens": 500,
                "use_case": "reasoning_comparison",
                "expected_time": 4.0,
                "priority": "medium",
                "preload": False,
                "description": "Strongest reasoning for persona-fingerprint matching",
            },
            "conversational_script_generation": {
                "model": "llama3",
                "max_tokens": 800,
                "use_case": "long_form_generation",
                "expected_time": 5.0,
                "priority": "medium",
                "preload": False,
                "description": "Long prompts and structured output for recruiter scripts",
            },
            "report_generation": {
                "model": "phi3:mini",
                "max_tokens": 200,
                "use_case": "summary_reports",
                "expected_time": 1.0,
                "priority": "high",
                "preload": True,
                "description": "Lightweight for summaries and score-based reports",
            },
        }

        # Workflow patterns for batch operations
        self.workflow_patterns = {
            "full_recruitment_pipeline": [
                "resume_parsing",
                "bias_detection",
                "matching_logic",
                "conversational_script_generation",
                "report_generation",
            ],
            "screening_workflow": [
                "resume_parsing",
                "bias_detection",
                "report_generation",
            ],
            "matching_workflow": [
                "matching_logic",
                "conversational_script_generation",
                "report_generation",
            ],
            "quick_assessment": ["resume_parsing", "report_generation"],
        }

        logger.info(
            "RecruitmentModelRouter initialized with recruitment-specific configurations"
        )

    def analyze_recruitment_task(self, task_description: str, content: str = "") -> str:
        """Determine the recruitment task type from description and content"""
        task_lower = task_description.lower()
        content_lower = content.lower()

        # Resume parsing indicators
        resume_indicators = [
            "parse resume",
            "extract resume",
            "resume data",
            "cv parsing",
            "extract skills",
            "work experience",
            "education",
            "contact info",
        ]
        if any(indicator in task_lower for indicator in resume_indicators):
            logger.debug(f"Identified resume parsing task: {task_description[:50]}...")
            return "resume_parsing"

        # Bias detection indicators
        bias_indicators = [
            "bias check",
            "inclusive language",
            "discrimination",
            "bias detection",
            "job description review",
            "jd bias",
            "inclusive hiring",
            "fair language",
        ]
        if any(indicator in task_lower for indicator in bias_indicators):
            logger.debug(f"Identified bias detection task: {task_description[:50]}...")
            return "bias_detection"

        # Matching logic indicators
        matching_indicators = [
            "match candidate",
            "persona fingerprint",
            "skill matching",
            "candidate fit",
            "compare skills",
            "analyze fit",
            "matching score",
            "compatibility",
        ]
        if any(indicator in task_lower for indicator in matching_indicators):
            logger.debug(f"Identified matching logic task: {task_description[:50]}...")
            return "matching_logic"

        # Script generation indicators
        script_indicators = [
            "recruiter script",
            "conversation script",
            "interview prep",
            "outreach message",
            "personalized message",
            "recruitment email",
            "candidate outreach",
        ]
        if any(indicator in task_lower for indicator in script_indicators):
            logger.debug(
                f"Identified script generation task: {task_description[:50]}..."
            )
            return "conversational_script_generation"

        # Report generation indicators
        report_indicators = [
            "generate report",
            "summary report",
            "candidate summary",
            "assessment report",
            "score report",
            "brief summary",
            "quick summary",
        ]
        if any(indicator in task_lower for indicator in report_indicators):
            logger.debug(
                f"Identified report generation task: {task_description[:50]}..."
            )
            return "report_generation"

        # Fallback to content analysis for more complex detection
        return self._analyze_content_type(content_lower)

    def _analyze_content_type(self, content: str) -> str:
        """Analyze content to determine task type"""
        if not content:
            return "report_generation"  # Default for simple tasks

        # Look for resume-like content
        resume_markers = [
            "experience:",
            "education:",
            "skills:",
            "contact:",
            "@",
            "phone:",
            "years of experience",
            "bachelor",
            "master",
            "degree",
            "university",
        ]
        if any(marker in content for marker in resume_markers):
            return "resume_parsing"

        # Look for job description content
        jd_markers = [
            "job description",
            "responsibilities:",
            "requirements:",
            "qualifications:",
            "we are looking for",
            "candidate should",
            "required skills",
        ]
        if any(marker in content for marker in jd_markers):
            return "bias_detection"

        # Look for comparison/matching content
        comparison_markers = [
            "compare",
            "match",
            "vs",
            "versus",
            "candidate a",
            "candidate b",
            "persona:",
            "fingerprint:",
            "score:",
        ]
        if any(marker in content for marker in comparison_markers):
            return "matching_logic"

        # Default to report generation for simple content
        return "report_generation"

    def get_recruitment_model_config(
        self, task_type: str, content_complexity: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get optimal model configuration for recruitment task"""

        # First check if it's a recruitment-specific task
        if task_type in self.recruitment_configs:
            config = self.recruitment_configs[task_type].copy()
            logger.debug(f"Using recruitment config for {task_type}: {config['model']}")
            return config

        # Fallback to parent class for general tasks
        return super().get_model_config(task_type)

    def get_workflow_models(self, workflow_name: str) -> List[str]:
        """Get all models needed for a specific workflow"""
        if workflow_name not in self.workflow_patterns:
            logger.warning(f"Unknown workflow: {workflow_name}")
            return []

        task_types = self.workflow_patterns[workflow_name]
        models = []

        for task_type in task_types:
            config = self.get_recruitment_model_config(task_type)
            model = config.get("model", "phi3:mini")
            if model not in models:
                models.append(model)

        logger.info(f"Workflow '{workflow_name}' requires models: {models}")
        return models

    def optimize_for_batch_processing(self, task_types: List[str]) -> Dict[str, Any]:
        """Optimize model loading strategy for batch processing"""

        # Get all required models
        required_models = []
        task_configs = {}

        for task_type in task_types:
            config = self.get_recruitment_model_config(task_type)
            model = config["model"]
            if model not in required_models:
                required_models.append(model)
            task_configs[task_type] = config

        # Calculate total memory requirement
        from app.core.memory_manager import A5000MemoryManager

        memory_manager = A5000MemoryManager()
        total_memory = sum(
            memory_manager.get_memory_requirement(model) for model in required_models
        )

        # Determine loading strategy
        if total_memory <= 20:  # Can fit all models
            strategy = "preload_all"
            preload_models = required_models
            swap_models = []
        else:
            # Need hot-swapping
            strategy = "hot_swap"

            # Prioritize by frequency and importance
            priority_models = []
            swap_models = []

            for model in required_models:
                # Get priority from task configs
                high_priority_tasks = [
                    task
                    for task, config in task_configs.items()
                    if config.get("model") == model and config.get("priority") == "high"
                ]

                if high_priority_tasks:
                    priority_models.append(model)
                else:
                    swap_models.append(model)

            preload_models = priority_models

        return {
            "strategy": strategy,
            "required_models": required_models,
            "preload_models": preload_models,
            "swap_models": swap_models,
            "total_memory_gb": total_memory,
            "task_configs": task_configs,
            "estimated_time": self._estimate_batch_time(task_types, strategy),
        }

    def _estimate_batch_time(self, task_types: List[str], strategy: str) -> float:
        """Estimate total processing time for batch operation"""
        total_time = 0
        model_load_time = 5.0 if strategy == "hot_swap" else 0.0  # One-time loading

        for task_type in task_types:
            config = self.get_recruitment_model_config(task_type)
            task_time = config.get("expected_time", 3.0)

            if strategy == "hot_swap":
                # Add model switching overhead
                task_time += 2.0

            total_time += task_time

        return total_time + model_load_time

    def get_cache_strategy(self, task_type: str) -> Dict[str, Any]:
        """Get caching strategy for recruitment tasks"""
        base_strategy = super().get_cache_ttl("fast")  # Default TTL

        task_specific_cache = {
            "resume_parsing": {
                "ttl": 7200,  # 2 hours - resumes don't change often
                "should_cache": True,
                "cache_key_includes": ["content_hash"],
            },
            "bias_detection": {
                "ttl": 3600,  # 1 hour - JDs may be updated
                "should_cache": True,
                "cache_key_includes": ["content_hash", "bias_model_version"],
            },
            "matching_logic": {
                "ttl": 1800,  # 30 minutes - matching logic may evolve
                "should_cache": True,
                "cache_key_includes": ["persona_id", "candidate_id", "match_version"],
            },
            "conversational_script_generation": {
                "ttl": 1800,  # 30 minutes - scripts should be fresh
                "should_cache": True,
                "cache_key_includes": ["template_id", "candidate_data_hash"],
            },
            "report_generation": {
                "ttl": 900,  # 15 minutes - reports should be current
                "should_cache": False,  # Always generate fresh reports
                "cache_key_includes": [],
            },
        }

        return task_specific_cache.get(
            task_type,
            {
                "ttl": base_strategy,
                "should_cache": True,
                "cache_key_includes": ["content_hash"],
            },
        )

    def get_performance_recommendations(self) -> Dict[str, Any]:
        """Get A5000-specific performance recommendations"""
        return {
            "optimal_batch_sizes": {
                "resume_parsing": 10,  # Process 10 resumes at once
                "bias_detection": 5,  # 5 JDs simultaneously
                "matching_logic": 3,  # 3 matches per batch
                "script_generation": 2,  # 2 scripts concurrently
                "report_generation": 20,  # 20 reports per batch
            },
            "memory_optimization": {
                "always_loaded": ["phi3:mini"],
                "keep_warm": ["deepseek-llm:7b", "mistral"],
                "load_on_demand": ["llama3"],
            },
            "workflow_optimization": {
                "parallel_tasks": ["resume_parsing", "bias_detection"],
                "sequential_tasks": ["matching_logic", "script_generation"],
                "final_tasks": ["report_generation"],
            },
            "expected_performance": {
                "resume_parsing": "2-3s per resume",
                "bias_detection": "1-2s per JD",
                "matching_logic": "3-4s per match",
                "script_generation": "4-5s per script",
                "report_generation": "0.5-1s per report",
            },
        }
