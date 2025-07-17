#!/usr/bin/env python3
"""Test script for the enhanced Ultra Fast Search System."""

import asyncio
import time
import json
from typing import Dict, Any

def test_metrics_system():
    """Test the metrics collection system."""
    print("🔍 Testing Metrics System...")
    
    try:
        from app.monitoring.metrics import MetricsCollector, PerformanceTimer
        
        # Test metrics collector
        collector = MetricsCollector()
        
        # Test counter
        collector.increment_counter('test_counter', 1.0, {'service': 'search'})
        collector.increment_counter('test_counter', 2.0, {'service': 'search'})
        counter_value = collector.get_counter('test_counter', {'service': 'search'})
        print(f"✅ Counter test passed: {counter_value}")
        
        # Test gauge
        collector.set_gauge('test_gauge', 42.5)
        gauge_value = collector.get_gauge('test_gauge')
        print(f"✅ Gauge test passed: {gauge_value}")
        
        # Test histogram
        collector.record_histogram('response_time', 100.0)
        collector.record_histogram('response_time', 150.0)
        collector.record_histogram('response_time', 200.0)
        stats = collector.get_histogram_stats('response_time')
        print(f"✅ Histogram test passed: mean={stats.get('mean', 0):.1f}ms")
        
        # Test performance timer
        with PerformanceTimer('test_operation'):
            time.sleep(0.01)  # Short sleep for testing
        
        print("✅ Metrics system tests passed!")
        return True
        
    except Exception as e:
        print(f"❌ Metrics system test failed: {e}")
        return False

def test_validation_system():
    """Test the validation system."""
    print("\n🔍 Testing Validation System...")
    
    try:
        from app.validation.validators import SearchRequest, SearchFilters, validate_document_structure
        
        # Test valid search request
        request = SearchRequest(query="python developer", num_results=10)
        print(f"✅ Valid search request: {request.query}")
        
        # Test query sanitization
        request = SearchRequest(query="   multiple   spaces   ", num_results=5)
        print(f"✅ Query sanitization: '{request.query}'")
        
        # Test search filters
        filters = SearchFilters(
            min_experience=2,
            max_experience=10,
            required_skills=["Python", "AWS"]
        )
        print(f"✅ Valid filters: {len(filters.required_skills)} skills")
        
        # Test document validation
        valid_doc = {
            "id": "test_1",
            "name": "John Doe",
            "experience_years": 5,
            "skills": ["Python", "AWS"]
        }
        is_valid = validate_document_structure(valid_doc)
        print(f"✅ Document validation: {is_valid}")
        
        print("✅ Validation system tests passed!")
        return True
        
    except Exception as e:
        print(f"❌ Validation system test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_error_handling():
    """Test the error handling system."""
    print("\n🔍 Testing Error Handling System...")
    
    try:
        from app.error_handling.exceptions import SearchEngineException, ValidationException, ErrorCode
        
        # Test search engine exception
        exc = SearchEngineException("Test search error", query="test query")
        error_dict = exc.to_dict()
        print(f"✅ SearchEngineException: {error_dict['error']}")
        
        # Test validation exception
        validation_exc = ValidationException("Invalid field", field="query", value="")
        print(f"✅ ValidationException: {validation_exc.details}")
        
        print("✅ Error handling system tests passed!")
        return True
        
    except Exception as e:
        print(f"❌ Error handling test failed: {e}")
        return False

async def test_health_system():
    """Test the health check system."""
    print("\n🔍 Testing Health Check System...")
    
    try:
        from app.monitoring.health import HealthChecker, HealthStatus
        from unittest.mock import Mock
        
        # Create a mock search engine
        mock_engine = Mock()
        mock_engine.get_performance_stats.return_value = {
            'total_searches': 100,
            'avg_response_time_ms': 150,
            'cache_hit_rate': 0.75
        }
        
        # Test health checker
        health_checker = HealthChecker(mock_engine)
        quick_health = health_checker.get_quick_health()
        print(f"✅ Quick health check: {quick_health['status']}")
        
        # Test component health
        await health_checker._check_search_engine_health()
        print(f"✅ Search engine health: {health_checker.components['search_engine'].status.value}")
        
        print("✅ Health system tests passed!")
        return True
        
    except Exception as e:
        print(f"❌ Health system test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_logging_system():
    """Test the enhanced logging system."""
    print("\n🔍 Testing Enhanced Logging System...")
    
    try:
        from app.logger import get_enhanced_logger, log_operation
        
        # Test enhanced logger
        logger = get_enhanced_logger("test_logger")
        logger.info("Test info message", extra_fields={"test_key": "test_value"})
        logger.warning("Test warning message")
        
        # Test log operation context manager
        with log_operation(logger, "test_operation", test_param="test_value"):
            time.sleep(0.01)
        
        print("✅ Enhanced logging system tests passed!")
        return True
        
    except Exception as e:
        print(f"❌ Logging system test failed: {e}")
        return False

async def run_all_tests():
    """Run all system tests."""
    print("🚀 Starting Ultra Fast Search System Tests\n")
    
    test_results = []
    
    # Run synchronous tests
    test_results.append(test_metrics_system())
    test_results.append(test_validation_system())
    test_results.append(test_error_handling())
    test_results.append(test_logging_system())
    
    # Run asynchronous tests
    test_results.append(await test_health_system())
    
    # Summary
    passed = sum(test_results)
    total = len(test_results)
    
    print(f"\n📊 Test Results: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All tests passed! The system is ready for use.")
    else:
        print("⚠️  Some tests failed. Please check the issues above.")
    
    return passed == total

if __name__ == "__main__":
    # Run tests
    success = asyncio.run(run_all_tests())
    exit(0 if success else 1)
