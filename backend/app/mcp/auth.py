"""
MCP API key management.

Stores agent API keys in the database. Each key has a name, optional
rate limit, and can be revoked. Keys are hashed before storage (SHA-256).

Schema:
    mcp_api_keys(
        id uuid pk,
        name varchar(128) NOT NULL,       -- human-readable label
        key_hash varchar(64) NOT NULL,     -- SHA-256 of the raw key
        key_prefix varchar(8) NOT NULL,    -- first 8 chars for display (sk-xxxx...)
        is_active boolean DEFAULT true,
        rate_limit_per_hour int DEFAULT 20,
        created_at timestamptz,
        last_used_at timestamptz,
        revoked_at timestamptz
    )
"""
import hashlib
import secrets
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Column, String, DateTime, Boolean, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy import text as sa_text, select

from app.db.session import Base, engine


class McpApiKey(Base):
    __tablename__ = "mcp_api_keys"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(128), nullable=False)
    key_hash = Column(String(64), nullable=False, unique=True, index=True)
    key_prefix = Column(String(8), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    rate_limit_per_hour = Column(Integer, default=20, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True)


def hash_key(raw_key: str) -> str:
    """SHA-256 hash of the raw API key."""
    return hashlib.sha256(raw_key.encode()).hexdigest()


def generate_key() -> tuple[str, str]:
    """Generate a new API key. Returns (raw_key, key_hash).

    The raw_key is shown to the user ONCE. The hash is stored.
    """
    raw_key = f"mcp-{secrets.token_hex(24)}"
    return raw_key, hash_key(raw_key)


async def ensure_mcp_api_keys_table() -> None:
    """Idempotent runtime migration."""
    try:
        async with engine.begin() as conn:
            await conn.execute(sa_text("""
                CREATE TABLE IF NOT EXISTS mcp_api_keys (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    name VARCHAR(128) NOT NULL,
                    key_hash VARCHAR(64) NOT NULL UNIQUE,
                    key_prefix VARCHAR(8) NOT NULL,
                    is_active BOOLEAN NOT NULL DEFAULT true,
                    rate_limit_per_hour INT NOT NULL DEFAULT 20,
                    created_at TIMESTAMPTZ DEFAULT now(),
                    last_used_at TIMESTAMPTZ,
                    revoked_at TIMESTAMPTZ
                )
            """))
            await conn.execute(sa_text("CREATE INDEX IF NOT EXISTS ix_mcp_api_keys_key_hash ON mcp_api_keys (key_hash)"))
    except Exception:
        import logging
        logging.getLogger("scholarshipright.startup").exception("ensure_mcp_api_keys_table failed")


async def validate_key(raw_key: str, db_session) -> Optional[McpApiKey]:
    """Validate a raw API key. Returns the McpApiKey record or None."""
    key_hash = hash_key(raw_key)
    result = await db_session.execute(
        select(McpApiKey).where(
            McpApiKey.key_hash == key_hash,
            McpApiKey.is_active == True,  # noqa: E712
        )
    )
    key_record = result.scalar_one_or_none()
    if key_record:
        key_record.last_used_at = datetime.now(timezone.utc)
        await db_session.commit()
    return key_record
