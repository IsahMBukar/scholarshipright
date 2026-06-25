from pydantic import Field
from pydantic_settings import BaseSettings
from functools import lru_cache


# Production safety floor: a real JWT secret must be at least this long.
# 32 chars matches the OWASP recommendation for HS256 signing keys.
_MIN_JWT_SECRET_LEN = 32

# Sentinel used to detect the dev-default placeholder string that was in
# earlier .env files. If a production deploy sees this, that's a sign of
# an unrotated dev secret and we refuse to start.
_LEGACY_DEV_SECRET_MARKERS = {
    "change-me-in-production",
    "change-me-to-a-random-secret-key",
    "scholarshipright-dev-secret-change-in-production",
}


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

    # Runtime environment: "development" (default) or "production".
    # Read from the ENVIRONMENT env var. Changing this enables a suite of
    # prod-only safety checks; see _validate_security_settings() below.
    environment: str = "development"

    # JWT signing secret. Mapped to the JWT_SECRET env variable.
    # - In development: the empty default is allowed (so a fresh clone boots).
    # - In production: must be non-empty, not a known dev placeholder, and
    #   at least 32 chars of random data. The app refuses to start otherwise.
    jwt_secret: str = Field(default="", alias="JWT_SECRET")
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


def _validate_security_settings(settings: "Settings") -> None:
    """Refuse to boot the API in production with weakly-configured secrets.

    Triggered by ``environment == "production"``. Catches three failure modes:

    1. Empty JWT_SECRET — would mean tokens would be signed with the empty
       string and accept any forged token.
    2. Known dev placeholder ("change-me-..." etc.) — a tell that an old
       .env file was copied into production unchanged.
    3. JWT_SECRET shorter than 32 chars — below the OWASP-recommended floor
       for HS256 keys, vulnerable to brute force.
    """
    if settings.environment != "production":
        return

    secret = settings.jwt_secret or ""
    problems: list[str] = []

    if not secret:
        problems.append(
            "JWT_SECRET is empty. Generate one with: "
            "`python -c \"import secrets; print(secrets.token_urlsafe(48))\"`"
        )
    elif secret in _LEGACY_DEV_SECRET_MARKERS:
        problems.append(
            "JWT_SECRET is set to a known development placeholder. "
            "Generate a new production-only secret."
        )
    elif len(secret) < _MIN_JWT_SECRET_LEN:
        problems.append(
            f"JWT_SECRET is {len(secret)} chars; minimum is {_MIN_JWT_SECRET_LEN}."
        )

    if problems:
        details = "\n  - ".join(problems)
        raise RuntimeError(
            "Refusing to start in production with insecure settings:\n  - "
            + details
        )


@lru_cache()
def get_settings() -> Settings:
    settings = Settings()
    _validate_security_settings(settings)
    return settings
