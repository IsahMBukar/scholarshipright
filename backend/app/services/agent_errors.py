"""Production error handling for the Scholara AI agent.

Centralizes error codes and the user-facing text we show when the LLM provider,
database, tools, or stream itself misbehave. Every internal error path yields or
returns a structured `AgentError` carrying both a `code` (machine-readable) and
`user_message` (clean text the UI can show without leaking stack traces).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional


logger = logging.getLogger("scholara.agent")


# ── Error code constants (stable across releases) ─────────────────
LLM_TIMEOUT = "llm_timeout"
LLM_CONNECTION = "llm_connection"
LLM_AUTH = "llm_auth"
LLM_RATE_LIMIT = "llm_rate_limit"
LLM_BAD_RESPONSE = "llm_bad_response"
LLM_EMPTY_RESPONSE = "llm_empty_response"
LLM_MALFORMED_JSON = "llm_malformed_json"

DB_UNAVAILABLE = "db_unavailable"
DB_TIMEOUT = "db_timeout"

TOOL_FAILED = "tool_failed"
TOOL_EMPTY = "tool_empty"

STREAM_INTERRUPTED = "stream_interrupted"
INTERNAL_ERROR = "internal_error"

RESUME_MISSING = "resume_missing"
PROFILE_MISSING = "profile_missing"
MATCHES_NOT_COMPUTED = "matches_not_computed"
SCHOLARSHIP_NOT_FOUND = "scholarship_not_found"


@dataclass
class AgentError(Exception):
    code: str
    user_message: str
    technical: Optional[str] = None
    retryable: bool = True

    def __str__(self) -> str:  # pragma: no cover - cosmetic
        return f"{self.code}: {self.user_message}"

    def to_dict(self) -> dict:
        return {
            "error": True,
            "code": self.code,
            "user_message": self.user_message,
            "retryable": self.retryable,
        }


# ── Friendly UI messages (keep short, actionable, no internals) ───
DEFAULT_MESSAGES: dict[str, str] = {
    LLM_TIMEOUT: "The AI is taking a bit longer than usual. Please try again in a moment.",
    LLM_CONNECTION: "I can't reach the AI right now. Please try again in a few seconds.",
    LLM_AUTH: "The AI service is not configured correctly. Please contact support.",
    LLM_RATE_LIMIT: "The AI is busy. Please wait a moment and try again.",
    LLM_BAD_RESPONSE: "The AI returned an unexpected response. Please try again.",
    LLM_EMPTY_RESPONSE: "The AI did not return any answer. Please try again.",
    LLM_MALFORMED_JSON: "I had trouble understanding the AI response. Please try again.",

    DB_UNAVAILABLE: "Our database is temporarily unavailable. Please try again shortly.",
    DB_TIMEOUT: "The request took too long to look up your data. Please try again.",

    TOOL_FAILED: "I couldn't read some of your data. Please try again.",
    TOOL_EMPTY: "I don't have enough information to answer that yet.",

    STREAM_INTERRUPTED: "The response was cut off. Please send your question again.",

    RESUME_MISSING: "Upload a resume first so I can give you personalized advice.",
    PROFILE_MISSING: "Complete your profile first so I can tailor recommendations to you.",
    MATCHES_NOT_COMPUTED: "I haven't computed your matches yet. Compute them first and I'll guide you from there.",
    SCHOLARSHIP_NOT_FOUND: "I couldn't find that scholarship. It may have been removed or the link is wrong.",

    INTERNAL_ERROR: "Something went wrong on our end. Please try again.",
}


def user_message(code: str, context: Optional[dict] = None) -> str:
    """Return a stable, UI-safe message for an error code.

    `context` is reserved for future per-context copy overrides. Today every code
    has a single user-facing sentence.
    """
    return DEFAULT_MESSAGES.get(code, DEFAULT_MESSAGES[INTERNAL_ERROR])


def make(
    code: str,
    *,
    technical: Optional[str] = None,
    retryable: Optional[bool] = None,
    log: bool = True,
) -> AgentError:
    err = AgentError(
        code=code,
        user_message=user_message(code),
        technical=technical,
        retryable=retryable if retryable is not None else True,
    )
    if log:
        # Log technical detail for ops; never the user_message itself.
        logger.warning("agent_error code=%s retryable=%s technical=%s", code, err.retryable, technical)
    return err


def classify_httpx_error(exc: Exception) -> AgentError:
    """Map an httpx exception to a stable AgentError code."""
    import httpx

    if isinstance(exc, httpx.TimeoutException):
        return make(LLM_TIMEOUT, technical=f"timeout: {exc}", log=False)
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code
        if status in (401, 403):
            return make(LLM_AUTH, technical=f"http {status}", retryable=False)
        if status == 429:
            return make(LLM_RATE_LIMIT, technical=f"http {status}")
        return make(LLM_BAD_RESPONSE, technical=f"http {status}: {exc.response.text[:160]}")
    if isinstance(exc, (httpx.ConnectError, httpx.NetworkError, httpx.RemoteProtocolError)):
        return make(LLM_CONNECTION, technical=str(exc)[:200], log=False)
    return make(LLM_BAD_RESPONSE, technical=str(exc)[:200])


def classify_db_error(exc: Exception) -> AgentError:
    """Map a SQLAlchemy/asyncpg error to a stable AgentError code."""
    name = type(exc).__name__
    msg = str(exc) or name
    if "TimeoutError" in name or "timed out" in msg.lower():
        return make(DB_TIMEOUT, technical=msg[:200], log=False)
    if "OperationalError" in name or "DisconnectionError" in name or "InterfaceError" in name:
        return make(DB_UNAVAILABLE, technical=msg[:200], log=False)
    return make(INTERNAL_ERROR, technical=msg[:200])
