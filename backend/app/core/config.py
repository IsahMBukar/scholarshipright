from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql://system@localhost:5432/scholarshipright"
    redis_url: str = "redis://localhost:6379"

    # LLM (OpenAI-compatible)
    openai_api_key: str = ""
    openai_base_url: str = "https://api.xiaomimimo.com/v1"
    openai_model: str = "MiMo-V2.5"

    # App
    frontend_url: str = "http://localhost:3000"
    secret_key: str = "change-me-in-production"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
