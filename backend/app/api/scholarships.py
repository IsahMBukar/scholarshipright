from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_
from typing import Optional, List
from datetime import date
from uuid import UUID

from app.db.session import get_db
from app.models.scholarship import Scholarship
from app.schemas.scholarship import ScholarshipResponse, ScholarshipListResponse

router = APIRouter()


@router.get("", response_model=ScholarshipListResponse)
async def list_scholarships(
    degree: Optional[str] = Query(None, description="Comma-separated degree levels"),
    field: Optional[str] = Query(None, description="Comma-separated fields of study"),
    country: Optional[str] = Query(None, description="Comma-separated host countries"),
    funding: Optional[str] = Query(None, description="Funding type: fully_funded, partial, stipend_only"),
    no_ielts: Optional[bool] = Query(None, description="Filter for scholarships without IELTS requirement"),
    no_fee: Optional[bool] = Query(None, description="Filter for scholarships without application fee"),
    deadline_before: Optional[date] = Query(None),
    deadline_after: Optional[date] = Query(None),
    search: Optional[str] = Query(None, description="Full-text search"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    sort: str = Query("deadline_asc", description="Sort: deadline_asc, newest"),
    db: AsyncSession = Depends(get_db),
):
    query = select(Scholarship).where(Scholarship.is_active == True)

    # Filters
    if degree:
        degrees = [d.strip() for d in degree.split(",")]
        query = query.where(Scholarship.degree_levels.overlap(degrees))

    if field:
        fields = [f.strip() for f in field.split(",")]
        query = query.where(Scholarship.fields_of_study.overlap(fields))

    if country:
        countries = [c.strip() for c in country.split(",")]
        query = query.where(Scholarship.host_country.ilike_any(countries))

    if funding:
        query = query.where(Scholarship.funding_type == funding)

    if no_ielts:
        query = query.where(Scholarship.requires_ielts == False)

    if no_fee:
        query = query.where(Scholarship.requires_application_fee == False)

    if deadline_before:
        query = query.where(Scholarship.deadline <= deadline_before)

    if deadline_after:
        query = query.where(Scholarship.deadline >= deadline_after)

    if search:
        search_filter = or_(
            Scholarship.name.ilike(f"%{search}%"),
            Scholarship.description.ilike(f"%{search}%"),
            Scholarship.provider.ilike(f"%{search}%"),
            Scholarship.host_institution.ilike(f"%{search}%"),
        )
        query = query.where(search_filter)

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar()

    # Sort
    if sort == "deadline_asc":
        query = query.order_by(Scholarship.deadline.asc())
    elif sort == "newest":
        query = query.order_by(Scholarship.created_at.desc())
    else:
        query = query.order_by(Scholarship.deadline.asc())

    # Paginate
    offset = (page - 1) * limit
    query = query.offset(offset).limit(limit)

    result = await db.execute(query)
    scholarships = result.scalars().all()

    return ScholarshipListResponse(
        items=[ScholarshipResponse.model_validate(s) for s in scholarships],
        total=total,
        page=page,
        limit=limit,
        pages=(total + limit - 1) // limit,
    )


@router.get("/featured", response_model=List[ScholarshipResponse])
async def featured_scholarships(db: AsyncSession = Depends(get_db)):
    query = (
        select(Scholarship)
        .where(Scholarship.is_active == True, Scholarship.is_verified == True)
        .order_by(Scholarship.view_count.desc())
        .limit(6)
    )
    result = await db.execute(query)
    return [ScholarshipResponse.model_validate(s) for s in result.scalars().all()]


@router.get("/{slug}", response_model=ScholarshipResponse)
async def get_scholarship(slug: str, db: AsyncSession = Depends(get_db)):
    query = select(Scholarship).where(Scholarship.slug == slug)
    result = await db.execute(query)
    scholarship = result.scalar_one_or_none()
    if not scholarship:
        raise HTTPException(status_code=404, detail="Scholarship not found")

    # Increment view count
    scholarship.view_count = (scholarship.view_count or 0) + 1
    await db.commit()

    return ScholarshipResponse.model_validate(scholarship)
