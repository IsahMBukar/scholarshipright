from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID

from app.db.session import get_db
from app.models.profile import Profile
from app.models.user import User
from app.schemas.profile import ProfileCreate, ProfileUpdate, ProfileResponse
from app.services.match_auto import (
    REASON_PROFILE_UPDATED,
    trigger_recompute,
)

router = APIRouter()

COOKIE_NAME = "sr_token"


async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)) -> User:
    """Get current user from JWT cookie."""
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Not logged in")

    # Decode JWT
    from app.api.auth import decode_token
    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    try:
        uid = UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid user session")

    result = await db.execute(select(User).where(User.id == uid))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


@router.get("", response_model=ProfileResponse)
async def get_profile(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Profile).where(Profile.user_id == user.id)
    result = await db.execute(query)
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found. Complete onboarding first.")
    return ProfileResponse.model_validate(profile)


@router.post("", response_model=ProfileResponse)
async def create_or_update_profile(
    profile_data: ProfileCreate,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Profile).where(Profile.user_id == user.id)
    result = await db.execute(query)
    profile = result.scalar_one_or_none()

    if profile:
        for field, value in profile_data.model_dump(exclude_unset=True).items():
            setattr(profile, field, value)
    else:
        profile = Profile(user_id=user.id, **profile_data.model_dump())
        db.add(profile)

    await db.commit()
    await db.refresh(profile)

    # Profile fields feed the match engine — recompute in the background so
    # the user sees their new matches next time they hit /api/matches.
    trigger_recompute(user.id, REASON_PROFILE_UPDATED, background_tasks)

    return ProfileResponse.model_validate(profile)
