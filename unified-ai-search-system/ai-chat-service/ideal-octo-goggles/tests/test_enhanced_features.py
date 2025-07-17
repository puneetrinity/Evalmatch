"""Tests for enhanced validation and error handling."""

import pytest
from app.validation.validators import SearchRequest, SearchFilters, validate_document_structure
from app.error_handling.exceptions import ValidationException, SearchEngineException

def test_search_request_validation():
    """Test search request validation."""
    # Valid request
    request = SearchRequest(query="python developer", num_results=10)
    assert request.query == "python developer"
    assert request.num_results == 10
    
    # Test query sanitization
    request = SearchRequest(query="   multiple   spaces   ", num_results=5)
    assert request.query == "multiple spaces"
    
    # Test invalid num_results
    with pytest.raises(ValueError):
        SearchRequest(query="test", num_results=0)
    
    with pytest.raises(ValueError):
        SearchRequest(query="test", num_results=101)

def test_search_filters_validation():
    """Test search filters validation."""
    # Valid filters
    filters = SearchFilters(
        min_experience=2,
        max_experience=10,
        required_skills=["Python", "AWS"]
    )
    assert filters.min_experience == 2
    assert filters.max_experience == 10
    assert "Python" in filters.required_skills
    
    # Test experience range validation
    with pytest.raises(ValueError):
        SearchFilters(min_experience=10, max_experience=5)
    
    # Test skill sanitization
    filters = SearchFilters(required_skills=["Python<script>", "AWS & Docker", ""])
    assert "Pythonscript" in filters.required_skills
    assert "AWS  Docker" in filters.required_skills
    assert len(filters.required_skills) == 2  # Empty string removed

def test_document_structure_validation():
    """Test document structure validation."""
    # Valid document
    valid_doc = {
        "id": "test_1",
        "name": "John Doe",
        "experience_years": 5,
        "skills": ["Python", "AWS"]
    }
    assert validate_document_structure(valid_doc) is True
    
    # Missing required fields
    invalid_doc = {"name": "John Doe"}
    assert validate_document_structure(invalid_doc) is False
    
    # Invalid field types
    invalid_doc = {"id": "test_1", "name": "John Doe", "experience_years": "five"}
    assert validate_document_structure(invalid_doc) is False

def test_search_engine_exception():
    """Test search engine exception handling."""
    exception = SearchEngineException("Search failed", query="test query")
    
    assert exception.message == "Search failed"
    assert exception.details["query"] == "test query"
    assert "request_id" in exception.to_dict()
    assert "timestamp" in exception.to_dict()

def test_validation_exception():
    """Test validation exception handling."""
    exception = ValidationException("Invalid field", field="query", value="")
    
    assert exception.message == "Invalid field"
    assert exception.details["field"] == "query"
    assert exception.details["invalid_value"] == ""
