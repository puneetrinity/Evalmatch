import requests

def test_invalid_quality_requirement():
    url = "http://localhost:8000/api/v1/chat/complete"
    payload = {
        "message": "Test message",
        "quality_requirement": "not_a_valid_quality"
    }
    response = requests.post(url, json=payload, headers={"X-Bypass-RateLimit": "true"})
    print("Status code:", response.status_code)
    print("Response:", response.text)
    assert response.status_code == 422, f"Expected 422, got {response.status_code}: {response.text}"

if __name__ == "__main__":
    test_invalid_quality_requirement()
