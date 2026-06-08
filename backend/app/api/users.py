from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID

from app.db.session import get_db
from app.models.profile import Profile
from app.models.user import User
from app.schemas.profile import ProfileCreate, ProfileUpdate, ProfileResponse

router = APIRouter()

DEV_COOKIE_NAME = "sr_dev_user"


async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)) -> User:
    """Get current user from dev cookie."""
    user_id = request.cookies.get(DEV_COOKIE_NAME)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not logged in. Call POST /api/auth/dev-login first.")

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
    return ProfileResponse.model_validate(profile)
