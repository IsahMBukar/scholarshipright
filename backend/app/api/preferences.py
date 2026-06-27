from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.db.session import get_db
from app.models.user import User
from app.api.users import get_current_user
from app.models.notification_preference import get_or_create_preferences

router = APIRouter()


class PreferenceResponse(BaseModel):
    email_new_matches: bool
    email_match_improvements: bool
    email_deadline_reminders: bool
    email_weekly_digest: bool
    email_marketing: bool

    class Config:
        from_attributes = True


class PreferenceUpdate(BaseModel):
    email_new_matches: Optional[bool] = None
    email_match_improvements: Optional[bool] = None
    email_deadline_reminders: Optional[bool] = None
    email_weekly_digest: Optional[bool] = None
    email_marketing: Optional[bool] = None


@router.get("", response_model=PreferenceResponse)
async def get_preferences(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the current user's notification preferences. Creates defaults if none exist."""
    prefs = await get_or_create_preferences(db, user.id)
    return PreferenceResponse.model_validate(prefs)


@router.put("", response_model=PreferenceResponse)
async def update_preferences(
    body: PreferenceUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update notification preferences. Partial updates — only send the fields you want to change."""
    prefs = await get_or_create_preferences(db, user.id)

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(prefs, field, value)

    await db.commit()
    await db.refresh(prefs)
    return PreferenceResponse.model_validate(prefs)
