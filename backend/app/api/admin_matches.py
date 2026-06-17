"""Admin/operator hooks for match-score invalidation.

These endpoints are guarded by a shared header token (`MATCH_ADMIN_TOKEN` env var)
so seed/ETL jobs can invalidate caches after they bulk-update scholarships.
There is no auth system today; a token is the simplest way to keep the
operator knob out of the user-facing API surface.
"""
from __future__ import annotations

import os
from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, status
from pydantic import BaseModel

from app.services.match_auto import (
    REASON_SCHOLARSHIP_DATA_CHANGED,
    mark_all_users_dirty,
    trigger_global_invalidate,
)


router = APIRouter(prefix="/api/admin/matches", tags=["admin"])


class InvalidateResponse(BaseModel):
    marked_dirty: int
    reason: str


def _require_admin_token(token: str | None) -> None:
    expected = os.getenv("MATCH_ADMIN_TOKEN", "").strip()
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="MATCH_ADMIN_TOKEN is not configured on the server.",
        )
    if not token or token.strip() != expected:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid admin token.")


@router.post("/invalidate-all", response_model=InvalidateResponse)
async def invalidate_all_matches(
    background_tasks: BackgroundTasks,
    x_admin_token: str | None = Header(default=None, alias="X-Admin-Token"),
) -> InvalidateResponse:
    """Mark every user's match scores as stale.

    Call this after bulk scholarship updates, seed scripts, or any other
    action that changes the corpus of scholarships a user could match against.
    """
    _require_admin_token(x_admin_token)

    # Use the shared helper so the same path runs from CLI and HTTP.
    trigger_global_invalidate(reason=REASON_SCHOLARSHIP_DATA_CHANGED, background_tasks=background_tasks)
    # Also do a synchronous count so the operator can see the effect.
    marked = await mark_all_users_dirty(reason=REASON_SCHOLARSHIP_DATA_CHANGED)
    return InvalidateResponse(marked_dirty=marked, reason=REASON_SCHOLARSHIP_DATA_CHANGED)
