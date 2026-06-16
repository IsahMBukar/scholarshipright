"""
Admin invite — magic-link tokens for inviting new admins / support staff.

Schema:
    admin_invites(
        id uuid pk,
        email varchar(255) not null,         -- invitee email
        admin_role varchar(20) not null,     -- 'super_admin' or 'support_staff'
        token_hash varchar(64) not null,     -- SHA256 of the token (never store raw)
        invited_by uuid fk -> users.id,      -- super_admin who sent it
        invited_by_email varchar(255),       -- denormalized for display
        note text,                            -- optional message from inviter
        created_at timestamptz default now(),
        expires_at timestamptz not null,     -- 7 days
        accepted_at timestamptz,             -- null until accepted
        accepted_by uuid fk -> users.id,     -- the user who accepted (may differ from invitee if email alias)
        revoked_at timestamptz,              -- super_admin can revoke
        revoked_by uuid fk -> users.id
    )

The raw token is generated once, returned in the create-invite response,
hashed and stored, and embedded in the magic link URL. After acceptance
or revocation the row remains for audit; we never delete invite history.
"""
import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import Column, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import text as sa_text

from app.db.session import Base, engine


INVITE_TTL_DAYS = 7


def hash_token(token: str) -> str:
    """SHA256 hex of a token — we never store the raw token."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_token() -> str:
    """URL-safe 32-byte random token."""
    return secrets.token_urlsafe(32)


class AdminInvite(Base):
    __tablename__ = "admin_invites"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), nullable=False, index=True)
    admin_role = Column(String(20), nullable=False)
    token_hash = Column(String(64), nullable=False, index=True)
    invited_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    invited_by_email = Column(String(255), nullable=True)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    accepted_at = Column(DateTime(timezone=True), nullable=True)
    accepted_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    revoked_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


async def ensure_invites_schema_columns() -> None:
    """Idempotent runtime migration for the admin_invites table.

    Pairs with the AdminInvite model. Safe to run on every startup.
    """
    try:
        async with engine.begin() as conn:
            await conn.execute(sa_text("""
                CREATE TABLE IF NOT EXISTS admin_invites (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    email VARCHAR(255) NOT NULL,
                    admin_role VARCHAR(20) NOT NULL,
                    token_hash VARCHAR(64) NOT NULL,
                    invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
                    invited_by_email VARCHAR(255),
                    note TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    expires_at TIMESTAMPTZ NOT NULL,
                    accepted_at TIMESTAMPTZ,
                    accepted_by UUID REFERENCES users(id) ON DELETE SET NULL,
                    revoked_at TIMESTAMPTZ,
                    revoked_by UUID REFERENCES users(id) ON DELETE SET NULL
                )
            """))
            await conn.execute(sa_text("CREATE INDEX IF NOT EXISTS ix_admin_invites_email ON admin_invites (email)"))
            await conn.execute(sa_text("CREATE INDEX IF NOT EXISTS ix_admin_invites_token_hash ON admin_invites (token_hash)"))
            await conn.execute(sa_text("CREATE INDEX IF NOT EXISTS ix_admin_invites_created_at ON admin_invites (created_at DESC)"))
    except Exception as e:  # noqa: BLE001
        from app.core.admin import logger  # late import to avoid circular
        logger.exception("ensure_invites_schema_columns failed: %s", e)


def make_invite_url(base_url: str, token: str) -> str:
    """Build the absolute magic-link URL.

    The frontend route is /admin/accept-invite?token=...  (added in Phase 2/3).
    For now the route handler accepts the token at the API too, so the URL
    works even before the frontend page exists.
    """
    return f"{base_url.rstrip('/')}/admin/accept-invite?token={token}"
