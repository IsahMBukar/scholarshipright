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
from app.services.document_defaults import apply_auto_defaults
from app.api.users import COOKIE_NAME
from app.api.auth import decode_token
from app.models.user import User
from app.services.match_auto import recompute_matches_for_user, REASON_MANUAL

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
    # Materialise the 5 "cement + flexible" doc-defaults fields +
    # accepted_english_tests before validation. Without this, legacy
    # rows (or freshly-created rows from the admin POST path that
    # skipped the lazy backfill) would surface as NULL and fail
    # ScholarshipResponse's strict pydantic schema with 500s.
    apply_auto_defaults(scholarship)
    data = ScholarshipResponse.model_validate(scholarship).model_dump()
    data["match_score"] = float(match_score) if match_score is not None else None
    data["match_breakdown"] = match_breakdown
    return ScholarshipResponse.model_validate(data)


@router.get("", response_model=ScholarshipListResponse)
async def list_scholarships(
    request: Request,
    degree: Optional[str] = Query(None, description="Comma-separated degree levels (bachelor, master, phd, other)"),
    field: Optional[str] = Query(None, description="Comma-separated fields of study"),
    country: Optional[str] = Query(None, description="Comma-separated host countries"),
    funding: Optional[str] = Query(None, description="Funding type: fully_funded, partial, stipend_only"),
    language_test: Optional[str] = Query(None, description="Comma-separated English tests (IELTS, TOEFL, PTE, Duolingo, Cambridge)"),
    verified: Optional[bool] = Query(None, description="Only verified scholarships"),
    min_stipend: Optional[int] = Query(None, ge=0, description="Minimum monthly stipend in USD"),
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

    # Safety net: if logged-in user has 0 match_scores, recompute on the fly.
    # This catches cases where the background trigger didn't execute (e.g.
    # orphaned BackgroundTasks, race condition, or server restart mid-flow).
    if user_id:
        from sqlalchemy import func as _func
        ms_count = (await db.execute(
            select(_func.count()).select_from(MatchScore).where(MatchScore.user_id == user_id)
        )).scalar() or 0
        if ms_count == 0:
            await recompute_matches_for_user(user_id, reason=REASON_MANUAL)
            await db.commit()

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

    if language_test:
        tests = [t.strip() for t in language_test.split(",") if t.strip()]
        if tests:
            # Overlap: returns rows where accepted_english_tests shares at
            # least one element with the requested set. Backed by the GIN
            # index added in ensure_scholarship_schema_columns().
            query = query.where(Scholarship.accepted_english_tests.overlap(tests))

    if verified is not None:
        query = query.where(Scholarship.is_verified == verified)

    if min_stipend is not None:
        # NULL monthly_stipend_usd is excluded by SQL three-valued logic,
        # so scholarships without a recorded stipend don't match a min.
        query = query.where(Scholarship.monthly_stipend_usd >= min_stipend)

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
        items = []
        for row in rows:
            sch = row[0]
            apply_auto_defaults(sch)
            items.append(ScholarshipResponse.model_validate(sch))

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


@router.get("/filters/metadata")
async def filter_metadata(db: AsyncSession = Depends(get_db)):
    """Single source of truth for the frontend FilterPanel.

    Returns the list of currently-filterable values derived from the
    scholarships table (so the UI only ever shows values that have
    data) plus the static filter labels (English tests, funding
    types, degree classes) that don't change with data.
    """
    # Distinct host countries, sorted
    country_rows = await db.execute(
        select(Scholarship.host_country)
        .distinct()
        .order_by(Scholarship.host_country)
    )
    countries = [r[0] for r in country_rows.all() if r[0]]

    # Distinct fields of study — unnest the array, distinct, sort
    field_rows = await db.execute(
        select(func.unnest(Scholarship.fields_of_study))
        .distinct()
        .order_by(func.unnest(Scholarship.fields_of_study))
    )
    fields = [r[0] for r in field_rows.all() if r[0]]

    # Distinct degree levels — unnest the array, distinct, sort
    degree_rows = await db.execute(
        select(func.unnest(Scholarship.degree_levels))
        .distinct()
        .order_by(func.unnest(Scholarship.degree_levels))
    )
    degrees = [r[0] for r in degree_rows.all() if r[0]]

    # Distinct funding types actually present
    funding_rows = await db.execute(
        select(Scholarship.funding_type)
        .distinct()
        .order_by(Scholarship.funding_type)
    )
    funding_types = [r[0] for r in funding_rows.all() if r[0]]

    return {
        "countries": countries,
        "fields": fields,
        "degrees": degrees,
        "funding_types": funding_types,
        # Static lists — the filter supports these values even if no
        # scholarships currently use them, so the user can still see
        # the option and discover the gap.
        "english_tests": ["IELTS", "TOEFL", "PTE", "Duolingo", "Cambridge"],
        "degree_labels": {
            "bachelor": "BSc / Bachelor",
            "master": "MSc / Master",
            "phd": "PhD",
            "other": "Other",
        },
        "funding_labels": {
            "fully_funded": "Fully funded",
            "partial": "Partial funding",
            "stipend_only": "Stipend only",
        },
    }


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
        # Safety net: recompute if user has 0 match_scores
        from sqlalchemy import func as _func
        ms_count = (await db.execute(
            select(_func.count()).select_from(MatchScore).where(MatchScore.user_id == user_id)
        )).scalar() or 0
        if ms_count == 0:
            await recompute_matches_for_user(user_id, reason=REASON_MANUAL)
            await db.commit()

        ms_result = await db.execute(
            select(MatchScore.score, MatchScore.breakdown).where(
                MatchScore.user_id == user_id,
                MatchScore.scholarship_id == scholarship.id,
            )
        )
        match = ms_result.first()
        if match:
            return _scholarship_response(scholarship, match.score, match.breakdown)

    # Materialise the 5 "cement + flexible" fields from degree_levels
    # so the public response never has nulls for those.
    apply_auto_defaults(scholarship)
    return ScholarshipResponse.model_validate(scholarship)
