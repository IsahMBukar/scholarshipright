"""
MCP security middleware — dual auth (API key + OAuth), rate limiting, request logging.

Every MCP request must include:
  Authorization: Bearer ***

The middleware:
1. Tries API key validation against mcp_api_keys table
2. If API key fails and OAuth is enabled, validates OAuth JWT token
3. Checks rate limit (per-key, DB-backed)
4. Logs the request to mcp_request_log table
5. Returns an auth record with identity + scopes

Usage:
    from app.mcp.security import require_mcp_auth, McpAuthRecord

    @router.post("/mcp/sse")
    async def mcp_endpoint(request: Request, auth: McpAuthRecord = Depends(require_mcp_auth)):
        # auth.name, auth.id, auth.auth_method, auth.scopes are available
        ...
"""
import json
import logging
import time
from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select, func, text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db, engine
from app.mcp.auth import McpApiKey, hash_key
from app.mcp.oauth import (
    is_oauth_enabled,
    validate_oauth_token,
    get_token_scopes,
    get_www_authenticate_header,
)

logger = logging.getLogger("scholarshipright.mcp_security")


class McpAuthRecord:
    """Validated MCP auth info passed to handlers.

    Supports both API key and OAuth authentication.
    For OAuth, id is the token's "sub" claim and name is "client_id".
    For API keys, id and name come from the mcp_api_keys table.
    """

    def __init__(
        self,
        id,
        name: str,
        auth_method: str,
        scopes: list[str] | None = None,
        rate_limit_per_hour: int = 20,
        key_prefix: str = "",
        oauth_claims: dict | None = None,
    ):
        self.id = id
        self.name = name
        self.auth_method = auth_method  # "api_key" or "oauth"
        self.scopes = scopes or []
        self.rate_limit_per_hour = rate_limit_per_hour
        self.key_prefix = key_prefix
        self.oauth_claims = oauth_claims or {}

    def has_scope(self, scope: str) -> bool:
        """Check if this auth record has a specific scope.

        API keys always have full access (backward compat).
        OAuth tokens must explicitly carry the scope.
        """
        if self.auth_method == "api_key":
            return True
        return scope in self.scopes



async def require_mcp_auth(request: Request, db: AsyncSession = Depends(get_db)) -> McpAuthRecord:
    """FastAPI dependency — validates MCP auth from Authorization header.

    Tries API key first, then OAuth if enabled.
    Raises 401 if both fail, 429 if rate limited.
    """
    # Extract token from Authorization header
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Missing Authorization header. Use: Authorization: Bearer ***",
            headers={"WWW-Authenticate": get_www_authenticate_header()} if is_oauth_enabled() else {},
        )

    raw_token = auth_header[7:].strip()
    if not raw_token:
        raise HTTPException(status_code=401, detail="Empty bearer token")

    # --- Try 1: API key validation (existing flow) ---
    key_hash = hash_key(raw_token)
    result = await db.execute(
        select(McpApiKey).where(
            McpApiKey.key_hash == key_hash,
            McpApiKey.is_active == True,  # noqa: E712
        )
    )
    key_record = result.scalar_one_or_none()

    if key_record:
        # API key auth succeeded
        rate_ok = await _check_rate_limit(db, key_record)
        if not rate_ok:
            logger.warning("MCP rate limit exceeded: key=%s name=%s", key_record.id, key_record.name)
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded ({key_record.rate_limit_per_hour} requests/hour)",
            )
        key_record.last_used_at = datetime.now(timezone.utc)
        await db.commit()

        return McpAuthRecord(
            id=key_record.id,
            name=key_record.name,
            auth_method="api_key",
            rate_limit_per_hour=key_record.rate_limit_per_hour,
            key_prefix=key_record.key_prefix,
        )

    # --- Try 2: OAuth JWT validation (if enabled) ---
    if is_oauth_enabled():
        claims = await validate_oauth_token(raw_token)
        if claims:
            scopes = get_token_scopes(claims)
            logger.info(
                "MCP OAuth auth: sub=%s client=%s scopes=%s",
                claims.get("sub", "?"),
                claims.get("client_id", claims.get("azp", "?")),
                scopes,
            )
            return McpAuthRecord(
                id=claims.get("sub", "unknown"),
                name=claims.get("client_id", claims.get("azp", "oauth-client")),
                auth_method="oauth",
                scopes=scopes,
                oauth_claims=claims,
            )

    # Both failed
    logger.warning("MCP auth failed: invalid token prefix=%s", raw_token[:8])
    raise HTTPException(
        status_code=401,
        detail="Invalid or revoked API key / OAuth token",
        headers={"WWW-Authenticate": get_www_authenticate_header()} if is_oauth_enabled() else {},
    )



async def _check_rate_limit(db: AsyncSession, key: McpApiKey) -> bool:
    """Check if the key has exceeded its hourly rate limit.

    Uses a simple counter in the database (works without Redis).
    Returns True if request is allowed, False if rate limited.
    """
    try:
        # Count requests in the last hour for this key
        one_hour_ago = datetime.now(timezone.utc).timestamp() - 3600

        result = await db.execute(
            sa_text("""
                SELECT COUNT(*) FROM mcp_request_log
                WHERE key_id = :key_id
                AND created_at > to_timestamp(:since)
            """),
            {"key_id": str(key.id), "since": one_hour_ago}
        )
        count = result.scalar() or 0

        if count >= key.rate_limit_per_hour:
            return False

        return True

    except Exception as e:
        # Fail-closed: if rate limit check fails, deny the request
        logger.error("Rate limit check failed (denying request): %s", e)
        return False


async def log_mcp_request(
    db: AsyncSession,
    key_id,
    tool_name: str,
    arguments: dict,
    ip_address: str,
    user_agent: str,
    success: bool = True,
    error_message: Optional[str] = None,
    auth_method: str = "api_key",
    auth_identity: Optional[str] = None,
) -> None:
    """Log an MCP tool call to the request log table.

    key_id is only valid for API key auth (FK to mcp_api_keys).
    auth_identity stores the OAuth email/client_id or stdio label.
    """
    try:
        actual_key_id = str(key_id) if auth_method == "api_key" and key_id else None
        await db.execute(
            sa_text("""
                INSERT INTO mcp_request_log (key_id, tool_name, arguments, ip_address, user_agent, success, error_message, auth_identity)
                VALUES (:key_id, :tool_name, :arguments, :ip_address, :user_agent, :success, :error_message, :auth_identity)
            """),
            {
                "key_id": actual_key_id,
                "tool_name": tool_name,
                "arguments": json.dumps(arguments) if isinstance(arguments, dict) else json.dumps({}),
                "ip_address": ip_address,
                "user_agent": user_agent,
                "success": success,
                "error_message": error_message,
                "auth_identity": auth_identity,
            }
        )
        await db.commit()
    except Exception as e:
        logger.warning("Failed to log MCP request: %s", e)


async def ensure_mcp_security_tables() -> None:
    """Create the mcp_request_log table (idempotent)."""
    try:
        async with engine.begin() as conn:
            await conn.execute(sa_text("""
                CREATE TABLE IF NOT EXISTS mcp_request_log (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    key_id UUID REFERENCES mcp_api_keys(id) ON DELETE SET NULL,
                    tool_name VARCHAR(128) NOT NULL,
                    arguments JSONB,
                    ip_address VARCHAR(45),
                    user_agent VARCHAR(512),
                    success BOOLEAN DEFAULT true,
                    error_message TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )
            """))
            await conn.execute(sa_text(
                "CREATE INDEX IF NOT EXISTS ix_mcp_request_log_key_id ON mcp_request_log (key_id)"
            ))
            await conn.execute(sa_text(
                "CREATE INDEX IF NOT EXISTS ix_mcp_request_log_created_at ON mcp_request_log (created_at DESC)"
            ))
            # Add auth_identity column for OAuth/stdio requests (idempotent)
            await conn.execute(sa_text(
                "ALTER TABLE mcp_request_log ADD COLUMN IF NOT EXISTS auth_identity VARCHAR(256)"
            ))
    except Exception:
        logger.exception("ensure_mcp_security_tables failed")
