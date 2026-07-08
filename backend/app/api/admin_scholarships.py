"""
Admin API: Scholarship management.

GET    /api/admin/scholarships                 — paginated list (includes inactive)
GET    /api/admin/scholarships/{id}            — full record
POST   /api/admin/scholarships                 — create new (both admin roles)
PATCH  /api/admin/scholarships/{id}            — edit any field (both admin roles)
DELETE /api/admin/scholarships/{id}            — HARD delete (super_admin only)

For soft-delete (deactivate), set is_active=false via PATCH.

Match-recompute side effects:
- POST  → mark all users dirty so the new scholarship appears in their next
          /api/matches read (and may trigger a `match_new` notif if ≥70%)
- PATCH that flips is_active from false→true → same as POST
- PATCH that changes other fields → no global invalidate (per-user recompute
  happens on their next /api/matches read; cached scores may be stale until then)
"""
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.admin import require_admin, require_super_admin
from app.db.session import get_db
from app.models.scholarship import Scholarship
from app.models.user import User
from app.schemas.admin import (
    AdminScholarshipCreate,
    AdminScholarshipPatch,
    AdminScholarshipResponse,
    PaginatedResponse,
    DegreeDocCreate,
    DegreeDocUpdate,
    DegreeDocResponse,
    CustomDocCreate,
    CustomDocUpdate,
    CustomDocResponse,
)
from app.services.admin_audit import log_admin_action
from app.services.document_defaults import apply_auto_defaults
from app.services.match_auto import trigger_scholarship_recompute
from app.services.eligibility import resolve_eligibility, resolve_all_scholarships

import logging

router = APIRouter()
logger = logging.getLogger("scholara.admin")

# Fields that accept date strings (ISO YYYY-MM-DD) in PATCH
_DATE_FIELDS = {"open_date", "deadline", "program_start_date"}
_DECIMAL_FIELDS = {"min_ielts_score", "min_cgpa"}

# Fields that can trigger a re-resolution of eligibility
_ELIGIBILITY_FIELDS = {
    "eligibility_display", "eligibility_basis",
    "included_groups", "included_countries",
    "excluded_groups", "excluded_countries",
}

# Fields that, when changed, invalidate cached match scores.
_MATCH_AFFECTING_FIELDS = {
    "name", "description", "benefits_summary", "how_to_apply",
    "fields_of_study", "degree_levels", "host_country", "host_institution",
    "provider", "funding_type", "eligible_nationalities", "eligible_regions",
    "requires_ielts", "min_ielts_score", "min_cgpa",
    "covers_tuition", "covers_living", "covers_flight", "covers_health",
    "deadline", "program_start_date",
    "accepted_english_tests", "language_of_instruction",
} | _ELIGIBILITY_FIELDS


async def _resolve_scholarship_eligibility(db: AsyncSession, sch: Scholarship) -> None:
    """Run the eligibility resolver on a scholarship and persist the results.

    Called after create and after any patch that touches eligibility fields.
    Does nothing if the scholarship has no structured eligibility data (all
    arrays empty + no display text).
    """
    inc_groups = list(sch.included_groups or [])
    inc_countries = list(sch.included_countries or [])
    exc_groups = list(sch.excluded_groups or [])
    exc_countries = list(sch.excluded_countries or [])

    # If there's display text but no structured data, mark as unresolved
    if not inc_groups and not inc_countries and not exc_groups and not exc_countries:
        if sch.eligibility_display:
            sch.eligibility_unresolved = True
            sch.resolved_countries = []
            sch.groups_resolved_at = None
        else:
            # No eligibility data at all — open to all (resolved = empty = all)
            sch.resolved_countries = []
            sch.eligibility_unresolved = False
            from datetime import datetime, timezone
            sch.groups_resolved_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(sch)
        return

    resolved, unresolved = await resolve_eligibility(
        included_groups=inc_groups,
        included_countries=inc_countries,
        excluded_groups=exc_groups,
        excluded_countries=exc_countries,
        db=db,
    )

    sch.resolved_countries = resolved
    sch.eligibility_unresolved = unresolved
    from datetime import datetime, timezone
    sch.groups_resolved_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(sch)

    logger.info(
        "Resolved eligibility for scholarship %s: %d countries, unresolved=%s",
        sch.id, len(resolved), unresolved,
    )


def _coerce_patch(patch_dict: dict) -> tuple[dict, list[str]]:
    """Coerce incoming date strings to date objects and string decimals to Decimal.

    Returns (coerced, errors). If errors is non-empty the caller should 422
    them back to the client rather than passing the bad value to the DB.
    """
    out: dict = {}
    errors: list[str] = []
    for k, v in patch_dict.items():
        if v is None:
            out[k] = None
        elif k in _DATE_FIELDS and isinstance(v, str):
            try:
                out[k] = date.fromisoformat(v)
            except ValueError:
                errors.append(f"{k} must be ISO date YYYY-MM-DD (got {v!r})")
        elif k in _DECIMAL_FIELDS and isinstance(v, (str, float, int)):
            try:
                out[k] = Decimal(str(v))
            except Exception:
                errors.append(f"{k} must be numeric (got {v!r})")
        elif isinstance(v, list) and v and isinstance(v[0], str):
            out[k] = [str(x).strip() for x in v if str(x).strip()]
        else:
            out[k] = v
    return out, errors


# ── list ───────────────────────────────────────────────────────────


@router.get("/scholarships", response_model=PaginatedResponse)
async def list_scholarships(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None, description="Search by name or provider"),
    is_active: Optional[bool] = Query(None),
    is_verified: Optional[bool] = Query(None),
    funding_type: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    sort: str = Query("newest", description="newest, oldest, deadline_asc, name"),
):
    query = select(Scholarship)
    if search:
        like = f"%{search.lower()}%"
        query = query.where(
            or_(
                func.lower(Scholarship.name).like(like),
                func.lower(func.coalesce(Scholarship.provider, "")).like(like),
            )
        )
    if is_active is not None:
        query = query.where(Scholarship.is_active == is_active)
    if is_verified is not None:
        query = query.where(Scholarship.is_verified == is_verified)
    if funding_type:
        query = query.where(Scholarship.funding_type == funding_type)
    if country:
        query = query.where(Scholarship.host_country == country)

    if sort == "oldest":
        query = query.order_by(Scholarship.created_at.asc())
    elif sort == "deadline_asc":
        query = query.order_by(Scholarship.deadline.asc())
    elif sort == "name":
        query = query.order_by(Scholarship.name.asc())
    else:  # newest
        query = query.order_by(Scholarship.created_at.desc())

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one() or 0
    offset = (page - 1) * limit
    rows = (await db.execute(query.offset(offset).limit(limit))).scalars().all()
    pages = (total + limit - 1) // limit if limit else 0

    return PaginatedResponse(
        items=[AdminScholarshipResponse.model_validate(apply_auto_defaults(s)).model_dump(mode="json") for s in rows],
        total=int(total),
        page=page,
        limit=limit,
        pages=int(pages),
    )


# ── get one ────────────────────────────────────────────────────────


@router.get("/scholarships/{sch_id}", response_model=AdminScholarshipResponse)
async def get_scholarship(
    sch_id: UUID,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    s = (await db.execute(select(Scholarship).where(Scholarship.id == sch_id))).scalar_one_or_none()
    if not s:
        raise HTTPException(
            status_code=404,
            detail={"code": "scholarship_not_found", "user_message": "Scholarship not found."},
        )
    apply_auto_defaults(s)
    response = AdminScholarshipResponse.model_validate(s)

    # Attach per-degree-level document overrides
    from app.models.scholarship_degree_document import ScholarshipDegreeDocument
    degree_docs = (
        await db.execute(
            select(ScholarshipDegreeDocument)
            .where(ScholarshipDegreeDocument.scholarship_id == s.id)
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
    custom_docs = (
        await db.execute(
            select(ScholarshipCustomDocument)
            .where(ScholarshipCustomDocument.scholarship_id == s.id)
            .order_by(ScholarshipCustomDocument.position, ScholarshipCustomDocument.name)
        )
    ).scalars().all()
    if custom_docs:
        response.custom_documents = [
            CustomDocResponse.model_validate(d).model_dump(mode="json")
            for d in custom_docs
        ]

    return response


# ── create ────────────────────────────────────────────────────────


@router.post("/scholarships", response_model=AdminScholarshipResponse)
async def create_scholarship(
    body: AdminScholarshipCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Create a new scholarship.

    All admins (super_admin or support_staff) can create. After insert:
      1. Audit log row is written
      2. If is_active is True (the default), trigger_scholarship_recompute()
         runs so the new scholarship is scored against every user immediately.

    A unique-slug conflict returns 409 (not 500) so the admin UI can show
    a clear "slug already taken" message.
    """
    raw = body.model_dump(exclude_unset=True)
    coerced, errors = _coerce_patch(raw)
    if errors:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "invalid_field",
                "user_message": "Some fields have invalid values.",
                "errors": errors,
                "retryable": False,
            },
        )

    s = Scholarship(**coerced)
    if s.is_active is None:
        s.is_active = True  # model default
    # Materialise the 5 "cement + flexible" fields from degree_levels
    # before insert, so the DB stores real values (not nulls) and the
    # read-side stays consistent. Admin's explicit override (if any)
    # is preserved by apply_auto_defaults' None-check logic.
    apply_auto_defaults(s)
    db.add(s)
    try:
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        # Most common cause: duplicate slug. Surface as 409.
        raise HTTPException(
            status_code=409,
            detail={
                "code": "scholarship_slug_taken",
                "user_message": f"A scholarship with slug '{body.slug}' already exists.",
                "retryable": False,
            },
        ) from e
    await db.refresh(s)

    # Resolve eligibility (compute resolved_countries from structured fields)
    await _resolve_scholarship_eligibility(db, s)

    await log_admin_action(
        db,
        admin_id=admin.id,
        admin_email=admin.email,
        action="scholarship.create",
        target_type="scholarship",
        target_id=str(s.id),
        payload={"name": s.name, "slug": s.slug, "is_active": s.is_active},
    )
    await db.commit()

    # If the new scholarship is active, compute it against every user
    # incrementally (only this scholarship, not a full recompute).
    if s.is_active:
        trigger_scholarship_recompute(s.id)
        logger.info(
            "scholarship.create: triggered incremental recompute (scholarship_id=%s slug=%s)",
            s.id, s.slug,
        )

    return AdminScholarshipResponse.model_validate(apply_auto_defaults(s))


# ── patch ──────────────────────────────────────────────────────────


@router.patch("/scholarships/{sch_id}", response_model=AdminScholarshipResponse)
async def patch_scholarship(
    sch_id: UUID,
    patch: AdminScholarshipPatch,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    s = (await db.execute(select(Scholarship).where(Scholarship.id == sch_id))).scalar_one_or_none()
    if not s:
        raise HTTPException(
            status_code=404,
            detail={"code": "scholarship_not_found", "user_message": "Scholarship not found."},
        )

    # Apply the patch (only fields that were set)
    raw = patch.model_dump(exclude_unset=True)
    if not raw:
        return AdminScholarshipResponse.model_validate(apply_auto_defaults(s))

    coerced, errors = _coerce_patch(raw)
    if errors:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "invalid_field",
                "user_message": "Some fields have invalid values.",
                "errors": errors,
                "retryable": False,
            },
        )

    changes: dict = {}
    is_active_flipped_on = False
    eligibility_changed = False
    match_affecting_changed = False
    for k, v in coerced.items():
        if not hasattr(s, k):
            continue
        old = getattr(s, k)
        if old != v:
            changes[k] = {"old": str(old) if old is not None else None, "new": str(v) if v is not None else None}
            # Detect false→true flip on is_active specifically
            if k == "is_active" and old is False and v is True:
                is_active_flipped_on = True
            # Track eligibility field changes
            if k in _ELIGIBILITY_FIELDS:
                eligibility_changed = True
            # Track match-affecting field changes
            if k in _MATCH_AFFECTING_FIELDS:
                match_affecting_changed = True
            setattr(s, k, v)

    if changes:
        s.updated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(s)

        # Re-resolve eligibility if any eligibility fields changed
        if eligibility_changed:
            await _resolve_scholarship_eligibility(db, s)

        await log_admin_action(
            db,
            admin_id=admin.id,
            admin_email=admin.email,
            action="scholarship.update",
            target_type="scholarship",
            target_id=str(s.id),
            payload={"changes": changes, "name": s.name, "slug": s.slug},
        )
        await db.commit()

    # If we flipped is_active false→true OR changed any match-affecting
    # field, recompute this scholarship against every user incrementally.
    if is_active_flipped_on or match_affecting_changed:
        trigger_scholarship_recompute(s.id)
        logger.info(
            "scholarship.patch: triggered incremental recompute (scholarship_id=%s, active_flip=%s, fields_changed=%s)",
            s.id, is_active_flipped_on, match_affecting_changed,
        )

    return AdminScholarshipResponse.model_validate(apply_auto_defaults(s))


# ── delete (hard) — super_admin only ───────────────────────────────


@router.delete("/scholarships/{sch_id}")
async def delete_scholarship(
    sch_id: UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    s = (await db.execute(select(Scholarship).where(Scholarship.id == sch_id))).scalar_one_or_none()
    if not s:
        raise HTTPException(
            status_code=404,
            detail={"code": "scholarship_not_found", "user_message": "Scholarship not found."},
        )

    # Save snapshot for the audit log BEFORE deleting
    snapshot = {
        "id": str(s.id),
        "name": s.name,
        "slug": s.slug,
        "host_country": s.host_country,
        "funding_type": s.funding_type,
        "is_active": s.is_active,
        "is_verified": s.is_verified,
        "view_count": s.view_count,
        "application_count": s.application_count,
    }
    name = s.name

    # Clean up orphaned match scores for this scholarship before deleting it.
    from app.models.match_score import MatchScore
    await db.execute(delete(MatchScore).where(MatchScore.scholarship_id == sch_id))

    await db.delete(s)
    await db.commit()

    await log_admin_action(
        db,
        admin_id=admin.id,
        admin_email=admin.email,
        action="scholarship.delete",
        target_type="scholarship",
        target_id=str(sch_id),
        payload={"snapshot": snapshot, "name": name},
    )
    await db.commit()

    return {"deleted": True, "id": str(sch_id), "name": name}


# ── manual resolve eligibility ─────────────────────────────────────


@router.post("/scholarships/{sch_id}/resolve-eligibility", response_model=AdminScholarshipResponse)
async def resolve_scholarship_eligibility(
    sch_id: UUID,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Manually trigger eligibility re-resolution for a single scholarship.

    Debugging/ops use — normally resolution happens automatically on create/edit.
    """
    s = (await db.execute(select(Scholarship).where(Scholarship.id == sch_id))).scalar_one_or_none()
    if not s:
        raise HTTPException(
            status_code=404,
            detail={"code": "scholarship_not_found", "user_message": "Scholarship not found."},
        )
    await _resolve_scholarship_eligibility(db, s)
    return AdminScholarshipResponse.model_validate(apply_auto_defaults(s))


@router.post("/scholarships/resolve-all-eligibility")
async def resolve_all_eligibility(
    _admin: User = Depends(require_super_admin),
):
    """Re-resolve eligibility for ALL scholarships.

    Super admin only. Used for backfill after initial migration or bulk
    group changes.
    """
    stats = await resolve_all_scholarships()
    return stats


# ── Per-degree-level documents CRUD ────────────────────────────────


@router.get("/scholarships/{sch_id}/degree-docs")
async def list_degree_docs(
    sch_id: UUID,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """List all per-degree-level document rows for a scholarship."""
    from app.models.scholarship_degree_document import ScholarshipDegreeDocument
    from app.schemas.admin import DegreeDocResponse
    rows = (
        await db.execute(
            select(ScholarshipDegreeDocument)
            .where(ScholarshipDegreeDocument.scholarship_id == sch_id)
            .order_by(ScholarshipDegreeDocument.degree_level)
        )
    ).scalars().all()
    return [DegreeDocResponse.model_validate(r).model_dump(mode="json") for r in rows]


@router.post("/scholarships/{sch_id}/degree-docs")
async def create_degree_doc(
    sch_id: UUID,
    body: DegreeDocCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Create a per-degree-level document row for a scholarship.

    Auto-derives defaults for fields left at their model defaults.
    """
    from app.models.scholarship_degree_document import (
        ScholarshipDegreeDocument, auto_derive_for_level,
    )

    # Verify scholarship exists
    sch = (await db.execute(select(Scholarship).where(Scholarship.id == sch_id))).scalar_one_or_none()
    if not sch:
        raise HTTPException(status_code=404, detail={"code": "scholarship_not_found"})

    # Check for duplicate degree_level
    existing = (
        await db.execute(
            select(ScholarshipDegreeDocument).where(
                ScholarshipDegreeDocument.scholarship_id == sch_id,
                ScholarshipDegreeDocument.degree_level == body.degree_level,
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=409,
            detail={"code": "degree_level_exists", "user_message": f"Document config for '{body.degree_level}' already exists."},
        )

    data = body.model_dump()
    data["scholarship_id"] = sch_id

    # Auto-derive defaults for None fields
    defaults = auto_derive_for_level(body.degree_level)
    for key, default_val in defaults.items():
        if data.get(key) is None:
            data[key] = default_val

    doc = ScholarshipDegreeDocument(**data)
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    await log_admin_action(
        db, admin_id=admin.id, admin_email=admin.email,
        action="degree_doc.create", target_type="scholarship",
        target_id=str(sch_id),
        payload={"degree_level": body.degree_level},
    )
    await db.commit()

    return DegreeDocResponse.model_validate(doc).model_dump(mode="json")


@router.patch("/scholarships/{sch_id}/degree-docs/{doc_id}")
async def update_degree_doc(
    sch_id: UUID,
    doc_id: UUID,
    body: DegreeDocUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Update a per-degree-level document row."""
    from app.models.scholarship_degree_document import ScholarshipDegreeDocument

    doc = (
        await db.execute(
            select(ScholarshipDegreeDocument).where(
                ScholarshipDegreeDocument.id == doc_id,
                ScholarshipDegreeDocument.scholarship_id == sch_id,
            )
        )
    ).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail={"code": "degree_doc_not_found"})

    updates = body.model_dump(exclude_unset=True)
    for k, v in updates.items():
        setattr(doc, k, v)

    await db.commit()
    await db.refresh(doc)

    await log_admin_action(
        db, admin_id=admin.id, admin_email=admin.email,
        action="degree_doc.update", target_type="scholarship",
        target_id=str(sch_id),
        payload={"doc_id": str(doc_id), "fields": list(updates.keys())},
    )
    await db.commit()

    return DegreeDocResponse.model_validate(doc).model_dump(mode="json")


@router.delete("/scholarships/{sch_id}/degree-docs/{doc_id}")
async def delete_degree_doc(
    sch_id: UUID,
    doc_id: UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Delete a per-degree-level document row."""
    from app.models.scholarship_degree_document import ScholarshipDegreeDocument

    doc = (
        await db.execute(
            select(ScholarshipDegreeDocument).where(
                ScholarshipDegreeDocument.id == doc_id,
                ScholarshipDegreeDocument.scholarship_id == sch_id,
            )
        )
    ).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail={"code": "degree_doc_not_found"})

    level = doc.degree_level
    await db.delete(doc)
    await db.commit()

    await log_admin_action(
        db, admin_id=admin.id, admin_email=admin.email,
        action="degree_doc.delete", target_type="scholarship",
        target_id=str(sch_id),
        payload={"degree_level": level},
    )
    await db.commit()

    return {"deleted": True, "degree_level": level}


# ── Custom/flexible documents CRUD ─────────────────────────────────


@router.get("/scholarships/{sch_id}/custom-docs")
async def list_custom_docs(
    sch_id: UUID,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """List all custom document requirements for a scholarship."""
    from app.models.scholarship_custom_document import ScholarshipCustomDocument
    rows = (
        await db.execute(
            select(ScholarshipCustomDocument)
            .where(ScholarshipCustomDocument.scholarship_id == sch_id)
            .order_by(ScholarshipCustomDocument.position, ScholarshipCustomDocument.name)
        )
    ).scalars().all()
    return [CustomDocResponse.model_validate(r).model_dump(mode="json") for r in rows]


@router.post("/scholarships/{sch_id}/custom-docs")
async def create_custom_doc(
    sch_id: UUID,
    body: CustomDocCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Add a custom document requirement to a scholarship."""
    from app.models.scholarship_custom_document import ScholarshipCustomDocument

    sch = (await db.execute(select(Scholarship).where(Scholarship.id == sch_id))).scalar_one_or_none()
    if not sch:
        raise HTTPException(status_code=404, detail={"code": "scholarship_not_found"})

    doc = ScholarshipCustomDocument(
        scholarship_id=sch_id,
        name=body.name,
        description=body.description,
        required=body.required,
        degree_level=body.degree_level,
        position=body.position,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    await log_admin_action(
        db, admin_id=admin.id, admin_email=admin.email,
        action="custom_doc.create", target_type="scholarship",
        target_id=str(sch_id),
        payload={"name": body.name, "degree_level": body.degree_level},
    )
    await db.commit()

    return CustomDocResponse.model_validate(doc).model_dump(mode="json")


@router.patch("/scholarships/{sch_id}/custom-docs/{doc_id}")
async def update_custom_doc(
    sch_id: UUID,
    doc_id: UUID,
    body: CustomDocUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Update a custom document requirement."""
    from app.models.scholarship_custom_document import ScholarshipCustomDocument

    doc = (
        await db.execute(
            select(ScholarshipCustomDocument).where(
                ScholarshipCustomDocument.id == doc_id,
                ScholarshipCustomDocument.scholarship_id == sch_id,
            )
        )
    ).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail={"code": "custom_doc_not_found"})

    updates = body.model_dump(exclude_unset=True)
    for k, v in updates.items():
        setattr(doc, k, v)

    await db.commit()
    await db.refresh(doc)

    await log_admin_action(
        db, admin_id=admin.id, admin_email=admin.email,
        action="custom_doc.update", target_type="scholarship",
        target_id=str(sch_id),
        payload={"doc_id": str(doc_id), "fields": list(updates.keys())},
    )
    await db.commit()

    return CustomDocResponse.model_validate(doc).model_dump(mode="json")


@router.delete("/scholarships/{sch_id}/custom-docs/{doc_id}")
async def delete_custom_doc(
    sch_id: UUID,
    doc_id: UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Delete a custom document requirement."""
    from app.models.scholarship_custom_document import ScholarshipCustomDocument

    doc = (
        await db.execute(
            select(ScholarshipCustomDocument).where(
                ScholarshipCustomDocument.id == doc_id,
                ScholarshipCustomDocument.scholarship_id == sch_id,
            )
        )
    ).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail={"code": "custom_doc_not_found"})

    name = doc.name
    await db.delete(doc)
    await db.commit()

    await log_admin_action(
        db, admin_id=admin.id, admin_email=admin.email,
        action="custom_doc.delete", target_type="scholarship",
        target_id=str(sch_id),
        payload={"name": name},
    )
    await db.commit()

    return {"deleted": True, "name": name}
