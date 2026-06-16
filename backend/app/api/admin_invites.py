"""
Admin API: Invites (magic-link onboarding for new admins / support staff).

Two routers in this module:

- admin_invites_router (mounted at /api/admin):
    POST   /api/admin/invites                — create invite (super_admin only)
    GET    /api/admin/invites                — list invites (any admin)
    DELETE /api/admin/invites/{id}           — revoke invite (super_admin only)

- accept_invite_router (mounted at /api/auth):
    POST   /api/auth/accept-invite           — accept invite, create/promote user, set cookie

They're split because they live under different URL spaces.
"""
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.admin import require_admin, require_super_admin
from app.db.session import get_db
from app.models.user import User
from app.schemas.admin import (
    AdminInviteCreate,
    AdminInviteListEntry,
    AdminInviteResponse,
    PaginatedResponse,
)
from app.services import admin_invites
from app.services.admin_audit import log_admin_action
from app.api.auth import COOKIE_MAX_AGE, COOKIE_NAME, create_token

admin_invites_router = APIRouter()
accept_invite_router = APIRouter()


# ── Create (super_admin only) ─────────────────────────────────────


@admin_invites_router.post("/invites", response_model=AdminInviteResponse, status_code=201)
async def create_invite_endpoint(
    body: AdminInviteCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    try:
        invite, raw_token = await admin_invites.create_invite(
            db,
            email=body.email,
            admin_role=body.admin_role,
            invited_by_user=admin,
            note=body.note,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=422,
            detail={"code": "invalid_invite", "user_message": str(e), "retryable": False},
        )

    # Audit (separate from the email log)
    from app.services.admin_invites import make_invite_url
    import os
    base_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
    url = make_invite_url(base_url, raw_token)
    await log_admin_action(
        db,
        admin_id=admin.id,
        admin_email=admin.email,
        action="invite.create",
        target_type="invite",
        target_id=str(invite.id),
        payload={
            "invited_email": invite.email,
            "admin_role": invite.admin_role,
            "expires_at": invite.expires_at.isoformat() if invite.expires_at else None,
            "note": invite.note,
        },
    )
    await db.commit()

    return AdminInviteResponse(
        id=invite.id,
        email=invite.email,
        admin_role=invite.admin_role,
        invite_url=url,
        expires_at=invite.expires_at,
        created_at=invite.created_at,
    )


# ── List ───────────────────────────────────────────────────────────


@admin_invites_router.get("/invites", response_model=PaginatedResponse)
async def list_invites_endpoint(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    include_accepted: bool = Query(False),
    include_revoked: bool = Query(False),
):
    rows, total = await admin_invites.list_invites(
        db,
        page=page,
        limit=limit,
        include_accepted=include_accepted,
        include_revoked=include_revoked,
    )
    pages = (total + limit - 1) // limit if limit else 0
    return PaginatedResponse(
        items=[AdminInviteListEntry.model_validate(r).model_dump(mode="json") for r in rows],
        total=total,
        page=page,
        limit=limit,
        pages=pages,
    )


# ── Revoke (super_admin only) ─────────────────────────────────────


@admin_invites_router.delete("/invites/{invite_id}")
async def revoke_invite_endpoint(
    invite_id: UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    inv = await admin_invites.revoke_invite(db, invite_id=invite_id, revoked_by_user=admin)
    if not inv:
        raise HTTPException(
            status_code=404,
            detail={"code": "invite_not_found", "user_message": "Invite not found."},
        )
    await log_admin_action(
        db,
        admin_id=admin.id,
        admin_email=admin.email,
        action="invite.revoke",
        target_type="invite",
        target_id=str(inv.id),
        payload={"email": inv.email, "admin_role": inv.admin_role},
    )
    await db.commit()
    return {"revoked": True, "id": str(inv.id), "email": inv.email}


# ── Accept (public, gated by the token) ───────────────────────────


class AcceptInviteRequest(BaseModel):
    token: str
    full_name: Optional[str] = None


@accept_invite_router.post("/accept-invite")
async def accept_invite_endpoint(
    body: AcceptInviteRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """Accept a magic-link invite. Sets the auth cookie on success.

    Public endpoint (no admin auth) — the token IS the credential.
    """
    user, invite, status = await admin_invites.accept_invite(
        db, raw_token=body.token, full_name=body.full_name
    )
    if status != "accepted" or not user or not invite:
        # 410 Gone for accepted/revoked/expired; 404 for not_found
        code_map = {
            "expired": ("invite_expired", "This invite has expired. Ask for a new one.", 410),
            "revoked": ("invite_revoked", "This invite was revoked.", 410),
            "already_accepted": ("invite_accepted", "This invite has already been accepted.", 410),
            "not_found": ("invite_not_found", "Invite not found or invalid.", 404),
        }
        code, msg, http = code_map[status]
        raise HTTPException(
            status_code=http,
            detail={"code": code, "user_message": msg, "retryable": False},
        )

    # Set auth cookie so the user is now logged in
    token = create_token(str(user.id))
    response.set_cookie(
        key=COOKIE_NAME, value=token,
        httponly=True, samesite="lax", max_age=COOKIE_MAX_AGE,
    )
    return {
        "accepted": True,
        "user": {
            "id": str(user.id),
            "email": user.email,
            "full_name": user.full_name,
            "is_admin": user.is_admin,
            "admin_role": user.admin_role,
        },
        "invite": {
            "id": str(invite.id),
            "email": invite.email,
            "admin_role": invite.admin_role,
            "accepted_at": invite.accepted_at.isoformat() if invite.accepted_at else None,
        },
    }
