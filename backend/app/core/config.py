from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql://system@localhost:5432/scholarshipright"
    redis_url: str = "redis://localhost:6379"

    # Unified LLM provider (OpenAI-compatible endpoint).
    # Set LLM_BASE_URL, LLM_API_KEY, and LLM_MODEL to control both the
    # resume analyzer and the Scholara agent. For backward compatibility
    # the old OPENAI_* / AGENT_* variables are still read if LLM_* are not
    # set. If you switch providers, change only these three values.
    llm_base_url: str = ""
    llm_api_key: str = ""
    llm_model: str = ""

    # Legacy LLM variables (kept for backward compatibility)
    openai_api_key: str = ""
    openai_base_url: str = ""
    openai_model: str = ""
    agent_api_key: str = ""
    agent_base_url: str = ""
    agent_model: str = ""

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

    @property
    def resolved_llm_base_url(self) -> str:
        return self.llm_base_url or self.agent_base_url or self.openai_base_url or ""

    @property
    def resolved_llm_api_key(self) -> str:
        return self.llm_api_key or self.agent_api_key or self.openai_api_key or ""

    @property
    def resolved_llm_model(self) -> str:
        return self.llm_model or self.agent_model or self.openai_model or ""


@lru_cache()
def get_settings() -> Settings:
    return Settings()
