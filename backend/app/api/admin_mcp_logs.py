"""
Admin API: MCP request logs.

GET /api/admin/mcp/logs          — paginated request log
GET /api/admin/mcp/logs/stats    — request stats (by tool, by key)
"""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.admin import require_admin
from app.db.session import get_db
from app.models.user import User
from app.schemas.admin import PaginatedResponse

from pydantic import BaseModel
from datetime import datetime
from typing import List, Dict, Any

import logging

router = APIRouter(prefix="/mcp", tags=["admin"])
logger = logging.getLogger("scholara.admin.mcp")


class McpLogEntry(BaseModel):
    id: str
    key_id: Optional[str] = None
    key_name: Optional[str] = None
    auth_identity: Optional[str] = None
    tool_name: str
    arguments: Optional[Dict[str, Any]] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    success: bool
    error_message: Optional[str] = None
    created_at: datetime


class McpLogStats(BaseModel):
    total_requests: int
    successful: int
    failed: int
    by_tool: Dict[str, int]
    by_key: Dict[str, int]


@router.get("/logs")
async def list_mcp_logs(
    key_id: Optional[str] = Query(None, description="Filter by API key ID"),
    tool_name: Optional[str] = Query(None, description="Filter by tool name"),
    success: Optional[bool] = Query(None, description="Filter by success/failure"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Paginated MCP request logs."""
    try:
        # Base query with join to get key name
        base = """
            SELECT l.id, l.key_id, k.name as key_name, l.auth_identity, l.tool_name, l.arguments,
                   l.ip_address, l.user_agent, l.success, l.error_message, l.created_at
            FROM mcp_request_log l
            LEFT JOIN mcp_api_keys k ON l.key_id = k.id
            WHERE 1=1
        """
        count_base = "SELECT COUNT(*) FROM mcp_request_log l WHERE 1=1"
        params: dict = {}

        if key_id:
            base += " AND l.key_id = :key_id"
            count_base += " AND l.key_id = :key_id"
            params["key_id"] = key_id
        if tool_name:
            base += " AND l.tool_name = :tool_name"
            count_base += " AND l.tool_name = :tool_name"
            params["tool_name"] = tool_name
        if success is not None:
            base += " AND l.success = :success"
            count_base += " AND l.success = :success"
            params["success"] = success

        # Count
        total = (await db.execute(sa_text(count_base), params)).scalar() or 0
        pages = max(1, (total + limit - 1) // limit)

        # Fetch page
        offset = (page - 1) * limit
        query = f"{base} ORDER BY l.created_at DESC LIMIT :limit OFFSET :offset"
        params["limit"] = limit
        params["offset"] = offset

        result = await db.execute(sa_text(query), params)
        rows = result.mappings().all()

        items = [
            McpLogEntry(
                id=str(r["id"]),
                key_id=str(r["key_id"]) if r["key_id"] else None,
                key_name=r["key_name"],
                auth_identity=r["auth_identity"],
                tool_name=r["tool_name"],
                arguments=r["arguments"] if isinstance(r["arguments"], dict) else None,
                ip_address=r["ip_address"],
                user_agent=r["user_agent"],
                success=r["success"],
                error_message=r["error_message"],
                created_at=r["created_at"],
            )
            for r in rows
        ]

        return {"items": items, "total": total, "page": page, "limit": limit, "pages": pages}

    except Exception as e:
        logger.error("Failed to fetch MCP logs: %s", e)
        return {"items": [], "total": 0, "page": 1, "limit": limit, "pages": 1}


@router.get("/logs/stats")
async def get_mcp_log_stats(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """MCP request stats — by tool and by key."""
    try:
        # Total counts
        total = (await db.execute(
            sa_text("SELECT COUNT(*) FROM mcp_request_log")
        )).scalar() or 0

        successful = (await db.execute(
            sa_text("SELECT COUNT(*) FROM mcp_request_log WHERE success = true")
        )).scalar() or 0

        # By tool
        tool_rows = (await db.execute(
            sa_text("SELECT tool_name, COUNT(*) as cnt FROM mcp_request_log GROUP BY tool_name ORDER BY cnt DESC")
        )).mappings().all()
        by_tool = {r["tool_name"]: r["cnt"] for r in tool_rows}

        # By key
        key_rows = (await db.execute(
            sa_text("""
                SELECT COALESCE(k.name, 'Unknown') as name, COUNT(*) as cnt
                FROM mcp_request_log l
                LEFT JOIN mcp_api_keys k ON l.key_id = k.id
                GROUP BY k.name ORDER BY cnt DESC
            """)
        )).mappings().all()
        by_key = {r["name"]: r["cnt"] for r in key_rows}

        return {
            "total_requests": total,
            "successful": successful,
            "failed": total - successful,
            "by_tool": by_tool,
            "by_key": by_key,
        }

    except Exception as e:
        logger.error("Failed to fetch MCP stats: %s", e)
        return {"total_requests": 0, "successful": 0, "failed": 0, "by_tool": {}, "by_key": {}}
