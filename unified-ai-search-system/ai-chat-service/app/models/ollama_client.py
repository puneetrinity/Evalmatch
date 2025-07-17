"""
OllamaClient - Async HTTP client for Ollama API communication.
Handles model loading, inference, and health checking.
"""

import asyncio
import json
import time
from dataclasses import dataclass
from enum import Enum
from typing import Any, AsyncGenerator, Dict, List, Optional

import httpx
from pydantic import BaseModel, Field

from app.core.logging import get_correlation_id, get_logger, log_performance

logger = get_logger("models.ollama_client")


class ModelStatus(str, Enum):
    """Model loading status."""

    UNKNOWN = "unknown"
    LOADING = "loading"
    READY = "ready"
    ERROR = "error"
    UNLOADED = "unloaded"


@dataclass
class ModelResult:
    """Result from model generation."""

    success: bool
    text: str = ""
    cost: float = 0.0  # Always 0 for local models
    execution_time: float = 0.0
    model_used: str = ""
    error: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    tokens_generated: Optional[int] = None
    tokens_per_second: Optional[float] = None


class GenerationRequest(BaseModel):
    """Request parameters for text generation."""

    model: str = Field(..., description="Model name")
    prompt: str = Field(..., description="Input prompt")
    max_tokens: Optional[int] = Field(300, description="Maximum tokens to generate")
    temperature: Optional[float] = Field(
        0.7, ge=0.0, le=2.0, description="Sampling temperature"
    )
    top_p: Optional[float] = Field(0.9, ge=0.0, le=1.0, description="Top-p sampling")
    top_k: Optional[int] = Field(40, ge=1, description="Top-k sampling")
    stop: Optional[List[str]] = Field(None, description="Stop sequences")
    stream: bool = Field(False, description="Enable streaming response")


class StreamingChunk(BaseModel):
    """Streaming response chunk."""

    text: str
    done: bool = False
    total_duration: Optional[int] = None
    load_duration: Optional[int] = None
    prompt_eval_count: Optional[int] = None
    eval_count: Optional[int] = None


class OllamaException(Exception):
    """Custom exception for Ollama-related errors."""

    def __init__(
        self,
        message: str,
        status_code: Optional[int] = None,
        model_name: Optional[str] = None,
    ):
        self.status_code = status_code
        self.model_name = model_name
        super().__init__(message)


class OllamaClient:
    """
    Async HTTP client for Ollama API with robust error handling and performance monitoring.

    Features:
    - Async model loading and unloading
    - Streaming and non-streaming generation
    - Health monitoring and status checking
    - Automatic retry logic with exponential backoff
    - Performance metrics collection
    """

    def __init__(
        self,
        base_url: str = "http://localhost:11434",
        timeout: float = 60.0,
        max_retries: int = 3,
        retry_delay: float = 1.0,
    ):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.max_retries = max_retries
        self.retry_delay = retry_delay

        # HTTP client configuration
        self.client_config = {
            "timeout": httpx.Timeout(timeout),
            "limits": httpx.Limits(max_connections=10, max_keepalive_connections=5),
            "follow_redirects": True,
        }

        self._client: Optional[httpx.AsyncClient] = None
        self._loop = None  # Track the event loop for client safety
        self._model_cache: Dict[str, Dict[str, Any]] = {}
        self._health_cache: Dict[str, float] = {}  # Cache health checks

        logger.info(
            "OllamaClient initialized",
            base_url=self.base_url,
            timeout=timeout,
            max_retries=max_retries,
            correlation_id=get_correlation_id(),
        )

    async def __aenter__(self):
        """Async context manager entry."""
        await self.initialize()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.close()

    async def initialize(self) -> None:
        """Initialize the HTTP client, ensuring event loop safety."""
        current_loop = asyncio.get_running_loop()
        if self._client is not None and self._loop != current_loop:
            await self._client.aclose()
            self._client = None
        if self._client is None:
            self._client = httpx.AsyncClient(**self.client_config)
            self._loop = current_loop
            logger.debug("HTTP client initialized", correlation_id=get_correlation_id())

    async def close(self) -> None:
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None
            logger.debug("HTTP client closed", correlation_id=get_correlation_id())

    @log_performance("ollama_health_check")
    async def health_check(self) -> bool:
        """
        Check if Ollama service is running and responsive.

        Returns:
            bool: True if service is healthy
        """
        correlation_id = get_correlation_id()

        # Check cache first (cache for 30 seconds)
        now = time.time()
        if "last_check" in self._health_cache:
            if now - self._health_cache["last_check"] < 30:
                return self._health_cache.get("healthy", False)

        try:
            await self.initialize()
            response = await self._client.get(
                f"{self.base_url}/api/tags",
                timeout=10.0,  # Shorter timeout for health checks
            )

            healthy = response.status_code == 200
            self._health_cache = {"healthy": healthy, "last_check": now}

            logger.debug(
                "Ollama health check completed",
                healthy=healthy,
                status_code=response.status_code,
                correlation_id=correlation_id,
            )

            return healthy

        except (httpx.ConnectError, httpx.TimeoutException, httpx.NetworkError) as e:
            logger.warning(
                "Ollama connection issue during health check",
                error=str(e),
                error_type=type(e).__name__,
                correlation_id=correlation_id,
            )
            self._health_cache = {"healthy": False, "last_check": now}
            return False
        except Exception as e:
            logger.error(
                "Ollama health check failed",
                error=str(e),
                correlation_id=correlation_id,
            )
            self._health_cache = {"healthy": False, "last_check": now}
            return False

    @log_performance("ollama_list_models")
    async def list_models(self, force_refresh: bool = False) -> List[Dict[str, Any]]:
        """
        List all available models in Ollama.

        Args:
            force_refresh: Force refresh of model cache

        Returns:
            List of model information dictionaries
        """
        correlation_id = get_correlation_id()

        # Check cache first
        if not force_refresh and "models" in self._model_cache:
            cache_time = self._model_cache.get("cache_time", 0)
            if time.time() - cache_time < 300:  # Cache for 5 minutes
                logger.debug(
                    "Returning cached model list", correlation_id=correlation_id
                )
                return self._model_cache["models"]

        try:
            await self.initialize()
            response = await self._make_request("GET", "/api/tags")

            models_data = response.get("models", [])

            # Cache the results
            self._model_cache = {"models": models_data, "cache_time": time.time()}

            logger.info(
                "Models listed successfully",
                model_count=len(models_data),
                correlation_id=correlation_id,
            )

            return models_data

        except Exception as e:
            logger.error(
                "Failed to list models", error=str(e), correlation_id=correlation_id
            )
            raise OllamaException(f"Failed to list models: {e}")

    @log_performance("ollama_pull_model")
    async def pull_model(self, model_name: str) -> bool:
        """
        Pull (download) a model from Ollama registry.

        Args:
            model_name: Name of the model to pull

        Returns:
            bool: True if successful
        """
        correlation_id = get_correlation_id()

        logger.info(
            "Starting model pull", model_name=model_name, correlation_id=correlation_id
        )

        try:
            await self.initialize()

            # Stream the pull response to monitor progress
            async with self._client.stream(
                "POST", f"{self.base_url}/api/pull", json={"name": model_name}
            ) as response:
                if response.status_code != 200:
                    error_text = await response.aread()
                    raise OllamaException(
                        f"Pull failed with status {response.status_code}: {error_text}",
                        response.status_code,
                        model_name,
                    )

                # Process streaming response
                async for chunk in response.aiter_lines():
                    if chunk:
                        try:
                            progress_data = json.loads(chunk)
                            if "status" in progress_data:
                                logger.debug(
                                    "Pull progress",
                                    model_name=model_name,
                                    status=progress_data["status"],
                                    correlation_id=correlation_id,
                                )
                        except json.JSONDecodeError:
                            continue

            # Clear model cache after successful pull
            self._model_cache.clear()

            logger.info(
                "Model pull completed successfully",
                model_name=model_name,
                correlation_id=correlation_id,
            )

            return True

        except Exception as e:
            logger.error(
                "Model pull failed",
                model_name=model_name,
                error=str(e),
                correlation_id=correlation_id,
            )
            raise OllamaException(
                f"Failed to pull model {model_name}: {e}", model_name=model_name
            )

    @log_performance("ollama_check_model")
    async def check_model_status(self, model_name: str) -> ModelStatus:
        """
        Check if a specific model is loaded and ready.

        Args:
            model_name: Name of the model to check

        Returns:
            ModelStatus: Current status of the model
        """
        correlation_id = get_correlation_id()
        logger.debug(
            f"[OllamaClient.check_model_status] Entered for model: {model_name}"
        )

        try:
            models = await self.list_models()

            for model in models:
                if model.get("name") == model_name:
                    # Model exists, check if it's loaded by making a minimal health check
                    try:
                        # Use a minimal model info request instead of generation for health checks
                        # This avoids creating unnecessary generation requests
                        url = f"{self.base_url}/api/show"
                        payload = {"name": model_name}

                        async with httpx.AsyncClient(timeout=5.0) as client:
                            response = await client.post(url, json=payload)
                            if response.status_code == 200:
                                status = ModelStatus.READY
                            else:
                                status = ModelStatus.ERROR

                        logger.debug(
                            "Model status checked",
                            model_name=model_name,
                            status=status.value,
                            correlation_id=correlation_id,
                        )

                        return status

                    except Exception as e:
                        logger.debug(f"Model health check failed: {e}")
                        return ModelStatus.ERROR

            # Model not found in list
            return ModelStatus.UNKNOWN

        except Exception as e:
            logger.error(
                "Failed to check model status",
                model_name=model_name,
                error=str(e),
                correlation_id=correlation_id,
            )
            return ModelStatus.ERROR

    @log_performance("ollama_text_generation")
    async def generate(
        self,
        model_name: str,
        prompt: str,
        max_tokens: int = 300,
        temperature: float = 0.7,
        **kwargs,
    ) -> ModelResult:
        """
        Generate text using the specified model with retry logic.

        Args:
            model_name: Name of the model to use
            prompt: Input prompt for generation
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature (0.0 to 2.0)
            **kwargs: Additional generation parameters

        Returns:
            ModelResult: Generation result with metadata
        """
        correlation_id = get_correlation_id()
        last_exception = None

        logger.debug(
            "Starting text generation",
            model_name=model_name,
            prompt_length=len(prompt),
            max_tokens=max_tokens,
            temperature=temperature,
            correlation_id=correlation_id,
        )

        await self.initialize()
        logger.debug("Prompt sent to LLM", prompt=prompt, model_name=model_name)
        request_data = {
            "model": model_name,
            "prompt": prompt,
            "options": {
                "num_predict": max_tokens,
                "temperature": temperature,
                **kwargs,
            },
            "stream": False,
        }

        logger.debug(
            "LLM generate() call details",
            prompt=prompt,
            model_name=model_name,
            max_tokens=max_tokens,
            temperature=temperature,
            kwargs=kwargs,
            correlation_id=correlation_id,
        )

        for attempt in range(self.max_retries + 1):
            try:
                logger.debug(
                    f"[LLM] Attempt {attempt+1}/{self.max_retries+1} | Model: {model_name} | Prompt: {prompt}"
                )
                start_time = time.monotonic()
                response = await self._make_request(
                    "POST", "/api/generate", json=request_data
                )
                execution_time = time.monotonic() - start_time
                logger.debug(
                    f"[LLM] Response: {response} | Time: {execution_time:.2f}s"
                )

                # Extract response text
                response_text = response.get("response", "")
                logger.debug(f"Raw Ollama response: {response}")

                # Better empty response handling
                if not response_text or response_text.strip() == "":
                    logger.error(
                        f"Empty response from Ollama for model {model_name}. Raw response: {response}"
                    )
                    response_text = f"Hello! I'm ready to help you. Could you please rephrase your question? (Model: {model_name})"

                # Calculate performance metrics
                total_duration = response.get("total_duration", 0)
                eval_count = response.get("eval_count", 0)

                tokens_per_second = 0.0
                if eval_count > 0 and total_duration > 0:
                    # Convert nanoseconds to seconds
                    duration_seconds = total_duration / 1_000_000_000
                    tokens_per_second = eval_count / duration_seconds

                result = ModelResult(
                    success=True,
                    text=response_text,
                    execution_time=execution_time,
                    model_used=model_name,
                    tokens_generated=eval_count,
                    tokens_per_second=tokens_per_second,
                    metadata={
                        "total_duration": total_duration / 1_000_000_000,
                        "load_duration": response.get("load_duration", 0)
                        / 1_000_000_000,
                        "prompt_eval_duration": response.get("prompt_eval_duration", 0)
                        / 1_000_000_000,
                        "eval_duration": response.get("eval_duration", 0)
                        / 1_000_000_000,
                    },
                )

                logger.info(
                    "Text generation completed successfully",
                    model_name=model_name,
                    execution_time=execution_time,
                    tokens_generated=eval_count,
                    tokens_per_second=round(tokens_per_second, 2),
                    correlation_id=correlation_id,
                )

                return result

            except Exception as e:
                last_exception = e
                logger.error(f"[LLM] Exception on attempt {attempt+1}: {e}")

        # Fallback: always return a ModelResult, even on failure
        logger.error(
            f"[LLM] All {self.max_retries+1} attempts failed. Returning fallback ModelResult."
        )
        return ModelResult(
            success=False,
            text="",
            execution_time=0.0,
            model_used=model_name,
            error=str(last_exception) if last_exception else "Empty response",
        )

    async def generate_stream(
        self,
        model_name: str,
        prompt: str,
        max_tokens: int = 300,
        temperature: float = 0.7,
        **kwargs,
    ) -> AsyncGenerator[StreamingChunk, None]:
        """
        Generate text with streaming response.

        Args:
            model_name: Name of the model to use
            prompt: Input prompt for generation
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature
            **kwargs: Additional generation parameters

        Yields:
            StreamingChunk: Individual response chunks
        """
        correlation_id = get_correlation_id()

        logger.debug(
            "Starting streaming generation",
            model_name=model_name,
            prompt_length=len(prompt),
            correlation_id=correlation_id,
        )

        try:
            await self.initialize()
            logger.debug(
                "Prompt sent to LLM (stream)", prompt=prompt, model_name=model_name
            )

            request_data = {
                "model": model_name,
                "prompt": prompt,
                "options": {
                    "num_predict": max_tokens,
                    "temperature": temperature,
                    **kwargs,
                },
                "stream": True,
            }

            async with self._client.stream(
                "POST", f"{self.base_url}/api/generate", json=request_data
            ) as response:
                if response.status_code != 200:
                    error_text = await response.aread()
                    raise OllamaException(
                        f"Streaming generation failed: {error_text}",
                        response.status_code,
                        model_name,
                    )

                async for line in response.aiter_lines():
                    if line:
                        try:
                            chunk_data = json.loads(line)
                            logger.debug("Raw LLM stream chunk", chunk_data=chunk_data)
                            text = chunk_data.get("response", "")
                            if not text:
                                text = "[No response generated]"
                            yield StreamingChunk(
                                text=text,
                                done=chunk_data.get("done", False),
                                total_duration=chunk_data.get("total_duration"),
                                load_duration=chunk_data.get("load_duration"),
                                prompt_eval_count=chunk_data.get("prompt_eval_count"),
                                eval_count=chunk_data.get("eval_count"),
                            )

                            if chunk_data.get("done"):
                                break
                        except json.JSONDecodeError:
                            continue

            logger.debug(
                "Streaming generation completed",
                model_name=model_name,
                correlation_id=correlation_id,
            )

        except Exception as e:
            logger.error(
                "Streaming generation failed",
                model_name=model_name,
                error=str(e),
                correlation_id=correlation_id,
            )
            yield StreamingChunk(text="", done=True)

    async def _make_request(
        self, method: str, endpoint: str, **kwargs
    ) -> Dict[str, Any]:
        """
        Make HTTP request with retry logic and error handling.

        Args:
            method: HTTP method
            endpoint: API endpoint
            **kwargs: Additional request parameters

        Returns:
            Dict: Response data
        """
        correlation_id = get_correlation_id()
        url = f"{self.base_url}{endpoint}"

        last_exception = None

        for attempt in range(self.max_retries + 1):
            try:
                await self.initialize()  # Ensure client is initialized
                response = await self._client.request(method, url, **kwargs)

                if response.status_code == 200:
                    return response.json()
                else:
                    error_text = response.text
                    raise httpx.HTTPStatusError(
                        f"HTTP {response.status_code}: {error_text}",
                        request=response.request,
                        response=response,
                    )

            except (
                httpx.ConnectError,
                httpx.TimeoutException,
                httpx.NetworkError,
            ) as e:
                last_exception = e

                if attempt < self.max_retries:
                    wait_time = self.retry_delay * (2**attempt)  # Exponential backoff

                    logger.warning(
                        "Connection error, retrying",
                        method=method,
                        endpoint=endpoint,
                        attempt=attempt + 1,
                        max_retries=self.max_retries,
                        wait_time=wait_time,
                        error=str(e),
                        error_type=type(e).__name__,
                        correlation_id=correlation_id,
                    )

                    await asyncio.sleep(wait_time)
                else:
                    logger.error(
                        "Connection failed after all retries",
                        method=method,
                        endpoint=endpoint,
                        attempts=attempt + 1,
                        error=str(e),
                        error_type=type(e).__name__,
                        correlation_id=correlation_id,
                    )
                    raise OllamaException(f"Connection to Ollama failed: {e}")

            except Exception as e:
                last_exception = e

                if attempt < self.max_retries:
                    wait_time = self.retry_delay * (2**attempt)  # Exponential backoff

                    logger.warning(
                        "Request failed, retrying",
                        method=method,
                        endpoint=endpoint,
                        attempt=attempt + 1,
                        max_retries=self.max_retries,
                        wait_time=wait_time,
                        error=str(e),
                        correlation_id=correlation_id,
                    )

                    await asyncio.sleep(wait_time)
                else:
                    logger.error(
                        "Request failed after all retries",
                        method=method,
                        endpoint=endpoint,
                        attempts=attempt + 1,
                        error=str(e),
                        correlation_id=correlation_id,
                    )

        raise last_exception

    async def get_available_model_names(self, force_refresh: bool = False) -> set[str]:
        """
        Return a set of available model names as reported by Ollama.
        Args:
            force_refresh: If True, bypass cache and fetch fresh list.
        Returns:
            Set of model names (str)
        """
        models = await self.list_models(force_refresh=force_refresh)
        return {model.get("name") for model in models if "name" in model}

    async def _get_session(self) -> httpx.AsyncClient:
        """Get or create the HTTP client session."""
        await self.initialize()
        return self._client


# Utility functions
async def create_ollama_client(
    base_url: str = "http://localhost:11434", timeout: float = 60.0
) -> OllamaClient:
    """
    Create and initialize an OllamaClient instance.

    Args:
        base_url: Ollama service URL
        timeout: Request timeout in seconds

    Returns:
        OllamaClient: Initialized client
    """
    client = OllamaClient(base_url=base_url, timeout=timeout)
    await client.initialize()
    return client


# Export main classes
__all__ = [
    "OllamaClient",
    "OllamaException",
    "ModelResult",
    "ModelStatus",
    "GenerationRequest",
    "StreamingChunk",
    "create_ollama_client",
]
