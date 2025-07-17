"""Intelligent streaming optimization for adaptive routing"""
import asyncio
import time
from typing import AsyncGenerator
import structlog

logger = structlog.get_logger(__name__)


class IntelligentResponseStreamer:
    """Optimize streaming responses for adaptive routing system"""
    
    @staticmethod
    async def stream_adaptive_response(
        response: str, 
        confidence: float = 1.0,
        arm_id: str = "unknown"
    ) -> AsyncGenerator[str, None]:
        """Stream response with adaptive optimization based on routing arm"""
        words = response.split()
        
        # Adaptive chunking based on routing confidence
        if confidence > 0.8:  # High confidence = faster streaming
            initial_chunk_size = 5
            regular_chunk_size = 12
            delay = 0.03
        elif confidence > 0.6:  # Medium confidence = balanced streaming  
            initial_chunk_size = 3
            regular_chunk_size = 8
            delay = 0.05
        else:  # Lower confidence = more cautious streaming
            initial_chunk_size = 2
            regular_chunk_size = 6
            delay = 0.08
        
        # Log streaming performance for bandit learning
        start_time = time.time()
        chunks_sent = 0
        
        try:
            for i in range(0, len(words), initial_chunk_size if chunks_sent < 3 else regular_chunk_size):
                chunk_size = initial_chunk_size if chunks_sent < 3 else regular_chunk_size
                end_idx = min(i + chunk_size, len(words))
                chunk = ' '.join(words[i:end_idx])
                
                yield chunk + ' '
                chunks_sent += 1
                await asyncio.sleep(delay)
            
            # Record streaming performance for adaptive learning
            total_time = time.time() - start_time
            await record_streaming_performance(
                arm_id=arm_id,
                confidence=confidence,
                chunks_sent=chunks_sent,
                total_time=total_time,
                words_count=len(words)
            )
            
        except Exception as e:
            logger.error("streaming_error", arm_id=arm_id, error=str(e))


async def record_streaming_performance(
    arm_id: str,
    confidence: float, 
    chunks_sent: int,
    total_time: float,
    words_count: int
):
    """Record streaming performance for bandit optimization"""
    try:
        performance_data = {
            "timestamp": time.time(),
            "arm_id": arm_id,
            "confidence": confidence,
            "chunks_sent": chunks_sent,
            "total_time": total_time,
            "words_count": words_count,
            "words_per_second": words_count / max(total_time, 0.001),
            "perceived_latency": total_time / max(chunks_sent, 1)
        }
        
        # This could be used by reward calculator to optimize streaming
        logger.info("streaming_performance", **performance_data)
        
    except Exception as e:
        logger.error("streaming_performance_recording_failed", error=str(e))


class StreamingOptimizer:
    """Optimize streaming based on adaptive routing patterns"""
    
    def __init__(self):
        self.arm_performance = {}
    
    def get_optimal_streaming_params(self, arm_id: str, confidence: float) -> dict:
        """Get optimal streaming parameters based on arm performance history"""
        # Default parameters
        params = {
            "initial_chunk_size": 3,
            "regular_chunk_size": 8,
            "delay": 0.05
        }
        
        # Adjust based on arm performance
        if arm_id in self.arm_performance:
            avg_response_time = self.arm_performance[arm_id].get("avg_response_time", 2.0)
            
            if avg_response_time < 1.0:  # Fast arm
                params.update({
                    "initial_chunk_size": 5,
                    "regular_chunk_size": 12,
                    "delay": 0.03
                })
            elif avg_response_time > 5.0:  # Slow arm
                params.update({
                    "initial_chunk_size": 2,
                    "regular_chunk_size": 6,
                    "delay": 0.08
                })
        
        # Adjust based on confidence
        if confidence < 0.5:
            params["delay"] *= 1.5  # Slower streaming for low confidence
        
        return params
    
    def update_arm_performance(self, arm_id: str, response_time: float, success: bool):
        """Update arm performance metrics for streaming optimization"""
        if arm_id not in self.arm_performance:
            self.arm_performance[arm_id] = {
                "total_responses": 0,
                "total_time": 0.0,
                "success_count": 0
            }
        
        stats = self.arm_performance[arm_id]
        stats["total_responses"] += 1
        stats["total_time"] += response_time
        stats["success_count"] += 1 if success else 0
        
        # Calculate averages
        stats["avg_response_time"] = stats["total_time"] / stats["total_responses"]
        stats["success_rate"] = stats["success_count"] / stats["total_responses"]
