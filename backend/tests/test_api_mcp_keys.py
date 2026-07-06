"""Tests for MCP API key management — DB-level only."""
import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.mcp.auth import McpApiKey, generate_key, hash_key


class TestMcpKeyModel:
    @pytest.mark.asyncio
    async def test_create_key(self, db):
        raw_key, key_hash = generate_key()
        key = McpApiKey(
            name="Test Key", key_hash=key_hash, key_prefix=raw_key[:8],
            is_active=True, rate_limit_per_hour=50,
        )
        db.add(key)
        await db.commit()
        result = await db.execute(select(McpApiKey).where(McpApiKey.name == "Test Key"))
        saved = result.scalar_one()
        assert saved.key_prefix == raw_key[:8]
        assert saved.rate_limit_per_hour == 50

    @pytest.mark.asyncio
    async def test_revoke_key(self, db):
        raw_key, key_hash = generate_key()
        key = McpApiKey(name="Revoke Test", key_hash=key_hash, key_prefix=raw_key[:8], is_active=True)
        db.add(key)
        await db.commit()
        key.is_active = False
        key.revoked_at = datetime.now(timezone.utc)
        await db.commit()
        result = await db.execute(select(McpApiKey).where(McpApiKey.id == key.id))
        assert result.scalar_one().is_active is False

    @pytest.mark.asyncio
    async def test_key_hash_unique(self, db):
        key_hash = hash_key("duplicate-key")
        db.add(McpApiKey(name="Key 1", key_hash=key_hash, key_prefix="mcp-xxxx"))
        await db.commit()
        db.add(McpApiKey(name="Key 2", key_hash=key_hash, key_prefix="mcp-yyyy"))
        with pytest.raises(IntegrityError):
            await db.commit()

    @pytest.mark.asyncio
    async def test_update_last_used(self, db):
        raw_key, key_hash = generate_key()
        key = McpApiKey(name="Usage Test", key_hash=key_hash, key_prefix=raw_key[:8])
        db.add(key)
        await db.commit()
        key.last_used_at = datetime.now(timezone.utc)
        await db.commit()
        result = await db.execute(select(McpApiKey).where(McpApiKey.id == key.id))
        assert result.scalar_one().last_used_at is not None
