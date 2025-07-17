
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    embedding_model_name: str = 'all-MiniLM-L6-v2'
    embedding_dim: int = 384
    use_gpu: bool = False
    index_path: str = "./indexes"

    class Config:
        env_file = ".env"

settings = Settings()
