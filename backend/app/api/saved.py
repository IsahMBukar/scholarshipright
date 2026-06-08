from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from uuid import UUID

from app.db.session import get_db
from app.models.saved_scholarship import SavedScholarship
from app.models.scholarship import Scholarship
from app.schemas.saved_scholarship import SavedScholarshipCreate, SavedScholarshipUpdate, SavedScholarshipResponse
from app.api.users import get_current_user
from app.models.user import User

router = APIRouter()


@router.get("", response_model=List[SavedScholarshipResponse])
async def list_saved(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(SavedScholarship, Scholarship)
        .join(Scholarship, SavedScholarship.scholarship_id == Scholarship.id)
        .where(SavedScholarship.user_id == user.id)
        .order_by(SavedScholarship.created_at.desc())
    )
    result = await db.execute(query)
    rows = result.all()

    return [
        SavedScholarshipResponse(
            id=ss.id,
            user_id=ss.user_id,
            scholarship_id=ss.scholarship_id,
            status=ss.status,
            notes=ss.notes,
            reminder_enabled=ss.reminder_enabled,
            created_at=ss.created_at,
            scholarship_name=s.name,
            scholarship_deadline=str(s.deadline) if s.deadline else None,
            scholarship_host_country=s.host_country,
            scholarship_funding_type=s.funding_type,
        )
        for ss, s in rows
    ]


@router.post("/{scholarship_id}", response_model=SavedScholarshipResponse)
async def save_scholarship(
    scholarship_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Check if already saved
    existing = await db.execute(
        select(SavedScholarship).where(
            SavedScholarship.user_id == user.id,
            SavedScholarship.scholarship_id == scholarship_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Scholarship already saved")

    saved = SavedScholarship(user_id=user.id, scholarship_id=scholarship_id)
    db.add(saved)
    await db.commit()
    await db.refresh(saved)

    # Fetch scholarship data
    sch = await db.execute(select(Scholarship).where(Scholarship.id == scholarship_id))
    s = sch.scalar_one()

    return SavedScholarshipResponse(
        id=saved.id,
        user_id=saved.user_id,
        scholarship_id=saved.scholarship_id,
        status=saved.status,
        notes=saved.notes,
        reminder_enabled=saved.reminder_enabled,
        created_at=saved.created_at,
        scholarship_name=s.name,
        scholarship_deadline=str(s.deadline) if s.deadline else None,
        scholarship_host_country=s.host_country,
        scholarship_funding_type=s.funding_type,
    )


@router.put("/{scholarship_id}", response_model=SavedScholarshipResponse)
async def update_saved(
    scholarship_id: UUID,
    update_data: SavedScholarshipUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(SavedScholarship).where(
        SavedScholarship.user_id == user.id,
        SavedScholarship.scholarship_id == scholarship_id,
    )
    result = await db.execute(query)
    saved = result.scalar_one_or_none()
    if not saved:
        raise HTTPException(status_code=404, detail="Saved scholarship not found")

    for field, value in update_data.model_dump(exclude_unset=True).items():
        setattr(saved, field, value)

    await db.commit()
    await db.refresh(saved)

    sch = await db.execute(select(Scholarship).where(Scholarship.id == scholarship_id))
    s = sch.scalar_one()

    return SavedScholarshipResponse(
        id=saved.id,
        user_id=saved.user_id,
        scholarship_id=saved.scholarship_id,
        status=saved.status,
        notes=saved.notes,
        reminder_enabled=saved.reminder_enabled,
        created_at=saved.created_at,
        scholarship_name=s.name,
        scholarship_deadline=str(s.deadline) if s.deadline else None,
        scholarship_host_country=s.host_country,
        scholarship_funding_type=s.funding_type,
    )


@router.delete("/{scholarship_id}")
async def delete_saved(
    scholarship_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(SavedScholarship).where(
        SavedScholarship.user_id == user.id,
        SavedScholarship.scholarship_id == scholarship_id,
    )
    result = await db.execute(query)
    saved = result.scalar_one_or_none()
    if not saved:
        raise HTTPException(status_code=404, detail="Saved scholarship not found")

    await db.delete(saved)
    await db.commit()
    return {"status": "deleted"}
