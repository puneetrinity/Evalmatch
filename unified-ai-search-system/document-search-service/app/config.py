
import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    embedding_model_name: str = 'all-MiniLM-L6-v2'
    embedding_dim: int = int(os.getenv("EMBEDDING_DIM", "384"))
    use_gpu: bool = os.getenv("USE_GPU", "false").lower() == "true"
    # Use Fly.io volume for persistent storage in production, fallback to temp directories
    index_path: str = os.getenv("INDEX_PATH", "/app/data/indexes" if os.getenv("PYTHON_ENV") == "production" else "./indexes")
    data_path: str = os.getenv("UPLOAD_PATH", "/app/data/uploads" if os.getenv("PYTHON_ENV") == "production" else "./data")

    class Config:
        env_file = ".env"

settings = Settings()
