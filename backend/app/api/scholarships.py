from fastapi import APIRouter, Depends, Query, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_, update, case
from typing import Optional, List
from datetime import date
from uuid import UUID

from app.core.rate_limit import scholarship_view_rate_limit
import hashlib
import json

from app.db.session import get_db
from app.models.scholarship import Scholarship
from app.models.match_score import MatchScore
from app.schemas.scholarship import ScholarshipResponse, ScholarshipListResponse
from app.schemas.admin import DegreeDocResponse
from app.services.document_defaults import apply_auto_defaults
from app.api.users import COOKIE_NAME
from app.api.auth import decode_token
from app.models.user import User
from app.services.match_auto import recompute_matches_for_user, REASON_MANUAL
from app.core.cache import cache_get, cache_set, cache_invalidate, CacheKeys, invalidate_scholarship_caches

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
    apply_auto_defaults(scholarship)
    data = ScholarshipResponse.model_validate(scholarship).model_dump()
    data["match_score"] = float(match_score) if match_score is not None else None
    data["match_breakdown"] = match_breakdown
    return ScholarshipResponse.model_validate(data)


def _cache_key_for_list(params: dict) -> str:
    """Build a stable cache key from query params (excluding user-specific data)."""
    # Remove user-specific and pagination-stable keys
    stable = {k: v for k, v in sorted(params.items()) if v is not None}
    raw = json.dumps(stable, sort_keys=True, default=str)
    h = hashlib.md5(raw.encode()).hexdigest()[:12]
    return f"anon:{h}"


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

    # ── Cache: anonymous users (no match scores) ──────────────────
    # Authenticated users get personalised results (match scores), so
    # we only cache the anonymous path. This covers SEO bots, landing
    # page loads, and unauthenticated browsing.
    if not user_id:
        cache_key = CacheKeys.scholarship_list(_cache_key_for_list({
            "degree": degree, "field": field, "country": country,
            "funding": funding, "language_test": language_test,
            "verified": verified, "min_stipend": min_stipend,
            "no_ielts": no_ielts, "no_fee": no_fee,
            "deadline_before": str(deadline_before) if deadline_before else None,
            "deadline_after": str(deadline_after) if deadline_after else None,
            "search": search, "page": page, "limit": limit, "sort": sort,
        }))
        cached = await cache_get(cache_key)
        if cached is not None:
            return ScholarshipListResponse(**cached)

    query = select(Scholarship).where(Scholarship.is_active == True)

    # Safety net: if logged-in user has 0 match_scores, recompute on the fly.
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
            query = query.where(Scholarship.accepted_english_tests.overlap(tests))

    if verified is not None:
        query = query.where(Scholarship.is_verified == verified)

    if min_stipend is not None:
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
        safe = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        search_filter = or_(
            Scholarship.name.ilike(f"%{safe}%"),
            Scholarship.description.ilike(f"%{safe}%"),
            Scholarship.provider.ilike(f"%{safe}%"),
            Scholarship.host_institution.ilike(f"%{safe}%"),
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

    # Sort — active first, upcoming second, expired last
    today = date.today()
    status_flag = case(
        (Scholarship.deadline < today, 2),                          # expired
        (and_(Scholarship.open_date.isnot(None), Scholarship.open_date > today), 1),  # upcoming
        else_=0,                                                     # active (open)
    )
    if sort == "newest":
        query = query.order_by(status_flag, Scholarship.created_at.desc())
    elif user_id:
        query = query.order_by(status_flag, match_subq.c.score.desc().nullslast(), Scholarship.deadline.asc())
    else:
        query = query.order_by(status_flag, Scholarship.deadline.asc())

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

    response = ScholarshipListResponse(
        items=items,
        total=total,
        page=page,
        limit=limit,
        pages=(total + limit - 1) // limit,
    )

    # ── Cache: store anonymous result ─────────────────────────────
    if not user_id:
        await cache_set(cache_key, response.model_dump(), CacheKeys.SCHOLARSHIP_LIST_TTL)

    return response


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
        .where(Scholarship.is_active == True, Scholarship.is_verified == True, Scholarship.deadline >= date.today())
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
    # ── Cache: filter metadata changes rarely ─────────────────────
    cached = await cache_get(CacheKeys.FILTER_META)
    if cached is not None:
        return cached

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

    result = {
        "countries": countries,
        "fields": fields,
        "degrees": degrees,
        "funding_types": funding_types,
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

    await cache_set(CacheKeys.FILTER_META, result, CacheKeys.FILTER_META_TTL)
    return result


@router.get("/{slug}", response_model=ScholarshipResponse)
async def get_scholarship(slug: str, request: Request, db: AsyncSession = Depends(get_db)):
    # ── Cache: individual scholarship (anonymous) ─────────────────
    user_id = await _optional_user_id(request)

    if not user_id:
        cached = await cache_get(CacheKeys.scholarship_detail(slug))
        if cached is not None:
            return ScholarshipResponse.model_validate(cached)

    query = select(Scholarship).where(Scholarship.slug == slug)
    result = await db.execute(query)
    scholarship = result.scalar_one_or_none()
    if not scholarship:
        raise HTTPException(status_code=404, detail="Scholarship not found")

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
    apply_auto_defaults(scholarship)
    response = ScholarshipResponse.model_validate(scholarship)

    # Attach per-degree-level document overrides if any exist
    from app.models.scholarship_degree_document import ScholarshipDegreeDocument
    degree_docs = (
        await db.execute(
            select(ScholarshipDegreeDocument)
            .where(ScholarshipDegreeDocument.scholarship_id == scholarship.id)
            .order_by(ScholarshipDegreeDocument.degree_level)
        )
    ).scalars().all()
    if degree_docs:
        response.degree_documents = [
            DegreeDocResponse.model_validate(d).model_dump(mode="json")
            for d in degree_docs
        ]

    # Attach custom document requirements
    from app.models.scholarship_custom_document import ScholarshipCustomDocument
    from app.schemas.admin import CustomDocResponse
    custom_docs = (
        await db.execute(
            select(ScholarshipCustomDocument)
            .where(ScholarshipCustomDocument.scholarship_id == scholarship.id)
            .order_by(ScholarshipCustomDocument.position, ScholarshipCustomDocument.name)
        )
    ).scalars().all()
    if custom_docs:
        response.custom_documents = [
            CustomDocResponse.model_validate(d).model_dump(mode="json")
            for d in custom_docs
        ]

    # Cache the anonymous detail
    if not user_id:
        await cache_set(
            CacheKeys.scholarship_detail(slug),
            response.model_dump(),
            CacheKeys.SCHOLARSHIP_DETAIL_TTL,
        )

    return response


@router.post("/{slug}/view")
async def increment_view(
    slug: str,
    _rate: None = Depends(scholarship_view_rate_limit),
    db: AsyncSession = Depends(get_db),
):
    """Increment view count for a scholarship. Idempotent-safe POST."""
    query = select(Scholarship).where(Scholarship.slug == slug)
    result = await db.execute(query)
    scholarship = result.scalar_one_or_none()
    if not scholarship:
        raise HTTPException(status_code=404, detail="Scholarship not found")

    # Atomic SQL increment (avoids race condition)
    await db.execute(
        update(Scholarship).where(Scholarship.id == scholarship.id).values(view_count=Scholarship.view_count + 1)
    )
    await db.commit()

    # Re-fetch to get the incremented value
    await db.refresh(scholarship)
    return {"view_count": scholarship.view_count}
