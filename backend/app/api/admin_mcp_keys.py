"""
Admin API: MCP API key management.

POST   /api/admin/mcp/keys          — create a new API key
GET    /api/admin/mcp/keys          — list all keys
PATCH  /api/admin/mcp/keys/{id}     — update (name, rate limit, active)
DELETE /api/admin/mcp/keys/{id}     — revoke a key
"""
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.admin import require_admin
from app.db.session import get_db
from app.models.user import User
from app.mcp.auth import McpApiKey, generate_key, hash_key
from app.services.admin_audit import log_admin_action

from pydantic import BaseModel, Field


router = APIRouter(prefix="/mcp", tags=["admin"])


# ── Schemas ────────────────────────────────────────────────────────

class CreateKeyRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=128, description="Human-readable label")
    rate_limit_per_hour: int = Field(20, ge=1, le=1000)


class CreateKeyResponse(BaseModel):
    id: str
    name: str
    key: str  # Only shown ONCE — the raw key
    key_prefix: str
    rate_limit_per_hour: int
    created_at: str


class KeyListItem(BaseModel):
    id: str
    name: str
    key_prefix: str
    is_active: bool
    rate_limit_per_hour: int
    created_at: str
    last_used_at: Optional[str] = None
    revoked_at: Optional[str] = None

    class Config:
        from_attributes = True


class UpdateKeyRequest(BaseModel):
    name: Optional[str] = None
    rate_limit_per_hour: Optional[int] = None
    is_active: Optional[bool] = None


# ── Endpoints ──────────────────────────────────────────────────────

@router.post("/keys", response_model=CreateKeyResponse)
async def create_api_key(
    body: CreateKeyRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create a new MCP API key. The raw key is shown ONCE."""
    raw_key, key_hash = generate_key()

    key_record = McpApiKey(
        name=body.name,
        key_hash=key_hash,
        key_prefix=raw_key[:8],
        is_active=True,
        rate_limit_per_hour=body.rate_limit_per_hour,
    )
    db.add(key_record)
    await db.commit()
    await db.refresh(key_record)

    await log_admin_action(
        db, admin.id, admin.email, "mcp_key.create", "mcp_api_key", str(key_record.id),
        payload={"name": body.name}
    )

    return CreateKeyResponse(
        id=str(key_record.id),
        name=key_record.name,
        key=raw_key,
        key_prefix=key_record.key_prefix,
        rate_limit_per_hour=key_record.rate_limit_per_hour,
        created_at=key_record.created_at.isoformat() if key_record.created_at else "",
    )


@router.get("/keys")
async def list_api_keys(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List all MCP API keys (raw keys are never shown)."""
    result = await db.execute(
        select(McpApiKey).order_by(McpApiKey.created_at.desc())
    )
    keys = result.scalars().all()

    return {
        "items": [
            KeyListItem(
                id=str(k.id),
                name=k.name,
                key_prefix=k.key_prefix,
                is_active=k.is_active,
                rate_limit_per_hour=k.rate_limit_per_hour,
                created_at=k.created_at.isoformat() if k.created_at else "",
                last_used_at=k.last_used_at.isoformat() if k.last_used_at else None,
                revoked_at=k.revoked_at.isoformat() if k.revoked_at else None,
            )
            for k in keys
        ]
    }


@router.patch("/keys/{key_id}")
async def update_api_key(
    key_id: UUID,
    body: UpdateKeyRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update an API key (name, rate limit, active status)."""
    key_record = await db.get(McpApiKey, key_id)
    if not key_record:
        raise HTTPException(404, "API key not found")

    if body.name is not None:
        key_record.name = body.name
    if body.rate_limit_per_hour is not None:
        key_record.rate_limit_per_hour = body.rate_limit_per_hour
    if body.is_active is not None:
        key_record.is_active = body.is_active
        if not body.is_active:
            key_record.revoked_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(key_record)

    await log_admin_action(
        db, admin.id, admin.email, "mcp_key.update", "mcp_api_key", str(key_id),
        payload=body.model_dump(exclude_none=True)
    )

    return {"detail": "Updated"}


@router.delete("/keys/{key_id}")
async def revoke_api_key(
    key_id: UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Revoke (deactivate) an API key."""
    key_record = await db.get(McpApiKey, key_id)
    if not key_record:
        raise HTTPException(404, "API key not found")

    key_record.is_active = False
    key_record.revoked_at = datetime.now(timezone.utc)
    await db.commit()

    await log_admin_action(
        db, admin.id, admin.email, "mcp_key.revoke", "mcp_api_key", str(key_id)
    )

    return {"detail": "Revoked"}
