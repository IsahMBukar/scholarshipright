import uuid
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from sqlalchemy import Column, String, DateTime, Boolean
from sqlalchemy.dialects.postgresql import UUID
from app.db.session import Base

# Email confirmation token TTL (24 hours)
EMAIL_CONFIRM_TTL_HOURS = 24


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, nullable=False, index=True)
    full_name = Column(String, nullable=True)
    password_hash = Column(String, nullable=True)  # Null for magic-link users
    is_active = Column(Boolean, default=True)
    # Admin access. `is_admin=True` unlocks the /admin/* routes.
    # `admin_role` is one of: "super_admin" (full access), "support_staff"
    # (read all + edit scholarships/users, but no destructive ops).
    # NULL means "not an admin" (normal user).
    is_admin = Column(Boolean, default=False, nullable=False)
    admin_role = Column(String(20), nullable=True, index=True)
    # Auto-recompute signals for match scores. `match_dirty=True` means the next
    # match GET should (re)compute instead of returning the cached table.
    match_dirty = Column(Boolean, default=True, nullable=False)
    match_invalidated_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    # Email confirmation. `email_confirmed_at` is NULL until the user clicks
    # the confirmation link. `email_confirm_token_hash` stores SHA256 of the
    # raw token (never store raw). `email_confirm_expires_at` gates the token.
    email_confirmed_at = Column(DateTime(timezone=True), nullable=True)
    email_confirm_token_hash = Column(String(64), nullable=True, index=True)
    email_confirm_expires_at = Column(DateTime(timezone=True), nullable=True)
    # OAuth fields. `auth_provider` tracks how the user signed up ("local"
    # for email/password, "google" for Google OAuth). `google_id` stores
    # the Google subject ID for fast lookups on subsequent logins.
    auth_provider = Column(String(20), nullable=True, server_default="local")
    google_id = Column(String(64), nullable=True, unique=True, index=True)


def generate_email_confirm_token() -> str:
    """URL-safe 32-byte random token."""
    return secrets.token_urlsafe(32)


def hash_email_confirm_token(token: str) -> str:
    """SHA256 hex of a token."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def ensure_email_confirm_columns() -> None:
    """Idempotent runtime migration for email confirmation and OAuth columns."""
    from sqlalchemy import text as sa_text
    from app.db.session import engine
    try:
        async with engine.begin() as conn:
            await conn.execute(sa_text("""
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS email_confirmed_at TIMESTAMPTZ,
                ADD COLUMN IF NOT EXISTS email_confirm_token_hash VARCHAR(64),
                ADD COLUMN IF NOT EXISTS email_confirm_expires_at TIMESTAMPTZ,
                ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) DEFAULT 'local',
                ADD COLUMN IF NOT EXISTS google_id VARCHAR(64)
            """))
            await conn.execute(sa_text(
                "CREATE INDEX IF NOT EXISTS ix_users_email_confirm_token_hash "
                "ON users (email_confirm_token_hash) WHERE email_confirm_token_hash IS NOT NULL"
            ))
            await conn.execute(sa_text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_id "
                "ON users (google_id) WHERE google_id IS NOT NULL"
            ))
    except Exception as e:
        print(f"ensure_email_confirm_columns failed: {e}")
