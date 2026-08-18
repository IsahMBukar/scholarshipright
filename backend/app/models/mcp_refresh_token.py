"""
MCP OAuth refresh tokens — hashed-at-rest, revocable, rotation-aware.

Schema:
    mcp_refresh_tokens(
        id uuid pk,
        token_hash varchar(64) not null unique,   -- SHA256 of the raw refresh token
        token_prefix varchar(8) not null,         -- first 8 chars for display (rt-xxxx...)
        user_id uuid fk -> users.id,              -- who the token belongs to
        client_id varchar(128) not null,          -- the OAuth client it was issued to
        scope varchar(512) not null,              -- space-separated scopes bound to the token
        created_at timestamptz default now(),
        expires_at timestamptz not null,          -- MCP_REFRESH_TOKEN_TTL (default 30 days)
        revoked_at timestamptz,                   -- explicit revoke (/mcp-revoke or rotation)
        replaced_by uuid,                         -- token rotation: id of the successor token
        ip_address varchar(45),
        user_agent varchar(512)
    )

Why a refresh token table:
  - Access tokens are stateless HS256 JWTs and cannot be revoked before expiry.
    A DB-backed refresh token gives admins (and the user) a real "disconnect
    the agent" control: revoke its refresh token and it can never mint a new
    access token.
  - Storing only the SHA256 hash means a DB leak doesn't expose usable tokens.
  - Rotation: every refresh mints a successor and revokes the old token, so a
    stolen refresh token can be detected (reuse of a rotated token = theft).
"""
import hashlib
import logging
import secrets
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import text as sa_text

from app.db.session import Base, engine

logger = logging.getLogger("scholarshipright.mcp_refresh_token")


def hash_token(token: str) -> str:
    """SHA256 hex of a refresh token — never store the raw value."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_refresh_token() -> str:
    """URL-safe 32-byte random refresh token (≈43 chars), rt- prefixed."""
    return f"rt-{secrets.token_urlsafe(32)}"


class McpRefreshToken(Base):
    __tablename__ = "mcp_refresh_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    token_hash = Column(String(64), nullable=False, unique=True, index=True)
    token_prefix = Column(String(8), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    client_id = Column(String(128), nullable=False)
    scope = Column(String(512), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    replaced_by = Column(UUID(as_uuid=True), nullable=True)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(Text, nullable=True)


async def ensure_mcp_refresh_tokens_table() -> None:
    """Idempotent runtime migration for the mcp_refresh_tokens table.

    Safe to run on every startup.
    """
    try:
        async with engine.begin() as conn:
            await conn.execute(sa_text("""
                CREATE TABLE IF NOT EXISTS mcp_refresh_tokens (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    token_hash VARCHAR(64) NOT NULL UNIQUE,
                    token_prefix VARCHAR(8) NOT NULL,
                    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    client_id VARCHAR(128) NOT NULL,
                    scope VARCHAR(512) NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    expires_at TIMESTAMPTZ NOT NULL,
                    revoked_at TIMESTAMPTZ,
                    replaced_by UUID,
                    ip_address VARCHAR(45),
                    user_agent TEXT
                )
            """))
            await conn.execute(sa_text(
                "CREATE INDEX IF NOT EXISTS ix_mcp_refresh_tokens_user_id "
                "ON mcp_refresh_tokens (user_id)"
            ))
            await conn.execute(sa_text(
                "CREATE INDEX IF NOT EXISTS ix_mcp_refresh_tokens_token_hash "
                "ON mcp_refresh_tokens (token_hash)"
            ))
    except Exception:  # noqa: BLE001
        logger.exception("ensure_mcp_refresh_tokens_table failed")
