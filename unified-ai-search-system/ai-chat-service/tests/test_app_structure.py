"""
Test basic application structure and imports.
These tests can run in CI environments without requiring Ollama.
"""

import pytest
import sys
import os
from unittest.mock import Mock, patch


def test_main_module_imports():
    """Test that main app module can be imported."""
    # Mock dependencies to avoid import errors
    mock_modules = [
        'uvicorn', 'fastapi', 'structlog', 'redis', 'httpx', 
        'anthropic', 'openai', 'langchain', 'langgraph'
    ]
    
    with patch.dict('sys.modules', {mod: Mock() for mod in mock_modules}):
        try:
            import app.main
            assert hasattr(app.main, 'app')
        except ImportError as e:
            pytest.skip(f"Import dependencies not available: {e}")


def test_api_modules_exist():
    """Test that all renamed API modules exist."""
    api_modules = [
        'app.api.adaptive_routes',
        'app.api.analytics_routes', 
        'app.api.evaluation_routes',
        'app.api.models_routes',
        'app.api.monitoring_routes'
    ]
    
    for module_name in api_modules:
        module_path = module_name.replace('.', '/') + '.py'
        assert os.path.exists(module_path), f"Module file missing: {module_path}"


def test_old_api_modules_removed():
    """Test that old API module files were properly removed."""
    old_files = [
        'app/api/adaptive.py',
        'app/api/analytics.py',
        'app/api/evaluation.py', 
        'app/api/models.py',
        'app/api/monitoring.py'
    ]
    
    for old_file in old_files:
        assert not os.path.exists(old_file), f"Old file still exists: {old_file}"


def test_config_environment_handling():
    """Test that config handles different environments."""
    with patch.dict(os.environ, {'ENVIRONMENT': 'testing'}):
        try:
            from app.core.config import get_settings
            settings = get_settings()
            assert settings.environment == 'testing'
        except ImportError:
            pytest.skip("Config dependencies not available")


def test_router_definitions_in_api_files():
    """Test that each API file contains a router definition."""
    api_files = [
        'app/api/adaptive_routes.py',
        'app/api/analytics_routes.py',
        'app/api/evaluation_routes.py',
        'app/api/models_routes.py',
        'app/api/monitoring_routes.py'
    ]
    
    for file_path in api_files:
        with open(file_path, 'r') as f:
            content = f.read()
            assert 'router = APIRouter(' in content, f"No router definition in {file_path}"


def test_main_app_import_structure():
    """Test that main.py has correct import structure."""
    with open('app/main.py', 'r') as f:
        content = f.read()
    
    # Check for renamed module imports
    required_imports = [
        'adaptive_routes as adaptive',
        'analytics_routes as analytics',
        'evaluation_routes as evaluation', 
        'models_routes as models',
        'monitoring_routes as monitoring'
    ]
    
    for import_stmt in required_imports:
        assert import_stmt in content, f"Missing import: {import_stmt}"
    
    # Check that old imports are not present
    old_patterns = [
        'from app.api import adaptive,',
        'from app.api import analytics,',
        'from app.api import evaluation,',
        'from app.api import models,',
        'from app.api import monitoring,'
    ]
    
    for old_pattern in old_patterns:
        assert old_pattern not in content, f"Old import pattern found: {old_pattern}"


@pytest.mark.skipif(
    os.getenv('CI') or os.getenv('GITHUB_ACTIONS'), 
    reason="Skipping file syntax tests in CI"
)
def test_python_syntax_validity():
    """Test that all Python files have valid syntax."""
    import ast
    
    python_files = []
    for root, dirs, files in os.walk('app'):
        # Skip __pycache__ directories
        dirs[:] = [d for d in dirs if d != '__pycache__']
        for file in files:
            if file.endswith('.py'):
                python_files.append(os.path.join(root, file))
    
    for file_path in python_files:
        try:
            with open(file_path, 'r') as f:
                ast.parse(f.read())
        except SyntaxError as e:
            pytest.fail(f"Syntax error in {file_path}: {e}")


def test_requirements_files_exist():
    """Test that requirements files exist."""
    required_files = [
        'requirements.txt',
        'requirements-dev.txt'
    ]
    
    for req_file in required_files:
        assert os.path.exists(req_file), f"Requirements file missing: {req_file}"


def test_docker_files_exist():
    """Test that Docker configuration files exist."""
    docker_files = [
        'Dockerfile.production',
        'Dockerfile.runpod',
        'deploy/docker-compose.yml',
        'deploy/docker-compose.runpod.yml'
    ]
    
    for docker_file in docker_files:
        assert os.path.exists(docker_file), f"Docker file missing: {docker_file}"


def test_makefile_commands():
    """Test that Makefile has expected commands."""
    makefile_path = 'deploy/Makefile'
    assert os.path.exists(makefile_path), "Makefile missing"
    
    with open(makefile_path, 'r') as f:
        content = f.read()
    
    expected_targets = ['dev', 'prod', 'lint', 'format', 'typecheck', 'health', 'test']
    for target in expected_targets:
        assert f'{target}:' in content, f"Makefile target missing: {target}"