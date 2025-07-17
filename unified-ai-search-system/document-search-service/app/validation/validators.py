"""Comprehensive input validation for all API endpoints."""

from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, Field, field_validator
from enum import Enum
import re

class SeniorityLevel(str, Enum):
    JUNIOR = "junior"
    MID = "mid"
    SENIOR = "senior"
    LEAD = "lead"
    PRINCIPAL = "principal"

class SearchFilters(BaseModel):
    """Validated search filters."""
    min_experience: Optional[int] = Field(None, ge=0, le=50, description="Minimum years of experience")
    max_experience: Optional[int] = Field(None, ge=0, le=50, description="Maximum years of experience")
    seniority_levels: Optional[List[SeniorityLevel]] = Field(None, description="Required seniority levels")
    required_skills: Optional[List[str]] = Field(None, max_length=20, description="Required skills")
    excluded_skills: Optional[List[str]] = Field(None, max_length=10, description="Skills to exclude")
    
    @field_validator('required_skills', 'excluded_skills')
    @classmethod
    def validate_skills(cls, v):
        if v is None:
            return v
        # Sanitize skill names
        sanitized = []
        for skill in v:
            if not isinstance(skill, str):
                continue
            # Remove special characters but keep alphanumeric and common separators
            clean_skill = re.sub(r'[^a-zA-Z0-9\s\-\+\#\.]', '', skill.strip())
            if clean_skill and len(clean_skill) <= 50:
                sanitized.append(clean_skill)
        return sanitized[:20] if sanitized else None
    
    @field_validator('max_experience')
    @classmethod
    def validate_experience_range(cls, v, info):
        if v is not None and 'min_experience' in info.data and info.data['min_experience'] is not None:
            if v < info.data['min_experience']:
                raise ValueError('max_experience must be greater than or equal to min_experience')
        return v

class SearchRequest(BaseModel):
    """Validated search request."""
    query: str = Field(..., min_length=1, max_length=500, description="Search query")
    num_results: int = Field(10, ge=1, le=100, description="Number of results to return")
    filters: Optional[SearchFilters] = Field(None, description="Search filters")
    include_debug: bool = Field(False, description="Include debug information in response")
    
    @field_validator('query')
    @classmethod
    def validate_query(cls, v):
        # Basic sanitization - remove excessive whitespace and potential injection attempts
        clean_query = re.sub(r'\s+', ' ', v.strip())
        # Remove common injection patterns while preserving legitimate search terms
        dangerous_patterns = [
            r'<script[^>]*>.*?</script>',
            r'javascript:',
            r'on\w+\s*=',
            r'eval\s*\(',
            r'document\.',
            r'window\.',
        ]
        for pattern in dangerous_patterns:
            clean_query = re.sub(pattern, '', clean_query, flags=re.IGNORECASE)
        
        if not clean_query:
            raise ValueError('Query cannot be empty after sanitization')
        return clean_query

class IndexBuildRequest(BaseModel):
    """Validated index build request."""
    data_source: str = Field(..., min_length=1, max_length=500, description="Path to the data file")
    force_rebuild: bool = Field(False, description="Force rebuild even if indexes exist")
    backup_existing: bool = Field(True, description="Backup existing indexes before rebuild")
    
    @field_validator('data_source')
    @classmethod
    def validate_data_source(cls, v):
        # Ensure data source is a safe path
        clean_path = v.strip()
        
        # Prevent path traversal attacks
        if '..' in clean_path or clean_path.startswith('/'):
            raise ValueError('Invalid data source path')
        
        # Must be a JSON file in the data directory
        if not clean_path.startswith('data/') or not clean_path.endswith('.json'):
            raise ValueError('Data source must be a JSON file in the data/ directory')
        
        return clean_path

class HealthCheckResponse(BaseModel):
    """Health check response model."""
    status: str = Field(..., description="Overall system status")
    timestamp: str = Field(..., description="Current timestamp")
    version: str = Field(..., description="System version")
    uptime_seconds: float = Field(..., description="System uptime in seconds")
    components: Dict[str, Dict[str, Any]] = Field(..., description="Component health status")

class MetricsResponse(BaseModel):
    """Metrics response model."""
    counters: Dict[str, float] = Field(..., description="Counter metrics")
    gauges: Dict[str, float] = Field(..., description="Gauge metrics") 
    histograms: Dict[str, Dict[str, float]] = Field(..., description="Histogram statistics")
    timestamp: str = Field(..., description="Metrics timestamp")

class ErrorResponse(BaseModel):
    """Standardized error response."""
    error: str = Field(..., description="Error type")
    message: str = Field(..., description="Error message")
    details: Optional[Dict[str, Any]] = Field(None, description="Additional error details")
    timestamp: str = Field(..., description="Error timestamp")
    request_id: Optional[str] = Field(None, description="Request ID for tracking")

# Validation utility functions
def validate_pagination(offset: int = 0, limit: int = 10) -> tuple[int, int]:
    """Validate pagination parameters."""
    offset = max(0, min(offset, 10000))  # Prevent excessive offset
    limit = max(1, min(limit, 100))      # Reasonable limit bounds
    return offset, limit

def sanitize_text_input(text: str, max_length: int = 1000) -> str:
    """Sanitize text input for safety."""
    if not isinstance(text, str):
        return ""
    
    # Trim whitespace and limit length
    clean_text = text.strip()[:max_length]
    
    # Remove potential HTML/script content
    clean_text = re.sub(r'<[^>]+>', '', clean_text)
    
    # Remove control characters except newlines and tabs
    clean_text = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', clean_text)
    
    return clean_text

def validate_document_structure(doc: Dict[str, Any]) -> bool:
    """Validate document structure for indexing."""
    required_fields = ['id', 'name']
    
    # Check required fields
    for field in required_fields:
        if field not in doc:
            return False
    
    # Validate field types and content
    if not isinstance(doc['id'], str) or len(doc['id']) > 100:
        return False
    
    if not isinstance(doc['name'], str) or len(doc['name']) > 200:
        return False
    
    # Validate optional numeric fields
    if 'experience_years' in doc:
        if not isinstance(doc['experience_years'], (int, float)) or doc['experience_years'] < 0:
            return False
    
    # Validate skills as list of strings
    if 'skills' in doc:
        if not isinstance(doc['skills'], list):
            return False
        for skill in doc['skills']:
            if not isinstance(skill, str) or len(skill) > 100:
                return False
    
    return True
