from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql://user:***@localhost:5432/scholarshipright"
    redis_url: str = "redis://localhost:6379"

    # Auth (Supabase)
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""

    # AI
    anthropic_api_key: str = ""
    claude_model: str = "claude-sonnet-4-20250514"

    # Email
    resend_api_key: str = ""
    from_email: str = "noreply@scholarshipright.com"

    # App
    frontend_url: str = "http://localhost:3000"
    secret_key: str = "change-me-in-production"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
