"""
Admin API: Pending scholarship review queue.

GET    /api/admin/review                 — paginated list of pending submissions
GET    /api/admin/review/{id}            — single pending record
POST   /api/admin/review/{id}/approve    — approve → creates scholarship
POST   /api/admin/review/{id}/reject     — reject with reason
DELETE /api/admin/review/{id}            — delete pending record (super_admin only)
GET    /api/admin/review/stats           — queue stats (pending/approved/rejected counts)
"""
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.admin import require_admin, require_super_admin
from app.db.session import get_db
from app.models.pending_scholarship import PendingScholarship
from app.models.scholarship import Scholarship
from app.models.user import User
from app.schemas.admin import PaginatedResponse
from app.services.admin_audit import log_admin_action
from app.utils.db import escape_like
from app.services.document_defaults import apply_auto_defaults
from app.services.match_auto import trigger_scholarship_recompute
from app.services.eligibility import resolve_eligibility

import logging

router = APIRouter()
logger = logging.getLogger("scholara.admin.review")


# ── Schemas ────────────────────────────────────────────────────────

from pydantic import BaseModel, Field
from typing import Any, Dict, List, Literal, Optional
from datetime import datetime
from uuid import UUID


class PendingScholarshipResponse(BaseModel):
    id: UUID
    payload: Dict[str, Any]
    submitted_by: str
    agent_key_id: Optional[UUID] = None
    status: str
    reviewed_by: Optional[UUID] = None
    reviewed_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    approved_scholarship_id: Optional[UUID] = None
    duplicate_of: Optional[UUID] = None
    target_scholarship_id: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ReviewRejectRequest(BaseModel):
    reason: str = Field(..., min_length=1, max_length=2000)


class ReviewApproveRequest(BaseModel):
    """Optional overrides when approving. If empty, uses the submitted payload as-is."""
    slug_override: Optional[str] = None
    is_active: Optional[bool] = True
    is_verified: Optional[bool] = False


class ReviewStatsResponse(BaseModel):
    pending: int
    approved: int
    rejected: int
    total: int


# ── Endpoints ──────────────────────────────────────────────────────


@router.get("/review/stats", response_model=ReviewStatsResponse)
async def get_review_stats(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Queue stats: count by status."""
    result = await db.execute(
        select(
            PendingScholarship.status,
            func.count(PendingScholarship.id),
        ).group_by(PendingScholarship.status)
    )
    counts = {row[0]: row[1] for row in result.all()}
    return ReviewStatsResponse(
        pending=counts.get("pending_review", 0),
        approved=counts.get("approved", 0),
        rejected=counts.get("rejected", 0),
        total=sum(counts.values()),
    )


@router.get("/review", response_model=PaginatedResponse)
async def list_pending_scholarships(
    status: Optional[str] = Query(None, description="Filter by status"),
    submitted_by: Optional[str] = Query(None, description="Filter by submitter"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Paginated list of pending scholarship submissions."""
    query = select(PendingScholarship)

    if status:
        query = query.where(PendingScholarship.status == status)
    if submitted_by:
        query = query.where(PendingScholarship.submitted_by.ilike(f"%{submitted_by}%"))

    # Count
    count_query = select(func.count(PendingScholarship.id))
    if status:
        count_query = count_query.where(PendingScholarship.status == status)
    if submitted_by:
        count_query = count_query.where(PendingScholarship.submitted_by.ilike(f"%{submitted_by}%"))

    total = (await db.execute(count_query)).scalar() or 0
    pages = max(1, (total + limit - 1) // limit)

    # Fetch page
    query = query.order_by(PendingScholarship.created_at.desc())
    query = query.offset((page - 1) * limit).limit(limit)
    rows = (await db.execute(query)).scalars().all()

    return PaginatedResponse(
        items=[PendingScholarshipResponse.model_validate(r) for r in rows],
        total=total,
        page=page,
        limit=limit,
        pages=pages,
    )


@router.get("/review/{pending_id}", response_model=PendingScholarshipResponse)
async def get_pending_scholarship(
    pending_id: UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get a single pending submission."""
    row = await db.get(PendingScholarship, pending_id)
    if not row:
        raise HTTPException(404, "Pending scholarship not found")
    return PendingScholarshipResponse.model_validate(row)


@router.post("/review/{pending_id}/approve", response_model=PendingScholarshipResponse)
async def approve_pending_scholarship(
    pending_id: UUID,
    body: ReviewApproveRequest = ReviewApproveRequest(),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Approve a pending submission.

    If the record is an edit proposal (target_scholarship_id set), apply the
    proposed diff to the existing scholarship. Otherwise create a new one."""
    pending = await db.get(PendingScholarship, pending_id)
    if not pending:
        raise HTTPException(404, "Pending scholarship not found")
    if pending.status != "pending_review":
        raise HTTPException(400, f"Cannot approve — status is '{pending.status}'")

    if pending.target_scholarship_id:
        return await _approve_edit_proposal(pending, admin, db, background_tasks)

    payload = dict(pending.payload)

    # Generate slug from name if not in payload
    if not payload.get("slug"):
        import re
        name = payload.get("name", "untitled")
        slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        # Ensure uniqueness
        base_slug = slug
        counter = 1
        while True:
            existing = await db.execute(
                select(Scholarship.id).where(Scholarship.slug == slug)
            )
            if not existing.scalar():
                break
            slug = f"{base_slug}-{counter}"
            counter += 1
        payload["slug"] = slug

    # Apply overrides
    if body.slug_override:
        payload["slug"] = body.slug_override
    if body.is_active is not None:
        payload["is_active"] = body.is_active
    if body.is_verified is not None:
        payload["is_verified"] = body.is_verified

    # Parse date strings
    from datetime import date as date_type
    for field in ("deadline", "open_date", "program_start_date"):
        if field in payload and isinstance(payload[field], str):
            try:
                payload[field] = date_type.fromisoformat(payload[field])
            except (ValueError, TypeError):
                payload.pop(field, None)

    # Remove fields that aren't on the Scholarship model
    safe_fields = {c.name for c in Scholarship.__table__.columns}
    filtered = {k: v for k, v in payload.items() if k in safe_fields}
    filtered.setdefault("is_active", body.is_active if body.is_active is not None else True)
    filtered.setdefault("is_verified", body.is_verified if body.is_verified is not None else False)

    # Create the scholarship
    scholarship = Scholarship(**filtered)
    db.add(scholarship)
    await db.flush()

    # Apply auto-defaults (cement, recommendation count, etc.)
    apply_auto_defaults(scholarship)

    # Update pending record
    pending.status = "approved"
    pending.reviewed_by = admin.id
    pending.reviewed_at = datetime.now(timezone.utc)
    pending.approved_scholarship_id = scholarship.id

    # Audit log (BEFORE commit so it's in the same transaction)
    await log_admin_action(
        db, admin.id, admin.email, "review.approve", "pending_scholarship", str(pending_id),
        payload={"scholarship_id": str(scholarship.id), "name": scholarship.name}
    )

    await db.commit()
    await db.refresh(pending)
    await db.refresh(scholarship)

    # Re-resolve structured eligibility fields (included_countries/excluded_countries
    # and groups) into the flat resolved_countries list the match engine reads.
    # The admin direct-create path does this in admin_scholarships.py; the MCP
    # approval path must do it too, otherwise MCP-submitted scholarships with
    # country rules land with resolved_countries=[] and match as "open to all".
    try:
        inc_groups = list(scholarship.included_groups or [])
        inc_countries = list(scholarship.included_countries or [])
        exc_groups = list(scholarship.excluded_groups or [])
        exc_countries = list(scholarship.excluded_countries or [])
        if inc_groups or inc_countries or exc_groups or exc_countries:
            resolved, unresolved = await resolve_eligibility(
                included_groups=inc_groups,
                included_countries=inc_countries,
                excluded_groups=exc_groups,
                excluded_countries=exc_countries,
                db=db,
            )
            scholarship.resolved_countries = resolved
            scholarship.eligibility_unresolved = unresolved
            from datetime import datetime as _dt, timezone as _tz
            scholarship.groups_resolved_at = _dt.now(_tz.utc)
            await db.commit()
            await db.refresh(scholarship)
    except Exception:  # noqa: BLE001
        logger.exception(
            "eligibility re-resolve failed after approve (pending=%s, scholarship=%s)",
            pending_id, scholarship.id,
        )

    # Trigger incremental match: compute ONLY this scholarship against ALL users.
    trigger_scholarship_recompute(scholarship.id, background_tasks)

    logger.info("Approved pending scholarship %s → created %s", pending_id, scholarship.id)
    return PendingScholarshipResponse.model_validate(pending)


@router.post("/review/{pending_id}/reject", response_model=PendingScholarshipResponse)
async def reject_pending_scholarship(
    pending_id: UUID,
    body: ReviewRejectRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Reject a pending submission with a reason."""
    pending = await db.get(PendingScholarship, pending_id)
    if not pending:
        raise HTTPException(404, "Pending scholarship not found")
    if pending.status != "pending_review":
        raise HTTPException(400, f"Cannot reject — status is '{pending.status}'")

    pending.status = "rejected"
    pending.reviewed_by = admin.id
    pending.reviewed_at = datetime.now(timezone.utc)
    pending.rejection_reason = body.reason

    await log_admin_action(
        db, admin.id, admin.email, "review.reject", "pending_scholarship", str(pending_id),
        payload={"reason": body.reason}
    )

    await db.commit()
    await db.refresh(pending)

    logger.info("Rejected pending scholarship %s: %s", pending_id, body.reason)
    return PendingScholarshipResponse.model_validate(pending)


async def _approve_edit_proposal(
    pending: PendingScholarship,
    admin: User,
    db: AsyncSession,
    background_tasks: BackgroundTasks,
):
    """Apply an approved edit proposal to its target scholarship."""
    from datetime import date as date_type
    from sqlalchemy import text as sa_text
    from app.models.scholarship_degree_document import ScholarshipDegreeDocument, auto_derive_for_level
    from app.models.scholarship_custom_document import ScholarshipCustomDocument

    sch = await db.get(Scholarship, pending.target_scholarship_id)
    if not sch:
        raise HTTPException(404, "Target scholarship no longer exists")

    payload = dict(pending.payload or {})
    changes: Dict[str, Any] = payload.get("changes") or {}
    applied_fields = []
    old_deadline = None

    for field, ch in changes.items():
        if not hasattr(sch, field) or not isinstance(ch, dict) or "new" not in ch:
            continue
        value = ch["new"]
        if field in ("deadline", "open_date", "program_start_date") and isinstance(value, str):
            try:
                value = date_type.fromisoformat(value)
            except (ValueError, TypeError):
                continue
        if field == "deadline":
            try:
                old_deadline = date_type.fromisoformat(ch["old"]) if isinstance(ch.get("old"), str) else ch.get("old")
            except (ValueError, TypeError):
                old_deadline = None
        setattr(sch, field, value)
        applied_fields.append(field)

    # Re-apply inline document replacements, same semantics as the MCP edit tool
    doc_changes = []
    degree_docs = payload.get("degree_documents")
    if isinstance(degree_docs, list):
        for dd in degree_docs:
            level = dd.get("degree_level")
            if not level:
                continue
            await db.execute(
                sa_text("DELETE FROM scholarship_degree_documents WHERE scholarship_id = :sid AND degree_level = :lvl"),
                {"sid": str(sch.id), "lvl": level},
            )
            defaults = auto_derive_for_level(level)
            doc = ScholarshipDegreeDocument(
                scholarship_id=sch.id,
                degree_level=level,
                req_transcripts=dd.get("req_transcripts", True),
                req_cv_resume=dd.get("req_cv_resume", True),
                req_sop_motivation_letter=dd.get("req_sop_motivation_letter", True),
                req_recommendation_letters=dd.get("req_recommendation_letters", True),
                req_english_test=dd.get("req_english_test", True),
                req_passport_or_id=dd.get("req_passport_or_id", True),
                req_financial_proof=dd.get("req_financial_proof", False),
                req_photo=dd.get("req_photo", False),
                previous_degree_required=dd.get("previous_degree_required") or defaults["previous_degree_required"],
                recommendation_letters_count=dd.get("recommendation_letters_count") or defaults["recommendation_letters_count"],
                research_proposal_required=dd.get("research_proposal_required") if "research_proposal_required" in dd else defaults["research_proposal_required"],
                writing_sample_required=dd.get("writing_sample_required") if "writing_sample_required" in dd else defaults["writing_sample_required"],
                standardized_test=dd.get("standardized_test") or defaults["standardized_test"],
            )
            db.add(doc)
            doc_changes.append(f"degree_docs:{level}")

    custom_docs = payload.get("custom_documents")
    if isinstance(custom_docs, list):
        await db.execute(
            sa_text("DELETE FROM scholarship_custom_documents WHERE scholarship_id = :sid"),
            {"sid": str(sch.id)},
        )
        for i, cd in enumerate(custom_docs):
            name = (cd.get("name") or "").strip()
            if not name:
                continue
            doc = ScholarshipCustomDocument(
                scholarship_id=sch.id,
                name=name,
                description=cd.get("description"),
                required=cd.get("required", True),
                degree_level=cd.get("degree_level"),
                position=cd.get("position", i),
            )
            db.add(doc)
            doc_changes.append(f"custom_doc:{name}")

    sch.updated_at = datetime.now(timezone.utc)

    pending.status = "approved"
    pending.reviewed_by = admin.id
    pending.reviewed_at = datetime.now(timezone.utc)
    pending.approved_scholarship_id = sch.id

    await log_admin_action(
        db, admin.id, admin.email, "review.approve_edit", "pending_scholarship", str(pending.id),
        payload={
            "scholarship_id": str(sch.id),
            "name": sch.name,
            "applied_fields": applied_fields,
            "document_changes": doc_changes,
        }
    )

    await db.commit()
    await db.refresh(pending)
    await db.refresh(sch)

    # Re-resolve structured eligibility if the edit touched any of the
    # country/group fields. Without this, an MCP-proposed edit that flips
    # included_countries or excluded_countries leaves resolved_countries
    # stale and the match engine keeps using the old country list.
    _ELIGIBILITY_FIELDS = {
        "eligibility_display", "eligibility_basis",
        "included_groups", "included_countries",
        "excluded_groups", "excluded_countries",
    }
    if applied_fields and any(f in _ELIGIBILITY_FIELDS for f in applied_fields):
        try:
            inc_groups = list(sch.included_groups or [])
            inc_countries = list(sch.included_countries or [])
            exc_groups = list(sch.excluded_groups or [])
            exc_countries = list(sch.excluded_countries or [])
            if inc_groups or inc_countries or exc_groups or exc_countries:
                resolved, unresolved = await resolve_eligibility(
                    included_groups=inc_groups,
                    included_countries=inc_countries,
                    excluded_groups=exc_groups,
                    excluded_countries=exc_countries,
                    db=db,
                )
                sch.resolved_countries = resolved
                sch.eligibility_unresolved = unresolved
                sch.groups_resolved_at = datetime.now(timezone.utc)
                await db.commit()
                await db.refresh(sch)
        except Exception:  # noqa: BLE001
            logger.exception(
                "eligibility re-resolve failed after edit approve (pending=%s, scholarship=%s)",
                pending.id, sch.id,
            )

    # Deadline extended → good-news notification for savers.
    if "deadline" in applied_fields:
        try:
            from app.services.deadline_extended import notify_deadline_extension
            await notify_deadline_extension(db, scholarship=sch, old_deadline=None)
            await db.commit()
        except Exception:  # noqa: BLE001 — never fail the approval over notifications
            logger.exception("deadline extension notify failed scholarship=%s", sch.id)

    trigger_scholarship_recompute(sch.id, background_tasks)

    logger.info(
        "Approved edit proposal %s → updated scholarship %s (fields=%s docs=%s)",
        pending.id, sch.id, applied_fields, doc_changes,
    )
    return PendingScholarshipResponse.model_validate(pending)


@router.delete("/review/{pending_id}")
async def delete_pending_scholarship(
    pending_id: UUID,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Hard-delete a pending record (super_admin only)."""
    pending = await db.get(PendingScholarship, pending_id)
    if not pending:
        raise HTTPException(404, "Pending scholarship not found")

    await log_admin_action(
        db, admin.id, admin.email, "review.delete", "pending_scholarship", str(pending_id)
    )

    await db.delete(pending)
    await db.commit()

    return {"detail": "Deleted"}


@router.post("/review", response_model=PendingScholarshipResponse)
async def submit_pending_scholarship(
    payload: Dict[str, Any],
    submitted_by: str = Query("admin", description="Who submitted"),
    agent_key_id: Optional[UUID] = Query(None),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Submit a new scholarship to the review queue (admin can also use this)."""
    pending = PendingScholarship(
        payload=payload,
        submitted_by=submitted_by,
        agent_key_id=agent_key_id,
        status="pending_review",
    )
    db.add(pending)
    await db.commit()
    await db.refresh(pending)

    await log_admin_action(
        db, admin.id, admin.email, "review.submit", "pending_scholarship", str(pending.id),
        payload={"name": payload.get("name", "unknown")}
    )

    return PendingScholarshipResponse.model_validate(pending)
