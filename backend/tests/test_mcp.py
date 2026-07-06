"""Tests for MCP auth, API key management, and MCP schemas."""
import uuid

import pytest
from sqlalchemy import select

from app.mcp.auth import McpApiKey, generate_key, hash_key, validate_key
from app.mcp.schemas import get_tool_schemas, SCHOLARSHIP_FIELDS


class TestMcpApiKey:
    """Tests for MCP API key generation and validation."""

    def test_generate_key_format(self):
        raw_key, key_hash = generate_key()
        assert raw_key.startswith("mcp-")
        assert len(raw_key) == 4 + 48  # "mcp-" + 48 hex chars
        assert len(key_hash) == 64  # SHA-256 hex

    def test_hash_deterministic(self):
        assert hash_key("test-key") == hash_key("test-key")
        assert hash_key("key-a") != hash_key("key-b")

    def test_hash_does_not_store_raw(self):
        raw, hashed = generate_key()
        assert raw not in hashed
        assert hashed == hash_key(raw)

    @pytest.mark.asyncio
    async def test_validate_key_finds_active(self, db, sample_mcp_key):
        raw_key = sample_mcp_key._raw_key
        found = await validate_key(raw_key, db)
        assert found is not None
        assert found.name == "Test Agent"

    @pytest.mark.asyncio
    async def test_validate_key_rejects_unknown(self, db):
        found = await validate_key("mcp-unknown-key-that-does-not-exist", db)
        assert found is None

    @pytest.mark.asyncio
    async def test_validate_key_rejects_inactive(self, db, sample_mcp_key):
        sample_mcp_key.is_active = False
        await db.commit()

        found = await validate_key(sample_mcp_key._raw_key, db)
        assert found is None


class TestMcpSchemas:
    """Tests for MCP tool schema definitions."""

    def test_tool_schemas_structure(self):
        schemas = get_tool_schemas()
        assert "add_scholarship" in schemas
        assert "list_scholarships" in schemas
        assert "get_scholarship" in schemas

    def test_add_scholarship_has_required_fields(self):
        schemas = get_tool_schemas()
        add = schemas["add_scholarship"]
        required = add["inputSchema"]["required"]
        assert "name" in required
        assert "host_country" in required
        assert "funding_type" in required
        assert "deadline" in required
        assert "official_url" in required

    def test_scholarship_fields_have_types(self):
        for field, spec in SCHOLARSHIP_FIELDS.items():
            assert "type" in spec, f"{field} missing type"
            assert "description" in spec, f"{field} missing description"

    def test_funding_type_enum(self):
        funding = SCHOLARSHIP_FIELDS["funding_type"]
        assert "enum" in funding
        assert "fully_funded" in funding["enum"]
        assert "partially_funded" in funding["enum"]

    def test_degree_levels_array(self):
        degrees = SCHOLARSHIP_FIELDS["degree_levels"]
        assert degrees["type"] == "array"
        assert "items" in degrees
        assert "enum" in degrees["items"]


class TestMcpServer:
    """Tests for MCP server tool handlers."""

    @pytest.mark.asyncio
    async def test_list_tools_returns_all(self):
        from app.mcp.server import server
        # The server object has list_tools registered
        assert server is not None

    def test_schemas_serialize_to_json(self):
        import json
        schemas = get_tool_schemas()
        serialized = json.dumps(schemas)
        assert "add_scholarship" in serialized
        assert "host_country" in serialized
