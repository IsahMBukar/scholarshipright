"""Unsubscribe API — no auth required.

Endpoints:
    GET  /api/unsubscribe/verify?token=...  → returns user info + category
    POST /api/unsubscribe                   → processes unsubscribe (token-based)
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from uuid import UUID

from app.db.session import get_db
from app.models.user import User
from app.models.notification_preference import NotificationPreference, get_or_create_preferences
from app.services.unsubscribe import (
    verify_unsubscribe_token,
    generate_unsubscribe_token,
    CATEGORY_MAP,
    ALL_CATEGORIES,
)

router = APIRouter()

# ── Category display names ──────────────────────────────────────────
CATEGORY_LABELS = {
    "new_matches": "New match alerts",
    "match_improvements": "Match improvement alerts",
    "deadline_reminders": "Deadline reminders",
    "weekly_digest": "Weekly digest",
    "marketing": "Product updates",
    "all": "All emails",
}


class VerifyResponse(BaseModel):
    valid: bool
    email: Optional[str] = None
    category: Optional[str] = None
    category_label: Optional[str] = None


class UnsubscribeRequest(BaseModel):
    token: str
    scope: str = "single"  # "single" or "all"


class UnsubscribeResponse(BaseModel):
    success: bool
    message: str


@router.get("/verify", response_model=VerifyResponse)
async def verify_token(
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Verify an unsubscribe token and return user info."""
    result = verify_unsubscribe_token(token)
    if not result:
        return VerifyResponse(valid=False)

    user_id, category = result
    user = (await db.execute(
        select(User).where(User.id == UUID(user_id))
    )).scalar_one_or_none()

    if not user:
        return VerifyResponse(valid=False)

    return VerifyResponse(
        valid=True,
        email=user.email,
        category=category,
        category_label=CATEGORY_LABELS.get(category, category),
    )


@router.post("", response_model=UnsubscribeResponse)
async def process_unsubscribe(
    body: UnsubscribeRequest,
    db: AsyncSession = Depends(get_db),
):
    """Process an unsubscribe request. No auth required — token proves ownership."""
    result = verify_unsubscribe_token(body.token)
    if not result:
        raise HTTPException(status_code=400, detail="Invalid or expired token")

    user_id, category = result
    user = (await db.execute(
        select(User).where(User.id == UUID(user_id))
    )).scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    prefs = await get_or_create_preferences(db, user.id)

    if body.scope == "all":
        # Unsubscribe from everything
        for col in CATEGORY_MAP.values():
            setattr(prefs, col, False)
        message = "You've been unsubscribed from all emails."
    else:
        # Unsubscribe from single category
        if category == "all":
            for col in CATEGORY_MAP.values():
                setattr(prefs, col, False)
            message = "You've been unsubscribed from all emails."
        else:
            col_name = CATEGORY_MAP.get(category)
            if col_name:
                setattr(prefs, col_name, False)
                label = CATEGORY_LABELS.get(category, category)
                message = f"You've been unsubscribed from {label.lower()}."
            else:
                raise HTTPException(status_code=400, detail="Invalid category")

    await db.commit()
    return UnsubscribeResponse(success=True, message=message)


# ── Generate unsubscribe link helper (used by email service) ────────

def make_unsubscribe_url(user_id: str, category: str) -> str:
    """Build the full unsubscribe URL for embedding in emails."""
    from app.core.config import get_settings
    frontend_url = get_settings().frontend_url
    token = generate_unsubscribe_token(user_id, category)
    return f"{frontend_url}/unsubscribe?token={token}&category={category}"
