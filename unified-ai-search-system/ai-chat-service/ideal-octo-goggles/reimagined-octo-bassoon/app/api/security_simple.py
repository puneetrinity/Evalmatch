"""
Simple security module for validation testing.
"""

import re
from typing import Dict, Any, Optional
from urllib.parse import unquote


# Basic XSS patterns
XSS_PATTERNS = [
    r"<script[^>]*>",
    r"</script>",
    r"javascript:",
    r"on\w+\s*=",
    r"<iframe",
    r"<object",
    r"<embed",
    r"onerror\s*=",
    r"onload\s*=",
    r"alert\s*\(",
    r"eval\s*\(",
    r"expression\s*\("
]

# Basic SQL injection patterns
SQL_PATTERNS = [
    r"\bunion\s+select\b",
    r"\bselect\s+.*\bfrom\b",
    r"\binsert\s+into\b",
    r"\bupdate\s+.*\bset\b",
    r"\bdelete\s+from\b",
    r"\bdrop\s+table\b",
    r"\balter\s+table\b",
    r";\s*drop\s+table",
    r";\s*delete\s+from",
    r"'\s*or\s*'1'\s*=\s*'1",
    r"'\s*or\s*1\s*=\s*1",
    r"--\s*$",
    r"/\*.*\*/"
]

# Compiled patterns
COMPILED_XSS_PATTERNS = [re.compile(pattern, re.IGNORECASE) for pattern in XSS_PATTERNS]
COMPILED_SQL_PATTERNS = [re.compile(pattern, re.IGNORECASE) for pattern in SQL_PATTERNS]


def sanitize_input(text: str) -> str:
    """
    Sanitize input to prevent XSS and SQL injection.
    
    Args:
        text: Input text to sanitize
        
    Returns:
        Sanitized text
        
    Raises:
        ValueError: If malicious content is detected
    """
    if not text:
        return text
    
    # Check for XSS patterns
    for pattern in COMPILED_XSS_PATTERNS:
        if pattern.search(text):
            raise ValueError(f"Potential XSS detected in input: {text[:50]}...")
    
    # Check for SQL injection patterns
    for pattern in COMPILED_SQL_PATTERNS:
        if pattern.search(text):
            raise ValueError(f"Potential SQL injection detected in input: {text[:50]}...")
    
    # Check URL-decoded version
    try:
        decoded = unquote(text)
        if decoded != text:
            # Recursively check decoded version
            return sanitize_input(decoded)
    except Exception:
        # If decoding fails, continue with original text
        pass
    
    return text


def validate_api_key(api_key: str) -> bool:
    """
    Validate API key format.
    
    Args:
        api_key: API key to validate
        
    Returns:
        True if valid, False otherwise
    """
    if not api_key:
        return False
    
    if len(api_key) < 8:
        return False
    
    if len(api_key) > 128:
        return False
    
    # Check for dangerous characters
    dangerous_chars = ["<", ">", "&", "'", "\"", ";", "\n", "\r", "\t"]
    for char in dangerous_chars:
        if char in api_key:
            return False
    
    return True


def validate_jwt_token(token: str) -> Dict[str, Any]:
    """
    Validate JWT token (simplified for testing).
    
    Args:
        token: JWT token to validate
        
    Returns:
        Decoded token payload
        
    Raises:
        ValueError: If token is invalid
    """
    if not token:
        raise ValueError("Empty token")
    
    if len(token) < 10:
        raise ValueError("Token too short")
    
    # This is a simplified validation
    # In real implementation, use proper JWT library
    parts = token.split('.')
    if len(parts) != 3:
        raise ValueError("Invalid token format")
    
    # Return mock payload for testing
    return {
        "sub": "test_user",
        "exp": 9999999999,  # Far future
        "iat": 1000000000
    }


def log_security_event(event_type: str, message: str, details: Dict[str, Any] = None):
    """
    Log security event (simplified for testing).
    
    Args:
        event_type: Type of security event
        message: Event message
        details: Additional event details
    """
    print(f"SECURITY_EVENT: {event_type} - {message}")
    if details:
        print(f"Details: {details}")


class SecurityManager:
    """Simple security manager for testing."""
    
    def validate_token(self, token: str) -> bool:
        """Validate authentication token."""
        try:
            validate_jwt_token(token)
            return True
        except Exception:
            return False
    
    def validate_api_key(self, api_key: str) -> bool:
        """Validate API key."""
        return validate_api_key(api_key)
    
    def sanitize_input(self, text: str) -> str:
        """Sanitize input text."""
        return sanitize_input(text)