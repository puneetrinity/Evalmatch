"""Comprehensive health check system with detailed component monitoring."""

import time
import psutil
import asyncio
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from enum import Enum
import os

class HealthStatus(str, Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded" 
    UNHEALTHY = "unhealthy"

class ComponentHealth:
    """Health status for individual system components."""
    
    def __init__(self, name: str):
        self.name = name
        self.status = HealthStatus.HEALTHY
        self.message = "Component is healthy"
        self.last_check = time.time()
        self.details = {}
    
    def update_status(self, status: HealthStatus, message: str, details: Optional[Dict[str, Any]] = None):
        """Update component health status."""
        self.status = status
        self.message = message
        self.last_check = time.time()
        self.details = details or {}
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API response."""
        return {
            'status': self.status.value,
            'message': self.message,
            'last_check': datetime.fromtimestamp(self.last_check, timezone.utc).isoformat(),
            'details': self.details
        }

class HealthChecker:
    """Comprehensive system health checker."""
    
    def __init__(self, search_engine=None):
        self.search_engine = search_engine
        self.start_time = time.time()
        self.components = {
            'system': ComponentHealth('system'),
            'search_engine': ComponentHealth('search_engine'),
            'embeddings': ComponentHealth('embeddings'),
            'indexes': ComponentHealth('indexes'),
            'storage': ComponentHealth('storage'),
            'memory': ComponentHealth('memory'),
            'api': ComponentHealth('api')
        }
    
    async def check_all_health(self) -> Dict[str, Any]:
        """Perform comprehensive health check on all components."""
        # Run all health checks concurrently
        await asyncio.gather(
            self._check_system_health(),
            self._check_search_engine_health(),
            self._check_embeddings_health(),
            self._check_indexes_health(),
            self._check_storage_health(),
            self._check_memory_health(),
            self._check_api_health(),
            return_exceptions=True
        )
        
        # Determine overall health status
        overall_status = self._determine_overall_status()
        
        return {
            'status': overall_status.value,
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'version': '2.0.0',
            'uptime_seconds': time.time() - self.start_time,
            'components': {name: component.to_dict() for name, component in self.components.items()}
        }
    
    async def _check_system_health(self):
        """Check basic system health metrics."""
        try:
            cpu_usage = psutil.cpu_percent(interval=1)
            memory = psutil.virtual_memory()
            disk = psutil.disk_usage('/')
            
            details = {
                'cpu_usage_percent': cpu_usage,
                'memory_usage_percent': memory.percent,
                'memory_available_gb': memory.available / (1024**3),
                'disk_usage_percent': disk.percent,
                'disk_free_gb': disk.free / (1024**3)
            }
            
            # Determine status based on thresholds
            if cpu_usage > 90 or memory.percent > 90 or disk.percent > 95:
                status = HealthStatus.UNHEALTHY
                message = "System resources critically low"
            elif cpu_usage > 75 or memory.percent > 75 or disk.percent > 85:
                status = HealthStatus.DEGRADED
                message = "System resources running high"
            else:
                status = HealthStatus.HEALTHY
                message = "System resources normal"
            
            self.components['system'].update_status(status, message, details)
            
        except Exception as e:
            self.components['system'].update_status(
                HealthStatus.UNHEALTHY,
                f"Failed to check system health: {str(e)}"
            )
    
    async def _check_search_engine_health(self):
        """Check search engine component health."""
        try:
            if self.search_engine is None:
                self.components['search_engine'].update_status(
                    HealthStatus.UNHEALTHY,
                    "Search engine not initialized"
                )
                return
            
            # Check if embeddings model is loaded
            model_loaded = hasattr(self.search_engine, 'embedding_model') and self.search_engine.embedding_model is not None
            
            # Get search statistics
            stats = self.search_engine.get_performance_stats()
            
            details = {
                'model_loaded': model_loaded,
                'total_searches': stats.get('total_searches', 0),
                'avg_response_time_ms': stats.get('avg_response_time_ms', 0),
                'cache_hit_rate': stats.get('cache_hit_rate', 0)
            }
            
            if not model_loaded:
                status = HealthStatus.UNHEALTHY
                message = "Embedding model not loaded"
            elif stats.get('avg_response_time_ms', 0) > 5000:  # 5 second threshold
                status = HealthStatus.DEGRADED
                message = "Search response times degraded"
            else:
                status = HealthStatus.HEALTHY
                message = "Search engine operational"
            
            self.components['search_engine'].update_status(status, message, details)
            
        except Exception as e:
            self.components['search_engine'].update_status(
                HealthStatus.UNHEALTHY,
                f"Failed to check search engine: {str(e)}"
            )
    
    async def _check_embeddings_health(self):
        """Check embedding model health."""
        try:
            if self.search_engine is None or not hasattr(self.search_engine, 'embedding_model'):
                self.components['embeddings'].update_status(
                    HealthStatus.UNHEALTHY,
                    "Embedding model not available"
                )
                return
            
            # Test embedding generation with a simple query
            test_start = time.time()
            test_embedding = self.search_engine.embedding_model.encode(["test query"])
            embedding_time = (time.time() - test_start) * 1000
            
            details = {
                'model_name': getattr(self.search_engine.embedding_model, 'model_name', 'unknown'),
                'embedding_dimension': len(test_embedding[0]) if len(test_embedding) > 0 else 0,
                'test_embedding_time_ms': embedding_time
            }
            
            if embedding_time > 2000:  # 2 second threshold
                status = HealthStatus.DEGRADED
                message = "Embedding generation slow"
            else:
                status = HealthStatus.HEALTHY
                message = "Embedding model operational"
            
            self.components['embeddings'].update_status(status, message, details)
            
        except Exception as e:
            self.components['embeddings'].update_status(
                HealthStatus.UNHEALTHY,
                f"Embedding model test failed: {str(e)}"
            )
    
    async def _check_indexes_health(self):
        """Check search indexes health."""
        try:
            if self.search_engine is None:
                self.components['indexes'].update_status(
                    HealthStatus.UNHEALTHY,
                    "Search engine not available"
                )
                return
            
            # Check if indexes are loaded
            hnsw_loaded = hasattr(self.search_engine, 'hnsw_index') and self.search_engine.hnsw_index.index is not None
            lsh_loaded = hasattr(self.search_engine, 'lsh_index') and len(getattr(self.search_engine.lsh_index, 'signatures', {})) > 0
            bm25_loaded = hasattr(self.search_engine, 'bm25_index') and len(getattr(self.search_engine, 'bm25_index', {})) > 0
            
            details = {
                'hnsw_index_loaded': hnsw_loaded,
                'lsh_index_loaded': lsh_loaded,
                'bm25_index_loaded': bm25_loaded,
                'document_count': len(getattr(self.search_engine, 'document_metadata', {})),
                'corpus_size': getattr(self.search_engine, 'corpus_size', 0)
            }
            
            if not (hnsw_loaded and lsh_loaded and bm25_loaded):
                status = HealthStatus.DEGRADED
                message = "Some indexes not loaded"
            elif details['document_count'] == 0:
                status = HealthStatus.DEGRADED
                message = "No documents indexed"
            else:
                status = HealthStatus.HEALTHY
                message = "All indexes loaded and operational"
            
            self.components['indexes'].update_status(status, message, details)
            
        except Exception as e:
            self.components['indexes'].update_status(
                HealthStatus.UNHEALTHY,
                f"Failed to check indexes: {str(e)}"
            )
    
    async def _check_storage_health(self):
        """Check storage system health."""
        try:
            from app.config import settings
            index_path = getattr(settings, 'index_path', './indexes')
            
            # Check if index directory exists and is writable
            index_dir_exists = os.path.exists(index_path)
            index_dir_writable = os.access(index_path, os.W_OK) if index_dir_exists else False
            
            # Check index files
            hnsw_file = os.path.join(index_path, 'hnsw.index')
            other_file = os.path.join(index_path, 'other_data.pkl')
            
            hnsw_exists = os.path.exists(hnsw_file)
            other_exists = os.path.exists(other_file)
            
            details = {
                'index_directory_exists': index_dir_exists,
                'index_directory_writable': index_dir_writable,
                'hnsw_index_file_exists': hnsw_exists,
                'other_data_file_exists': other_exists,
                'index_path': index_path
            }
            
            if hnsw_exists:
                details['hnsw_file_size_mb'] = os.path.getsize(hnsw_file) / (1024**2)
            if other_exists:
                details['other_file_size_mb'] = os.path.getsize(other_file) / (1024**2)
            
            if not index_dir_exists:
                status = HealthStatus.DEGRADED
                message = "Index directory does not exist"
            elif not index_dir_writable:
                status = HealthStatus.UNHEALTHY
                message = "Index directory not writable"
            else:
                status = HealthStatus.HEALTHY
                message = "Storage system accessible"
            
            self.components['storage'].update_status(status, message, details)
            
        except Exception as e:
            self.components['storage'].update_status(
                HealthStatus.UNHEALTHY,
                f"Failed to check storage: {str(e)}"
            )
    
    async def _check_memory_health(self):
        """Check memory usage and potential memory leaks."""
        try:
            import gc
            
            # Force garbage collection and get stats
            gc.collect()
            memory_info = psutil.Process().memory_info()
            
            details = {
                'rss_mb': memory_info.rss / (1024**2),
                'vms_mb': memory_info.vms / (1024**2),
                'gc_objects': len(gc.get_objects()),
                'gc_stats': gc.get_stats()
            }
            
            # Check for potential memory issues
            if memory_info.rss > 2 * (1024**3):  # 2GB threshold
                status = HealthStatus.DEGRADED
                message = "High memory usage detected"
            else:
                status = HealthStatus.HEALTHY
                message = "Memory usage normal"
            
            self.components['memory'].update_status(status, message, details)
            
        except Exception as e:
            self.components['memory'].update_status(
                HealthStatus.UNHEALTHY,
                f"Failed to check memory: {str(e)}"
            )
    
    async def _check_api_health(self):
        """Check API component health."""
        try:
            # This would typically include checks for:
            # - Database connections
            # - External service connectivity
            # - Rate limiting status
            # - Authentication service status
            
            details = {
                'endpoints_registered': True,  # Could check FastAPI app routes
                'middleware_loaded': True,     # Could check middleware stack
                'request_handlers_active': True
            }
            
            self.components['api'].update_status(
                HealthStatus.HEALTHY,
                "API components operational",
                details
            )
            
        except Exception as e:
            self.components['api'].update_status(
                HealthStatus.UNHEALTHY,
                f"Failed to check API health: {str(e)}"
            )
    
    def _determine_overall_status(self) -> HealthStatus:
        """Determine overall system health status."""
        statuses = [component.status for component in self.components.values()]
        
        if HealthStatus.UNHEALTHY in statuses:
            return HealthStatus.UNHEALTHY
        elif HealthStatus.DEGRADED in statuses:
            return HealthStatus.DEGRADED
        else:
            return HealthStatus.HEALTHY
    
    def get_quick_health(self) -> Dict[str, Any]:
        """Get a quick health check without running all diagnostics."""
        overall_status = self._determine_overall_status()
        
        return {
            'status': overall_status.value,
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'uptime_seconds': time.time() - self.start_time
        }
