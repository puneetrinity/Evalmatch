"""Tests for health check and monitoring features."""

import pytest
import asyncio
from unittest.mock import Mock, patch
from app.monitoring.health import HealthChecker, HealthStatus
from app.monitoring.metrics import MetricsCollector

@pytest.fixture
def mock_search_engine():
    """Create a mock search engine for testing."""
    engine = Mock()
    engine.embedding_model = Mock()
    engine.get_performance_stats.return_value = {
        'total_searches': 100,
        'avg_response_time_ms': 150,
        'cache_hit_rate': 0.75
    }
    return engine

@pytest.fixture
def health_checker(mock_search_engine):
    """Create a health checker instance."""
    return HealthChecker(mock_search_engine)

@pytest.mark.asyncio
async def test_health_check_all_components(health_checker):
    """Test comprehensive health check."""
    with patch('psutil.cpu_percent', return_value=50), \
         patch('psutil.virtual_memory') as mock_memory, \
         patch('psutil.disk_usage') as mock_disk:
        
        mock_memory.return_value.percent = 60
        mock_memory.return_value.available = 8 * (1024**3)  # 8GB
        mock_disk.return_value.percent = 40
        mock_disk.return_value.free = 100 * (1024**3)  # 100GB
        
        health_data = await health_checker.check_all_health()
        
        assert health_data['status'] in ['healthy', 'degraded', 'unhealthy']
        assert 'components' in health_data
        assert 'system' in health_data['components']
        assert 'search_engine' in health_data['components']
        assert 'uptime_seconds' in health_data

@pytest.mark.asyncio
async def test_system_health_unhealthy_conditions(health_checker):
    """Test system health under stress conditions."""
    with patch('psutil.cpu_percent', return_value=95), \
         patch('psutil.virtual_memory') as mock_memory, \
         patch('psutil.disk_usage') as mock_disk:
        
        mock_memory.return_value.percent = 95
        mock_memory.return_value.available = 1 * (1024**3)  # 1GB
        mock_disk.return_value.percent = 98
        mock_disk.return_value.free = 1 * (1024**3)  # 1GB
        
        await health_checker._check_system_health()
        
        assert health_checker.components['system'].status == HealthStatus.UNHEALTHY

def test_metrics_collector():
    """Test metrics collection functionality."""
    collector = MetricsCollector()
    
    # Test counter
    collector.increment_counter('test_counter', 1.0, {'label': 'value'})
    assert collector.get_counter('test_counter', {'label': 'value'}) == 1.0
    
    # Test gauge
    collector.set_gauge('test_gauge', 42.5)
    assert collector.get_gauge('test_gauge') == 42.5
    
    # Test histogram
    collector.record_histogram('test_histogram', 100.0)
    collector.record_histogram('test_histogram', 200.0)
    
    stats = collector.get_histogram_stats('test_histogram')
    assert stats['count'] == 2
    assert stats['mean'] == 150.0
    assert stats['min'] == 100.0
    assert stats['max'] == 200.0

def test_quick_health_check(health_checker):
    """Test quick health check functionality."""
    quick_health = health_checker.get_quick_health()
    
    assert 'status' in quick_health
    assert 'timestamp' in quick_health
    assert 'uptime_seconds' in quick_health
