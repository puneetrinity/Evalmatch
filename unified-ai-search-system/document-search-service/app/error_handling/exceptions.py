"""Comprehensive error handling for the search pipeline."""

import traceback
import sys
from typing import Any, Dict, Optional, Type
from enum import Enum
from datetime import datetime, timezone
import uuid

class ErrorCode(str, Enum):
    """Standardized error codes."""
    VALIDATION_ERROR = "VALIDATION_ERROR"
    SEARCH_ENGINE_ERROR = "SEARCH_ENGINE_ERROR" 
    INDEX_BUILD_ERROR = "INDEX_BUILD_ERROR"
    DATA_LOADING_ERROR = "DATA_LOADING_ERROR"
    EMBEDDING_ERROR = "EMBEDDING_ERROR"
    STORAGE_ERROR = "STORAGE_ERROR"
    NETWORK_ERROR = "NETWORK_ERROR"
    TIMEOUT_ERROR = "TIMEOUT_ERROR"
    RESOURCE_EXHAUSTED = "RESOURCE_EXHAUSTED"
    INTERNAL_ERROR = "INTERNAL_ERROR"
    CONFIGURATION_ERROR = "CONFIGURATION_ERROR"

class SearchSystemException(Exception):
    """Base exception for search system errors."""
    
    def __init__(
        self, 
        message: str, 
        error_code: ErrorCode = ErrorCode.INTERNAL_ERROR,
        details: Optional[Dict[str, Any]] = None,
        cause: Optional[Exception] = None
    ):
        super().__init__(message)
        self.message = message
        self.error_code = error_code
        self.details = details or {}
        self.cause = cause
        self.request_id = str(uuid.uuid4())
        self.timestamp = datetime.now(timezone.utc).isoformat()
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert exception to dictionary for API responses."""
        return {
            'error': self.error_code.value,
            'message': self.message,
            'details': self.details,
            'request_id': self.request_id,
            'timestamp': self.timestamp
        }

class ValidationException(SearchSystemException):
    """Exception for input validation errors."""
    
    def __init__(self, message: str, field: Optional[str] = None, value: Any = None):
        details = {}
        if field:
            details['field'] = field
        if value is not None:
            details['invalid_value'] = str(value)[:100]  # Truncate for safety
        super().__init__(message, ErrorCode.VALIDATION_ERROR, details)

class SearchEngineException(SearchSystemException):
    """Exception for search engine errors."""
    
    def __init__(self, message: str, query: Optional[str] = None, cause: Optional[Exception] = None):
        details = {}
        if query:
            details['query'] = query[:100]  # Truncate for safety
        super().__init__(message, ErrorCode.SEARCH_ENGINE_ERROR, details, cause)

class IndexBuildException(SearchSystemException):
    """Exception for index building errors."""
    
    def __init__(self, message: str, data_source: Optional[str] = None, cause: Optional[Exception] = None):
        details = {}
        if data_source:
            details['data_source'] = data_source
        super().__init__(message, ErrorCode.INDEX_BUILD_ERROR, details, cause)

class EmbeddingException(SearchSystemException):
    """Exception for embedding-related errors."""
    
    def __init__(self, message: str, text: Optional[str] = None, cause: Optional[Exception] = None):
        details = {}
        if text:
            details['text_length'] = len(text)
            details['text_preview'] = text[:50] + "..." if len(text) > 50 else text
        super().__init__(message, ErrorCode.EMBEDDING_ERROR, details, cause)

class ResourceExhaustedException(SearchSystemException):
    """Exception for resource exhaustion (memory, disk, etc.)."""
    
    def __init__(self, message: str, resource_type: str, current_usage: Optional[float] = None):
        details = {'resource_type': resource_type}
        if current_usage is not None:
            details['current_usage'] = current_usage
        super().__init__(message, ErrorCode.RESOURCE_EXHAUSTED, details)

def safe_execute(func, *args, default_return=None, error_logger=None, **kwargs):
    """Safely execute a function with comprehensive error handling."""
    try:
        return func(*args, **kwargs)
    except SearchSystemException:
        # Re-raise our custom exceptions
        raise
    except Exception as e:
        if error_logger:
            error_logger.error(f"Unexpected error in {func.__name__}: {str(e)}")
        # Wrap unknown exceptions
        raise SearchSystemException(
            f"Unexpected error in {func.__name__}: {str(e)}", 
            ErrorCode.INTERNAL_ERROR,
            {'function': func.__name__, 'original_error': str(e)},
            e
        ) from e

async def safe_execute_async(func, *args, default_return=None, error_logger=None, **kwargs):
    """Safely execute an async function with comprehensive error handling."""
    try:
        return await func(*args, **kwargs)
    except SearchSystemException:
        # Re-raise our custom exceptions
        raise
    except Exception as e:
        if error_logger:
            error_logger.error(f"Unexpected error in {func.__name__}: {str(e)}")
        # Wrap unknown exceptions
        raise SearchSystemException(
            f"Unexpected error in {func.__name__}: {str(e)}", 
            ErrorCode.INTERNAL_ERROR,
            {'function': func.__name__, 'original_error': str(e)},
            e
        ) from e

def handle_and_log_error(error: Exception, logger, operation: str = "operation") -> SearchSystemException:
    """Handle and log errors consistently."""
    if isinstance(error, SearchSystemException):
        logger.error(
            f"Search system error during {operation}",
            extra_fields={
                'error_code': error.error_code.value,
                'request_id': error.request_id,
                'details': error.details
            }
        )
        return error
    else:
        # Create a new SearchSystemException for unexpected errors
        search_error = SearchSystemException(
            f"Unexpected error during {operation}: {str(error)}",
            ErrorCode.INTERNAL_ERROR,
            {'operation': operation, 'original_error': str(error)},
            error
        )
        logger.error(
            f"Unexpected error during {operation}",
            extra_fields={
                'error_code': search_error.error_code.value,
                'request_id': search_error.request_id,
                'details': search_error.details,
                'traceback': traceback.format_exc()
            }
        )
        return search_error

class ErrorHandler:
    """Centralized error handling for the search system."""
    
    def __init__(self, logger):
        self.logger = logger
    
    def handle_validation_error(self, field: str, value: Any, message: str) -> ValidationException:
        """Handle validation errors."""
        error = ValidationException(message, field, value)
        self.logger.warning(
            f"Validation error for field '{field}'",
            extra_fields=error.details
        )
        return error
    
    def handle_search_error(self, query: str, error: Exception) -> SearchEngineException:
        """Handle search-related errors."""
        if isinstance(error, SearchSystemException):
            return error
        
        search_error = SearchEngineException(
            f"Search failed: {str(error)}", 
            query, 
            error
        )
        self.logger.error(
            "Search operation failed",
            extra_fields=search_error.details
        )
        return search_error
    
    def handle_index_build_error(self, data_source: str, error: Exception) -> IndexBuildException:
        """Handle index building errors."""
        if isinstance(error, SearchSystemException):
            return error
        
        build_error = IndexBuildException(
            f"Index build failed: {str(error)}", 
            data_source, 
            error
        )
        self.logger.error(
            "Index build operation failed",
            extra_fields=build_error.details
        )
        return build_error
    
    def handle_embedding_error(self, text: str, error: Exception) -> EmbeddingException:
        """Handle embedding-related errors."""
        if isinstance(error, SearchSystemException):
            return error
        
        embedding_error = EmbeddingException(
            f"Embedding generation failed: {str(error)}", 
            text, 
            error
        )
        self.logger.error(
            "Embedding operation failed",
            extra_fields=embedding_error.details
        )
        return embedding_error
