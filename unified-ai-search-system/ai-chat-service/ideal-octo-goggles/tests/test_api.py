
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_root():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Welcome to the Ultra-Fast Data Analysis System"}

def test_search_not_initialized():
    response = client.post("/api/v2/search/ultra-fast", json={"query": "test"})
    assert response.status_code == 503
    assert response.json() == {"detail": "Search engine not initialized."}

def test_build_indexes():
    # This is a more complex test that would require mocking the search engine
    # and the data loading. For now, we'll just test the endpoint.
    response = client.post("/api/v2/admin/build-indexes", json={"data_source": "data/resumes.json"})
    assert response.status_code == 200
    assert response.json() == {"message": "Index building started in the background."}
