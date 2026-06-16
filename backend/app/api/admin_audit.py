"""
Admin API: Audit log read.

GET /api/admin/audit — paginated, filterable list of admin_audit_log entries.

Every write performed by any admin route is logged here, so this is the
single source of truth for "what did the admins do lately". Read-only.
"""
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.admin import require_admin
from app.db.session import get_db
from app.models.admin_audit import AdminAuditLog
from app.models.user import User
from app.schemas.admin import AdminAuditEntry, PaginatedResponse

router = APIRouter()


@router.get("/audit", response_model=PaginatedResponse)
async def list_audit(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    action: Optional[str] = Query(None, description="e.g. 'user.update'"),
    target_type: Optional[str] = Query(None, description="e.g. 'user', 'scholarship'"),
    admin_id: Optional[UUID] = Query(None, description="Filter by admin who performed the action"),
    since: Optional[datetime] = Query(None, description="Only entries after this ISO timestamp"),
    until: Optional[datetime] = Query(None, description="Only entries before this ISO timestamp"),
):
    query = select(AdminAuditLog)
    if action:
        query = query.where(AdminAuditLog.action == action)
    if target_type:
        query = query.where(AdminAuditLog.target_type == target_type)
    if admin_id:
        query = query.where(AdminAuditLog.admin_id == admin_id)
    if since:
        query = query.where(AdminAuditLog.created_at >= since)
    if until:
        query = query.where(AdminAuditLog.created_at <= until)

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one() or 0
    rows = (await db.execute(
        query.order_by(AdminAuditLog.created_at.desc())
        .offset((page - 1) * limit).limit(limit)
    )).scalars().all()
    pages = (total + limit - 1) // limit if limit else 0

    return PaginatedResponse(
        items=[AdminAuditEntry.model_validate(r).model_dump(mode="json") for r in rows],
        total=int(total),
        page=page,
        limit=limit,
        pages=int(pages),
    )
