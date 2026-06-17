from fastapi import APIRouter, Depends, Query, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from typing import Optional, List
from datetime import date
from uuid import UUID

from app.db.session import get_db
from app.models.scholarship import Scholarship
from app.models.match_score import MatchScore
from app.schemas.scholarship import ScholarshipResponse, ScholarshipListResponse
from app.api.users import COOKIE_NAME
from app.api.auth import decode_token

router = APIRouter()


async def _optional_user_id(request: Request) -> Optional[UUID]:
    """Return logged-in user id from cookie when present; keep public scholarship pages public."""
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return None
    user_id = decode_token(token)
    if not user_id:
        return None
    try:
        return UUID(user_id)
    except ValueError:
        return None


def _scholarship_response(scholarship: Scholarship, match_score: Optional[float] = None, match_breakdown: Optional[dict] = None) -> ScholarshipResponse:
    data = ScholarshipResponse.model_validate(scholarship).model_dump()
    data["match_score"] = float(match_score) if match_score is not None else None
    data["match_breakdown"] = match_breakdown
    return ScholarshipResponse.model_validate(data)


@router.get("", response_model=ScholarshipListResponse)
async def list_scholarships(
    request: Request,
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
    user_id = await _optional_user_id(request)
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

    match_subq = None
    if user_id:
        match_subq = (
            select(MatchScore.scholarship_id, MatchScore.score, MatchScore.breakdown)
            .where(MatchScore.user_id == user_id)
            .subquery()
        )
        query = query.add_columns(match_subq.c.score, match_subq.c.breakdown).outerjoin(
            match_subq, match_subq.c.scholarship_id == Scholarship.id
        )

    # Sort. The Scholarships page is labelled Recommended, so authenticated users
    # should see the same persisted MatchScore ordering the agent uses.
    if sort == "newest":
        query = query.order_by(Scholarship.created_at.desc())
    elif user_id:
        query = query.order_by(match_subq.c.score.desc().nullslast(), Scholarship.deadline.asc())
    else:
        query = query.order_by(Scholarship.deadline.asc())

    # Paginate
    offset = (page - 1) * limit
    query = query.offset(offset).limit(limit)

    result = await db.execute(query)
    rows = result.all()

    if user_id:
        items = [_scholarship_response(s, score, breakdown) for s, score, breakdown in rows]
    else:
        items = [ScholarshipResponse.model_validate(row[0]) for row in rows]

    return ScholarshipListResponse(
        items=items,
        total=total,
        page=page,
        limit=limit,
        pages=(total + limit - 1) // limit,
    )


@router.get("/featured", response_model=List[ScholarshipResponse])
async def featured_scholarships(request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _optional_user_id(request)
    query = select(Scholarship)
    match_subq = None
    if user_id:
        match_subq = (
            select(MatchScore.scholarship_id, MatchScore.score, MatchScore.breakdown)
            .where(MatchScore.user_id == user_id)
            .subquery()
        )
        query = query.add_columns(match_subq.c.score, match_subq.c.breakdown).outerjoin(
            match_subq, match_subq.c.scholarship_id == Scholarship.id
        )

    query = (
        query
        .where(Scholarship.is_active == True, Scholarship.is_verified == True)
        .limit(6)
    )
    if user_id:
        query = query.order_by(match_subq.c.score.desc().nullslast(), Scholarship.view_count.desc())
    else:
        query = query.order_by(Scholarship.view_count.desc())

    result = await db.execute(query)
    rows = result.all()
    if user_id:
        return [_scholarship_response(s, score, breakdown) for s, score, breakdown in rows]
    return [ScholarshipResponse.model_validate(row[0]) for row in rows]


@router.get("/{slug}", response_model=ScholarshipResponse)
async def get_scholarship(slug: str, request: Request, db: AsyncSession = Depends(get_db)):
    query = select(Scholarship).where(Scholarship.slug == slug)
    result = await db.execute(query)
    scholarship = result.scalar_one_or_none()
    if not scholarship:
        raise HTTPException(status_code=404, detail="Scholarship not found")

    # Increment view count
    scholarship.view_count = (scholarship.view_count or 0) + 1
    await db.commit()

    user_id = await _optional_user_id(request)
    if user_id:
        ms_result = await db.execute(
            select(MatchScore.score, MatchScore.breakdown).where(
                MatchScore.user_id == user_id,
                MatchScore.scholarship_id == scholarship.id,
            )
        )
        match = ms_result.first()
        if match:
            return _scholarship_response(scholarship, match.score, match.breakdown)

    return ScholarshipResponse.model_validate(scholarship)
