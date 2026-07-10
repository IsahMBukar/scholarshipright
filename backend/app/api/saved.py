from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional
from uuid import UUID

from app.db.session import get_db
from app.models.saved_scholarship import SavedScholarship
from app.models.scholarship import Scholarship
from app.schemas.saved_scholarship import SavedScholarshipCreate, SavedScholarshipUpdate, SavedScholarshipResponse
from app.api.users import get_current_user
from app.models.user import User
from app.core.rate_limit import saved_write_rate_limit

router = APIRouter()

VALID_STATUSES = {"saved", "applying", "applied", "reviewing", "rejected", "accepted"}


@router.get("", response_model=List[SavedScholarshipResponse])
async def list_saved(
    status: Optional[str] = Query(None, description="Filter by status"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(SavedScholarship, Scholarship)
        .join(Scholarship, SavedScholarship.scholarship_id == Scholarship.id)
        .where(SavedScholarship.user_id == user.id)
    )

    if status:
        statuses = [s.strip() for s in status.split(",")]
        query = query.where(SavedScholarship.status.in_(statuses))

    query = query.order_by(SavedScholarship.created_at.desc())
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


@router.get("/stats")
async def get_stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get application status counts."""
    result = await db.execute(
        select(SavedScholarship.status, func.count())
        .where(SavedScholarship.user_id == user.id)
        .group_by(SavedScholarship.status)
    )
    counts = {row[0]: row[1] for row in result.all()}

    return {
        "total": sum(counts.values()),
        "saved": counts.get("saved", 0),
        "applying": counts.get("applying", 0),
        "applied": counts.get("applied", 0),
        "reviewing": counts.get("reviewing", 0),
        "accepted": counts.get("accepted", 0),
        "rejected": counts.get("rejected", 0),
    }


@router.post("/{scholarship_id}", response_model=SavedScholarshipResponse)
async def save_scholarship(
    scholarship_id: UUID,
    _rate: None = Depends(saved_write_rate_limit),
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
    _rate: None = Depends(saved_write_rate_limit),
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

    update_dict = update_data.model_dump(exclude_unset=True)

    # Validate status
    if "status" in update_dict and update_dict["status"] not in VALID_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Must be one of: {', '.join(VALID_STATUSES)}"
        )

    for field, value in update_dict.items():
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
    _rate: None = Depends(saved_write_rate_limit),
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
