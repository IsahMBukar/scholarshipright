"""
Password reset tokens — one-time use, short-lived, hashed-at-rest.

Schema:
    password_reset_tokens(
        id uuid pk,
        user_id uuid fk -> users.id,        -- who the token is for
        token_hash varchar(64) not null,    -- SHA256 of the token (never store raw)
        created_at timestamptz default now(),
        expires_at timestamptz not null,    -- 1 hour
        used_at timestamptz,                -- null until consumed
        invalidated_at timestamptz,         -- explicit cancel (e.g. on password change elsewhere)
    )

The raw token is generated once at /forgot-password, returned to the caller in
the response in dev mode (and would be sent via email in production), and
hashed before being stored. /reset-password hashes the inbound token, looks it
up, verifies not-expired + not-used, then updates the user's password and
marks the row used.

Why a separate table (not admin_invites):
  - Different TTL: 1 hour vs 7 days
  - Different lifecycle: "used_at" only, no "revoked_by"
  - Different FK: targets the user's own user_id, not invited_by
  - Tighter cleanup: expired/used tokens are pure data with no audit value,
    so we can purge them cheaply
"""
import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import text as sa_text

from app.db.session import Base, engine


# 1 hour is the common industry default for password reset links. Long enough
# for users to find/check email, short enough to limit brute force / leakage.
RESET_TTL_MINUTES = 60


def hash_token(token: str) -> str:
    """SHA256 hex of a token — we never store the raw token."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_token() -> str:
    """URL-safe 32-byte random token (≈43 chars)."""
    return secrets.token_urlsafe(32)


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash = Column(String(64), nullable=False, index=True)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)
    # Set when we want to kill a token without consuming it (e.g. a new
    # /forgot-password request supersedes the old one). Same null semantics
    # as used_at but distinct intent — useful in audit queries.
    invalidated_at = Column(DateTime(timezone=True), nullable=True)


async def ensure_password_reset_schema_columns() -> None:
    """Idempotent runtime migration for the password_reset_tokens table.

    Pairs with the PasswordResetToken model. Safe to run on every startup.
    """
    try:
        async with engine.begin() as conn:
            await conn.execute(sa_text("""
                CREATE TABLE IF NOT EXISTS password_reset_tokens (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    token_hash VARCHAR(64) NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    expires_at TIMESTAMPTZ NOT NULL,
                    used_at TIMESTAMPTZ,
                    invalidated_at TIMESTAMPTZ
                )
            """))
            await conn.execute(
                sa_text(
                    "CREATE INDEX IF NOT EXISTS ix_password_reset_tokens_user_id "
                    "ON password_reset_tokens (user_id)"
                )
            )
            await conn.execute(
                sa_text(
                    "CREATE INDEX IF NOT EXISTS ix_password_reset_tokens_token_hash "
                    "ON password_reset_tokens (token_hash)"
                )
            )
            await conn.execute(
                sa_text(
                    "CREATE INDEX IF NOT EXISTS ix_password_reset_tokens_expires_at "
                    "ON password_reset_tokens (expires_at)"
                )
            )
    except Exception as e:  # noqa: BLE001
        # Don't crash startup for a migration problem — surface it loudly.
        print(f"ensure_password_reset_schema_columns failed: {e}")


def make_reset_url(base_url: str, token: str) -> str:
    """Build the absolute password-reset URL.

    Frontend route is /reset-password?token=...
    """
    return f"{base_url.rstrip('/')}/reset-password?token={token}"
