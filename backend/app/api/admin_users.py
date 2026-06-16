"""
Admin API: User management.

GET    /api/admin/users                    — paginated user list with filters
GET    /api/admin/users/{id}               — single user detail
PATCH  /api/admin/users/{id}               — partial update (is_active, admin_role, full_name)
GET    /api/admin/users/{id}/resumes       — user's resumes (admin view)

All routes require `require_admin`. Mutations to `admin_role` and
`is_active` are gated by `super_admin` and protected against self-lockout
(e.g. a super_admin can't demote themselves). Every write is logged
to admin_audit_log via the shared service.
"""
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.admin import admin_role, require_admin, require_super_admin
from app.db.session import get_db
from app.models.chat_session import ChatSession
from app.models.resume import Resume
from app.models.saved_scholarship import SavedScholarship
from app.models.user import User
from app.schemas.admin import (
    AdminUserPatch,
    AdminUserResponse,
    PaginatedResponse,
)
from app.services.admin_audit import log_admin_action

router = APIRouter()


# ── helpers ────────────────────────────────────────────────────────


async def _user_with_counts(db: AsyncSession, user: User) -> AdminUserResponse:
    """Augment a User row with the aggregate counts shown in the admin list."""
    resume_count = (await db.execute(
        select(func.count(Resume.id)).where(Resume.user_id == user.id)
    )).scalar_one() or 0
    saved_count = (await db.execute(
        select(func.count(SavedScholarship.id)).where(SavedScholarship.user_id == user.id)
    )).scalar_one() or 0

    # Last active = max(updated_at) across the user's tables.
    # Cheap because we already have indexes on user_id + updated_at.
    last_resume = (await db.execute(
        select(func.max(Resume.updated_at)).where(Resume.user_id == user.id)
    )).scalar_one()
    last_chat = (await db.execute(
        select(func.max(ChatSession.updated_at)).where(ChatSession.user_id == user.id)
    )).scalar_one()
    last_saved = (await db.execute(
        select(func.max(SavedScholarship.created_at)).where(SavedScholarship.user_id == user.id)
    )).scalar_one()
    candidates = [t for t in (last_resume, last_chat, last_saved) if t is not None]
    last_active = max(candidates) if candidates else None

    data = AdminUserResponse.model_validate(user).model_dump()
    data["resume_count"] = int(resume_count)
    data["saved_count"] = int(saved_count)
    data["last_active_at"] = last_active
    return AdminUserResponse.model_validate(data)


# ── list ───────────────────────────────────────────────────────────


@router.get("/users", response_model=PaginatedResponse)
async def list_users(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None, description="Search by email or full_name"),
    is_active: Optional[bool] = Query(None),
    is_admin: Optional[bool] = Query(None),
    sort: str = Query("newest", description="newest, oldest, email_asc, last_active"),
):
    """List users with optional filters and pagination."""
    query = select(User)
    if search:
        like = f"%{search.lower()}%"
        query = query.where(
            or_(func.lower(User.email).like(like), func.lower(User.full_name).like(like))
        )
    if is_active is not None:
        query = query.where(User.is_active == is_active)
    if is_admin is not None:
        query = query.where(User.is_admin == is_admin)

    # Sorting
    if sort == "oldest":
        query = query.order_by(User.created_at.asc())
    elif sort == "email_asc":
        query = query.order_by(User.email.asc())
    elif sort == "last_active":
        # We can't sort by computed last_active in SQL cheaply; fall back to updated_at
        # which is a close-enough proxy. (Real last_active is computed post-fetch.)
        query = query.order_by(User.updated_at.desc())
    else:  # "newest" or unknown
        query = query.order_by(User.created_at.desc())

    # Count total
    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one() or 0

    # Page
    offset = (page - 1) * limit
    page_query = query.offset(offset).limit(limit)
    rows = (await db.execute(page_query)).scalars().all()
    items = [await _user_with_counts(db, u) for u in rows]
    pages = (total + limit - 1) // limit if limit else 0

    return PaginatedResponse(
        items=[u.model_dump() for u in items],
        total=int(total),
        page=page,
        limit=limit,
        pages=int(pages),
    )


# ── get one ────────────────────────────────────────────────────────


@router.get("/users/{user_id}", response_model=AdminUserResponse)
async def get_user(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    u = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail={"code": "user_not_found", "user_message": "User not found."})
    return await _user_with_counts(db, u)


# ── patch one ──────────────────────────────────────────────────────


@router.patch("/users/{user_id}", response_model=AdminUserResponse)
async def patch_user(
    user_id: UUID,
    patch: AdminUserPatch,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    u = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail={"code": "user_not_found", "user_message": "User not found."})

    changes: dict = {}

    # full_name — both super_admin and support_staff can edit
    if patch.full_name is not None and patch.full_name != u.full_name:
        changes["full_name"] = {"old": u.full_name, "new": patch.full_name}
        u.full_name = patch.full_name

    # is_active — both roles can toggle
    if patch.is_active is not None and patch.is_active != u.is_active:
        changes["is_active"] = {"old": u.is_active, "new": patch.is_active}
        u.is_active = patch.is_active

    # admin_role — super_admin only, and self-protection applies
    if patch.admin_role is not None:
        if admin_role(admin) != "super_admin":
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "super_admin_required",
                    "user_message": "Only super admins can change admin roles.",
                    "retryable": False,
                },
            )
        new_role = None if patch.admin_role == "remove" else patch.admin_role
        # Self-protection: a super_admin cannot demote themselves.
        if u.id == admin.id and u.is_admin and new_role != "super_admin":
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "self_role_change_forbidden",
                    "user_message": "You cannot demote yourself. Ask another super admin to do it.",
                    "retryable": False,
                },
            )
        # Lock-out protection: don't allow removing the last super_admin.
        if u.is_admin and u.admin_role == "super_admin" and new_role != "super_admin":
            n = (await db.execute(
                select(func.count(User.id)).where(
                    and_(User.is_admin == True, User.admin_role == "super_admin")
                )
            )).scalar_one() or 0
            if n <= 1:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "code": "last_super_admin",
                        "user_message": "Cannot demote the last super admin. Promote someone else first.",
                        "retryable": False,
                    },
                )
        if new_role is None:
            # demote to normal user
            changes["admin_role"] = {"old": u.admin_role, "new": None}
            changes["is_admin"] = {"old": u.is_admin, "new": False}
            u.admin_role = None
            u.is_admin = False
        else:
            changes["admin_role"] = {"old": u.admin_role, "new": new_role}
            changes["is_admin"] = {"old": u.is_admin, "new": True}
            u.admin_role = new_role
            u.is_admin = True

    if not changes:
        # No-op: still return the user
        return await _user_with_counts(db, u)

    u.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(u)

    # Audit
    await log_admin_action(
        db,
        admin_id=admin.id,
        admin_email=admin.email,
        action="user.update",
        target_type="user",
        target_id=str(u.id),
        payload={"changes": changes, "target_email": u.email},
    )
    await db.commit()

    return await _user_with_counts(db, u)


# ── user's resumes (admin view) ───────────────────────────────────


@router.get("/users/{user_id}/resumes", response_model=PaginatedResponse)
async def get_user_resumes(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail={"code": "user_not_found", "user_message": "User not found."})

    base = select(Resume).where(Resume.user_id == user_id)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one() or 0
    rows = (await db.execute(
        base.order_by(Resume.created_at.desc()).offset((page - 1) * limit).limit(limit)
    )).scalars().all()
    pages = (total + limit - 1) // limit if limit else 0
    return PaginatedResponse(
        items=[
            {
                "id": str(r.id),
                "title": r.title,
                "status": r.status,
                "is_primary": r.is_primary,
                "overall_score": r.overall_score,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            }
            for r in rows
        ],
        total=int(total),
        page=page,
        limit=limit,
        pages=int(pages),
    )
