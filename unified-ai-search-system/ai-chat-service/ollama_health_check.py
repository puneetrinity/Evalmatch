import os
import requests

ollama_host = os.getenv("OLLAMA_HOST", "http://localhost:11434")
health_url = f"{ollama_host}/api/health"

try:
    resp = requests.get(health_url, timeout=5)
    print(f"Ollama health check status: {resp.status_code}")
    print(f"Response: {resp.text}")
except Exception as e:
    print(f"Failed to reach Ollama at {health_url}: {e}")
