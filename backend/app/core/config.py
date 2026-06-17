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

    # Agent (BluesMinds / 0G AI router, OpenAI-compatible)
    agent_api_key: str = ""
    agent_base_url: str = "https://router-api.0g.ai/v1"
    agent_model: str = "gpt-4o-mini"

    # App
    frontend_url: str = "http://localhost:3000"
    secret_key: str = "change-me-in-production"
    # Dev only: include the raw password-reset token + URL in the
    # /api/auth/forgot-password response. Must be "1" to enable.
    # Leave "0" or unset in production so the response is always the
    # generic {status: "ok"} shape (no email enumeration, no token leak).
    dev_return_reset_token: str = "0"

    # pydantic-settings v2 model_config. extra="ignore" lets us keep
    # extra env vars (agent_*, dev_return_reset_token) in .env without
    # declaring them on the model. The original inner-class Config
    # style worked in pydantic v1 but pydantic-settings v2.13 rejects
    # extra env vars by default.
    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


@lru_cache()
def get_settings() -> Settings:
    return Settings()
