from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID

from app.db.session import get_db
from app.models.saved_scholarship import SavedScholarship
from app.api.users import get_current_user
from app.models.user import User

router = APIRouter()


@router.get("")
async def list_reminders(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(SavedScholarship).where(
        SavedScholarship.user_id == user.id,
        SavedScholarship.reminder_enabled == True,
    )
    result = await db.execute(query)
    saved = result.scalars().all()
    return [{"scholarship_id": str(s.scholarship_id), "status": s.status} for s in saved]


@router.post("/{saved_id}")
async def enable_reminder(
    saved_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(SavedScholarship).where(
        SavedScholarship.id == saved_id,
        SavedScholarship.user_id == user.id,
    )
    result = await db.execute(query)
    saved = result.scalar_one_or_none()
    if not saved:
        raise HTTPException(status_code=404, detail="Saved scholarship not found")

    saved.reminder_enabled = True
    await db.commit()
    return {"status": "reminder_enabled"}


@router.delete("/{saved_id}")
async def disable_reminder(
    saved_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(SavedScholarship).where(
        SavedScholarship.id == saved_id,
        SavedScholarship.user_id == user.id,
    )
    result = await db.execute(query)
    saved = result.scalar_one_or_none()
    if not saved:
        raise HTTPException(status_code=404, detail="Saved scholarship not found")

    saved.reminder_enabled = False
    await db.commit()
    return {"status": "reminder_disabled"}
