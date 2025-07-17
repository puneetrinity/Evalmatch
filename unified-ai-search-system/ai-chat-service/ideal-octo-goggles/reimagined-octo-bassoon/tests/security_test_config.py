"""
Security test configuration and utilities.

This module provides configuration and utilities for security testing,
including test data, mock objects, and security validation helpers.
"""

import pytest
from typing import Dict, List, Any
from unittest.mock import Mock, patch


class SecurityTestConfig:
    """Configuration for security tests."""
    
    # SQL Injection test payloads
    SQL_INJECTION_PAYLOADS = [
        "'; DROP TABLE users; --",
        "1' OR '1'='1",
        "admin'; DELETE FROM users; --",
        "1' UNION SELECT * FROM users--",
        "'; INSERT INTO users (username) VALUES ('hacker'); --",
        "1' OR 1=1--",
        "'; EXEC xp_cmdshell('format c:'); --",
        "1'; UPDATE users SET password='hacked' WHERE id=1; --",
        "' OR 'a'='a",
        "'; SHUTDOWN; --",
        "1' AND (SELECT COUNT(*) FROM users) > 0 --",
        "admin'/**/OR/**/1=1--",
        "1' WAITFOR DELAY '00:00:05'--",
        "'; CREATE USER hacker IDENTIFIED BY 'pass'; --"
    ]
    
    # XSS test payloads
    XSS_PAYLOADS = [
        "<script>alert('xss')</script>",
        "<img src=x onerror=alert('xss')>",
        "<iframe src=javascript:alert('xss')></iframe>",
        "<svg onload=alert('xss')>",
        "<div onmouseover=alert('xss')>",
        "javascript:alert('xss')",
        "<script src='http://evil.com/malicious.js'></script>",
        "<object data='http://evil.com/malicious.swf'></object>",
        "<embed src='http://evil.com/malicious.swf'>",
        "<link rel=stylesheet href='http://evil.com/malicious.css'>",
        "<style>body{background:url('javascript:alert(1)')}</style>",
        "<input type=button onclick=alert('xss') value=click>",
        "<body onload=alert('xss')>",
        "<marquee onstart=alert('xss')>",
        "<video src=x onerror=alert('xss')>",
        "<audio src=x onerror=alert('xss')>"
    ]
    
    # URL-encoded attack payloads
    ENCODED_PAYLOADS = [
        "%3Cscript%3Ealert('xss')%3C/script%3E",
        "%27%3B%20DROP%20TABLE%20users%3B%20--",
        "%3Cimg%20src%3Dx%20onerror%3Dalert('xss')%3E",
        "%3Ciframe%20src%3Djavascript%3Aalert('xss')%3E%3C/iframe%3E",
        "%27%20OR%20%271%27%3D%271",
        "%3Cscript%20src%3D%27http%3A//evil.com/malicious.js%27%3E%3C/script%3E"
    ]
    
    # Invalid authentication tokens
    INVALID_AUTH_TOKENS = [
        "invalid_token",
        "",
        None,
        "Bearer invalid",
        "malformed.jwt.token",
        "expired.jwt.token",
        "Bearer ",
        "Basic invalid",
        "jwt.without.signature",
        "Bearer " + "x" * 1000,  # Oversized token
        "Bearer \n\r\t",  # Whitespace token
        "Bearer <script>alert('xss')</script>"  # XSS in token
    ]
    
    # Invalid API keys
    INVALID_API_KEYS = [
        "",
        None,
        "invalid_key",
        "123",  # Too short
        "x" * 1000,  # Too long
        "key with spaces",
        "key\nwith\nnewlines",
        "key\twith\ttabs",
        "key<script>alert('xss')</script>",
        "key'; DROP TABLE users; --",
        "key" + "\x00" + "null_byte"  # Null byte injection
    ]
    
    # Safe test inputs (should pass validation)
    SAFE_INPUTS = [
        "normal text query",
        "search for python programming",
        "how to cook pasta",
        "weather forecast for tomorrow",
        "123 main street",
        "user@example.com",
        "simple question about AI",
        "what is machine learning?",
        "best practices for web development",
        "tutorial for beginners",
        "troubleshooting guide",
        "API documentation",
        "user manual",
        "installation instructions"
    ]
    
    # Endpoints that should require authentication
    PROTECTED_ENDPOINTS = [
        "/api/v1/system/status",
        "/api/v1/metrics",
        "/debug/state",
        "/admin/dashboard",
        "/api/v1/admin/users",
        "/api/v1/admin/settings"
    ]
    
    # Security headers that should be present
    SECURITY_HEADERS = {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "X-XSS-Protection": "1; mode=block",
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
        "Content-Security-Policy": "default-src 'self'",
        "Referrer-Policy": "strict-origin-when-cross-origin"
    }


class SecurityTestHelpers:
    """Helper functions for security testing."""
    
    @staticmethod
    def mock_security_manager():
        """Create a mock security manager for testing."""
        mock_manager = Mock()
        mock_manager.validate_token.return_value = True
        mock_manager.validate_api_key.return_value = True
        mock_manager.sanitize_input.return_value = "sanitized_input"
        return mock_manager
    
    @staticmethod
    def mock_logger():
        """Create a mock logger for testing."""
        mock_logger = Mock()
        mock_logger.info.return_value = None
        mock_logger.warning.return_value = None
        mock_logger.error.return_value = None
        return mock_logger
    
    @staticmethod
    def create_test_jwt_payload(expired: bool = False) -> Dict[str, Any]:
        """Create a test JWT payload."""
        from datetime import datetime, timedelta
        
        if expired:
            exp_time = datetime.utcnow() - timedelta(hours=1)
        else:
            exp_time = datetime.utcnow() + timedelta(hours=1)
        
        return {
            "sub": "test_user",
            "exp": exp_time,
            "iat": datetime.utcnow(),
            "user_id": "test_123",
            "role": "user"
        }
    
    @staticmethod
    def create_malicious_request_data() -> List[Dict[str, Any]]:
        """Create malicious request data for testing."""
        return [
            {"query": payload} for payload in SecurityTestConfig.SQL_INJECTION_PAYLOADS
        ] + [
            {"query": payload} for payload in SecurityTestConfig.XSS_PAYLOADS
        ] + [
            {"search": payload} for payload in SecurityTestConfig.ENCODED_PAYLOADS
        ]
    
    @staticmethod
    def validate_security_response(response) -> bool:
        """Validate that a response properly handles security threats."""
        # Check status code indicates rejection
        if response.status_code not in [400, 401, 403, 422]:
            return False
        
        # Check response doesn't contain reflected malicious content
        response_text = response.text.lower()
        dangerous_patterns = [
            "<script>", "</script>",
            "javascript:",
            "onerror=",
            "onload=",
            "drop table",
            "union select",
            "insert into"
        ]
        
        for pattern in dangerous_patterns:
            if pattern in response_text:
                return False
        
        return True
    
    @staticmethod
    def check_security_headers(response) -> Dict[str, bool]:
        """Check if security headers are present in response."""
        results = {}
        
        for header, expected_value in SecurityTestConfig.SECURITY_HEADERS.items():
            actual_value = response.headers.get(header)
            results[header] = actual_value is not None
            
            # For some headers, check specific values
            if header == "X-Content-Type-Options":
                results[header] = actual_value == "nosniff"
            elif header == "X-Frame-Options":
                results[header] = actual_value in ["DENY", "SAMEORIGIN"]
        
        return results


class SecurityTestFixtures:
    """Pytest fixtures for security testing."""
    
    @pytest.fixture
    def security_manager_mock(self):
        """Fixture providing a mock security manager."""
        return SecurityTestHelpers.mock_security_manager()
    
    @pytest.fixture
    def logger_mock(self):
        """Fixture providing a mock logger."""
        return SecurityTestHelpers.mock_logger()
    
    @pytest.fixture
    def malicious_payloads(self):
        """Fixture providing malicious test payloads."""
        return {
            "sql_injection": SecurityTestConfig.SQL_INJECTION_PAYLOADS,
            "xss": SecurityTestConfig.XSS_PAYLOADS,
            "encoded": SecurityTestConfig.ENCODED_PAYLOADS
        }
    
    @pytest.fixture
    def safe_inputs(self):
        """Fixture providing safe test inputs."""
        return SecurityTestConfig.SAFE_INPUTS
    
    @pytest.fixture
    def invalid_auth_tokens(self):
        """Fixture providing invalid authentication tokens."""
        return SecurityTestConfig.INVALID_AUTH_TOKENS
    
    @pytest.fixture
    def invalid_api_keys(self):
        """Fixture providing invalid API keys."""
        return SecurityTestConfig.INVALID_API_KEYS


# Security test decorators
def requires_authentication(func):
    """Decorator to mark tests that require authentication."""
    return pytest.mark.requires_auth(func)


def security_critical(func):
    """Decorator to mark security-critical tests."""
    return pytest.mark.security_critical(func)


def sql_injection_test(func):
    """Decorator to mark SQL injection tests."""
    return pytest.mark.sql_injection(func)


def xss_test(func):
    """Decorator to mark XSS tests."""
    return pytest.mark.xss(func)


# Example usage patterns
"""
Usage examples:

@security_critical
@sql_injection_test
def test_sql_injection_prevention(malicious_payloads):
    for payload in malicious_payloads["sql_injection"]:
        # Test SQL injection prevention
        pass

@requires_authentication
def test_protected_endpoint():
    # Test endpoint that requires authentication
    pass

@xss_test
def test_xss_prevention(malicious_payloads):
    for payload in malicious_payloads["xss"]:
        # Test XSS prevention
        pass
"""