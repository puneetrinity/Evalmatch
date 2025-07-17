import asyncio
from app.models.ollama_client import OllamaClient

async def test_ollama_client():
    client = OllamaClient(base_url="http://localhost:11434")
    await client.initialize()
    result = await client.generate(
        model_name="phi3:mini",
        prompt="Hello, how are you?",
        max_tokens=50,
        temperature=0.7
    )
    print(f"Success: {result.success}")
    print(f"Text: {result.text}")
    print(f"Error: {result.error}")

if __name__ == "__main__":
    asyncio.run(test_ollama_client())
