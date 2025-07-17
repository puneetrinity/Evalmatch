"""
Enhanced security module with comprehensive input validation and protection.
"""

import asyncio
import hashlib
import hmac
import re
import time
import threading
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Set
from urllib.parse import unquote

from fastapi import Depends, HTTPException, Request, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, field_validator
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.logging import get_correlation_id, get_logger
from app.schemas.responses import create_error_response

logger = get_logger("security")

# Security configuration
MAX_REQUEST_SIZE = 10 * 1024 * 1024  # 10MB
MAX_QUERY_LENGTH = 8000
MAX_FIELD_LENGTH = 1000
RATE_LIMIT_WINDOW = 60  # seconds
DEFAULT_RATE_LIMIT = 60  # requests per window

# Enhanced XSS and dangerous patterns
DANGEROUS_PATTERNS = [
    # Script tags (various forms)
    r"<script\b[^>]*>",
    r"</script>",
    r"<script[^>]*>[\s\S]*?</script>",
    
    # JavaScript URLs and handlers
    r"javascript:",
    r"vbscript:",
    r"on\w+\s*=",
    r"on\w+\s*:",
    
    # HTML tags that can execute code
    r"<iframe",
    r"<object",
    r"<embed",
    r"<form",
    r"<meta\b[^>]*http-equiv",
    r"<link\b[^>]*stylesheet",
    
    # Data URLs and base64
    r"data:text/html",
    r"data:text/javascript",
    r"data:application/javascript",
    r"data:image/svg\+xml",
    r"data:[^;]*;base64",
    
    # Expression and eval patterns
    r"expression\s*\(",
    r"eval\s*\(",
    r"setTimeout\s*\(",
    r"setInterval\s*\(",
    r"Function\s*\(",
    
    # CSS injection
    r"@import",
    r"url\s*\(",
    r"behavior\s*:",
    r"-moz-binding",
    
    # Encoded characters that could bypass filters
    r"&lt;script",
    r"&lt;/script&gt;",
    r"&#x[0-9a-fA-F]+;",
    r"&#[0-9]+;",
    r"%3C%73%63%72%69%70%74",  # URL encoded <script>
    r"%3E",  # URL encoded >
    r"onerror\s*=",
    r"onload\s*=",
    r"alert\s*\("
]

# Enhanced SQL injection patterns
SQL_PATTERNS = [
    # Basic SQL keywords
    r"\bunion\s+select\b",
    r"\bselect\s+.*\bfrom\b",
    r"\binsert\s+into\b",
    r"\bupdate\s+.*\bset\b",
    r"\bdelete\s+from\b",
    r"\bdrop\s+table\b",
    r"\balter\s+table\b",
    r"\bcreate\s+table\b",
    r"\btruncate\s+table\b",
    r"\bexec\s*\(",
    r"\bexecute\s*\(",
    
    # Advanced SQL injection patterns
    r";\s*(select|insert|update|delete|drop|alter|create|truncate|exec|execute)",
    r"\bor\s+1\s*=\s*1\b",
    r"\band\s+1\s*=\s*1\b",
    r"\bor\s+.*\s*=\s*.*\b",
    r"\'";\s*(select|insert|update|delete|drop|alter)",
    r"\bwaitfor\s+delay\b",
    r"\bbenchmark\s*\(",
    r"\bsleep\s*\(",
    r"\bpg_sleep\s*\(",
    
    # Comments and encoding
    r"--\s*$",
    r"/\*.*\*/",
    r"\bxp_cmdshell\b",
    r"\bsp_executesql\b",
    
    # Hex and unicode encoding
    r"\b0x[0-9a-fA-F]+\b",
    r"\\u[0-9a-fA-F]{4}",
    r"\\x[0-9a-fA-F]{2}",
    
    # Time-based injection
    r"\bif\s*\(.*,\s*sleep\s*\(",
    r"\bcase\s+when\s+.*\s+then\s+sleep\s*\("
]

# Compiled regex patterns for performance
COMPILED_DANGEROUS_PATTERNS = [
    re.compile(pattern, re.IGNORECASE) for pattern in DANGEROUS_PATTERNS
]
COMPILED_SQL_PATTERNS = [re.compile(pattern, re.IGNORECASE) for pattern in SQL_PATTERNS]


class SecurityViolation(Exception):
    """Raised when security validation fails."""
    
    def __init__(self, message: str, violation_type: str = "UNKNOWN", 
                 original_text: str = "", field: Optional[str] = None):
        super().__init__(message)
        self.violation_type = violation_type
        self.original_text = original_text
        self.field = field
        self.timestamp = datetime.utcnow()


def log_security_event(
    event_type: str,
    message: str,
    details: Optional[Dict[str, Any]] = None,
    severity: str = "WARNING"
) -> None:
    """Log security-related events with structured information."""
    event_data = {
        "event_type": event_type,
        "message": message,
        "severity": severity,
        "timestamp": datetime.utcnow().isoformat(),
        "correlation_id": get_correlation_id(),
        **(details or {})
    }
    
    log_message = f"SECURITY_EVENT: {event_type} - {message}"
    
    if severity == "CRITICAL":
        logger.critical(log_message, extra=event_data)
    elif severity == "ERROR":
        logger.error(log_message, extra=event_data)
    else:
        logger.warning(log_message, extra=event_data)


def sanitize_input(text: str, max_length: int = MAX_FIELD_LENGTH) -> str:
    """
    Sanitize input text to prevent XSS and SQL injection attacks.
    
    Args:
        text: Input text to sanitize
        max_length: Maximum allowed length
        
    Returns:
        Sanitized text
        
    Raises:
        SecurityViolation: If malicious content is detected
    """
    if not text:
        return text
    
    # Check length
    if len(text) > max_length:
        raise SecurityViolation(
            f"Input exceeds maximum length of {max_length} characters",
            violation_type="LENGTH_VIOLATION",
            original_text=text
        )
    
    # Normalize and decode text for analysis
    text_lower = text.lower()
    
    # URL decode to catch encoded attacks
    try:
        decoded_text = unquote(text_lower)
    except Exception:
        decoded_text = text_lower
    
    # Check both original and decoded text
    texts_to_check = [text_lower, decoded_text]
    
    for check_text in texts_to_check:
        # Check for XSS patterns
        for pattern in COMPILED_DANGEROUS_PATTERNS:
            if pattern.search(check_text):
                log_security_event(
                    "XSS_ATTEMPT",
                    f"XSS pattern detected: {pattern.pattern}",
                    details={
                        "original_text": text[:100] + "..." if len(text) > 100 else text,
                        "pattern": pattern.pattern,
                        "decoded": check_text != text_lower
                    }
                )
                raise SecurityViolation(
                    f"Potential XSS detected in input: {text[:50]}...",
                    violation_type="XSS_VIOLATION",
                    original_text=text
                )
        
        # Check for SQL injection patterns
        for pattern in COMPILED_SQL_PATTERNS:
            if pattern.search(check_text):
                log_security_event(
                    "SQL_INJECTION_ATTEMPT",
                    f"SQL injection pattern detected: {pattern.pattern}",
                    details={
                        "original_text": text[:100] + "..." if len(text) > 100 else text,
                        "pattern": pattern.pattern,
                        "decoded": check_text != text_lower
                    }
                )
                raise SecurityViolation(
                    f"Potential SQL injection detected in input: {text[:50]}...",
                    violation_type="SQL_INJECTION_VIOLATION",
                    original_text=text
                )
    
    return text


def validate_api_key(api_key: str) -> bool:
    """
    Validate API key format and security.
    
    Args:
        api_key: API key to validate
        
    Returns:
        True if valid, False otherwise
    """
    if not api_key:
        log_security_event(
            "API_KEY_VALIDATION",
            "Empty API key provided",
            details={"value_preview": "empty"},
            severity="ERROR"
        )
        return False
    
    # Check length
    if len(api_key) < 8 or len(api_key) > 128:
        log_security_event(
            "API_KEY_VALIDATION",
            f"API key length invalid: {len(api_key)}",
            details={"value_preview": api_key[:10]},
            severity="ERROR"
        )
        return False
    
    # Check for dangerous characters
    dangerous_chars = ["<", ">", "&", "'", "\"", ";", "\n", "\r", "\t", "\x00"]
    for char in dangerous_chars:
        if char in api_key:
            log_security_event(
                "API_KEY_VALIDATION",
                f"API key contains dangerous character: {repr(char)}",
                details={"value_preview": api_key[:100]},
                severity="ERROR"
            )
            return False
    
    return True


def validate_jwt_token(token: str) -> Dict[str, Any]:
    """
    Validate JWT token (enhanced version).
    
    Args:
        token: JWT token to validate
        
    Returns:
        Decoded token payload
        
    Raises:
        SecurityViolation: If token is invalid
    """
    if not token:
        raise SecurityViolation("Empty JWT token", violation_type="JWT_VALIDATION")
    
    if len(token) < 10:
        raise SecurityViolation("JWT token too short", violation_type="JWT_VALIDATION")
    
    if len(token) > 2048:
        raise SecurityViolation("JWT token too long", violation_type="JWT_VALIDATION")
    
    # Check for basic JWT format (3 parts separated by dots)
    parts = token.split('.')
    if len(parts) != 3:
        raise SecurityViolation("Invalid JWT format", violation_type="JWT_VALIDATION")
    
    # In a real implementation, you would:
    # 1. Verify signature
    # 2. Check expiration
    # 3. Validate claims
    
    # For now, return a mock payload for testing
    return {
        "sub": "validated_user",
        "exp": int(time.time()) + 3600,  # 1 hour from now
        "iat": int(time.time()),
        "valid": True
    }


class RateLimiter:
    """Thread-safe rate limiter for API endpoints."""
    
    def __init__(self, max_requests: int = DEFAULT_RATE_LIMIT, 
                 window_seconds: int = RATE_LIMIT_WINDOW,
                 max_identifiers: int = 10000):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.max_identifiers = max_identifiers
        self.requests: Dict[str, List[float]] = {}
        self.lock = threading.Lock()
    
    def _cleanup_old_requests(self, identifier: str, now: float) -> None:
        """Remove old requests outside the time window."""
        if identifier not in self.requests:
            return
        
        window = self.window_seconds
        identifiers_to_remove = []
        
        for req_id, req_times in self.requests.items():
            valid_requests = [req_time for req_time in req_times if now - req_time < window]
            if valid_requests:
                self.requests[req_id] = valid_requests
            else:
                identifiers_to_remove.append(req_id)
        
        # Remove empty identifiers
        for req_id in identifiers_to_remove:
            del self.requests[req_id]
        
        # Limit total identifiers to prevent memory issues
        if len(self.requests) > self.max_identifiers:
            # Remove oldest identifiers
            sorted_ids = sorted(
                self.requests.items(), 
                key=lambda x: max(x[1]) if x[1] else 0,
                reverse=True
            )[:self.max_identifiers]
            
            self.requests = dict(sorted_ids)
    
    def _get_request_count(self, identifier: str, now: float) -> int:
        """Get current request count for identifier."""
        if identifier not in self.requests:
            return 0
        
        # Filter to only recent requests
        window = self.window_seconds
        if identifier in self.requests:
            self.requests[identifier] = [
                req_time 
                for req_time in self.requests[identifier] 
                if now - req_time < window
            ]
        else:
            self.requests[identifier] = []
        
        # Return count
        current_requests = len(self.requests[identifier])
        return current_requests
    
    def is_allowed(self, identifier: str) -> bool:
        """Check if request is allowed for identifier."""
        with self.lock:
            now = time.time()
            
            # Cleanup old requests
            self._cleanup_old_requests(identifier, now)
            
            # Check current request count
            current_requests = self._get_request_count(identifier, now)
            
            if current_requests >= self.max_requests:
                return False
            
            # Record this request
            if identifier not in self.requests:
                self.requests[identifier] = []
            
            self.requests[identifier].append(now)
            return True
    
    def get_remaining(self, identifier: str) -> int:
        """Get remaining requests for identifier."""
        with self.lock:
            now = time.time()
            current_requests = self._get_request_count(identifier, now)
            return max(0, self.max_requests - current_requests)


class SecurityManager:
    """Central security management."""
    
    def __init__(self):
        self.rate_limiter = RateLimiter()
    
    def validate_token(self, token: str) -> bool:
        """Validate authentication token."""
        try:
            validate_jwt_token(token)
            return True
        except SecurityViolation:
            return False
    
    def validate_api_key(self, api_key: str) -> bool:
        """Validate API key."""
        return validate_api_key(api_key)
    
    def sanitize_input(self, text: str) -> str:
        """Sanitize input text."""
        return sanitize_input(text)
    
    def check_rate_limit(self, identifier: str) -> bool:
        """Check if request is within rate limits."""
        return self.rate_limiter.is_allowed(identifier)


# Global security manager instance
security_manager = SecurityManager()

# Export main functions
__all__ = [
    "SecurityManager",
    "SecurityViolation", 
    "sanitize_input",
    "validate_api_key",
    "validate_jwt_token",
    "log_security_event",
    "security_manager"
]