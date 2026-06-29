"""Admin API: Country Groups management.

GET    /api/admin/groups                      — list all groups
POST   /api/admin/groups                      — create group (super_admin only)
GET    /api/admin/groups/{code}               — get one (with members)
PUT    /api/admin/groups/{code}               — update (super_admin only, triggers re-resolution)
DELETE /api/admin/groups/{code}               — soft-delete (super_admin only)
GET    /api/admin/groups/{code}/usage         — list scholarships referencing this group
POST   /api/admin/groups/preview              — live eligibility preview (debounced from UI)

GET    /api/admin/countries                   — full ISO 3166-1 list for country pickers
"""
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.admin import require_admin, require_super_admin
from app.db.session import get_db
from app.models.country import Country
from app.models.group import Group, GroupMember
from app.models.scholarship import Scholarship
from app.models.user import User
from app.schemas.group import (
    CountryResponse,
    EligibilityPreviewRequest,
    EligibilityPreviewResponse,
    GroupCreate,
    GroupListResponse,
    GroupMemberResponse,
    GroupResponse,
    GroupUpdate,
)
from app.services.admin_audit import log_admin_action
from app.services.eligibility import (
    get_group_members,
    resolve_eligibility,
    re_resolve_stale_scholarships,
)

import logging

router = APIRouter()
logger = logging.getLogger("scholara.admin_groups")


# ── Helpers ────────────────────────────────────────────────────────


async def _build_group_response(db: AsyncSession, group: Group) -> dict:
    """Build a GroupResponse dict with member count and scholarship usage."""
    # Member count
    member_count = (
        await db.execute(
            select(func.count()).select_from(GroupMember).where(GroupMember.group_id == group.id)
        )
    ).scalar_one()

    # Members (with country names)
    members_q = (
        await db.execute(
            select(Country.code, Country.name)
            .join(GroupMember, GroupMember.country_code == Country.code)
            .where(GroupMember.group_id == group.id)
            .order_by(Country.name)
        )
    ).all()

    # Scholarship usage count
    code = group.code
    sch_count = (
        await db.execute(
            select(func.count()).select_from(Scholarship).where(
                func.array_to_string(Scholarship.included_groups, ",").like(f"%{code}%")
            )
        )
    ).scalar_one() or 0
    sch_count += (
        await db.execute(
            select(func.count()).select_from(Scholarship).where(
                func.array_to_string(Scholarship.excluded_groups, ",").like(f"%{code}%")
            )
        )
    ).scalar_one() or 0

    return {
        "id": group.id,
        "code": group.code,
        "name": group.name,
        "description": group.description,
        "source_url": group.source_url,
        "source_date": group.source_date,
        "status": group.status,
        "member_count": member_count,
        "members": [{"code": r[0], "name": r[1]} for r in members_q],
        "scholarship_count": sch_count,
        "created_at": group.created_at,
        "updated_at": group.updated_at,
    }


# ── List all groups ────────────────────────────────────────────────


@router.get("/groups", response_model=GroupListResponse)
async def list_groups(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
):
    query = select(Group)
    if status:
        query = query.where(Group.status == status)
    if search:
        like = f"%{search.lower()}%"
        query = query.where(
            func.lower(Group.name).like(like) | func.lower(Group.code).like(like)
        )
    query = query.order_by(Group.name.asc())
    rows = (await db.execute(query)).scalars().all()
    items = []
    for g in rows:
        items.append(await _build_group_response(db, g))
    return GroupListResponse(items=items, total=len(items))


# ── Get one group ──────────────────────────────────────────────────


@router.get("/groups/{code}", response_model=GroupResponse)
async def get_group(
    code: str,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    group = (await db.execute(select(Group).where(Group.code == code))).scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail={"code": "group_not_found", "user_message": f"Group '{code}' not found."})
    data = await _build_group_response(db, group)
    return GroupResponse(**data)


# ── Create group ───────────────────────────────────────────────────


@router.post("/groups", response_model=GroupResponse)
async def create_group(
    body: GroupCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    # Check unique code
    existing = (await db.execute(select(Group).where(Group.code == body.code))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail={"code": "group_code_taken", "user_message": f"Group code '{body.code}' already exists."})

    group = Group(
        code=body.code,
        name=body.name,
        description=body.description,
        source_url=body.source_url,
        source_date=body.source_date,
        created_by=admin.id,
    )
    db.add(group)
    await db.flush()  # get group.id

    # Add members
    for cc in body.members:
        cc = cc.upper()
        # Validate country exists
        country = (await db.execute(select(Country).where(Country.code == cc))).scalar_one_or_none()
        if not country:
            await db.rollback()
            raise HTTPException(status_code=422, detail={"code": "invalid_country", "user_message": f"Country code '{cc}' not found in ISO 3166-1."})
        db.add(GroupMember(group_id=group.id, country_code=cc))

    await db.commit()
    await db.refresh(group)

    await log_admin_action(db, admin_id=admin.id, admin_email=admin.email,
                           action="group.create", target_type="group",
                           target_id=str(group.id), payload={"code": group.code, "name": group.name, "member_count": len(body.members)})
    await db.commit()

    data = await _build_group_response(db, group)
    return GroupResponse(**data)


# ── Update group ───────────────────────────────────────────────────


@router.put("/groups/{code}", response_model=GroupResponse)
async def update_group(
    code: str,
    body: GroupUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    group = (await db.execute(select(Group).where(Group.code == code))).scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail={"code": "group_not_found", "user_message": f"Group '{code}' not found."})
    if group.status == "deprecated":
        raise HTTPException(status_code=400, detail={"code": "group_deprecated", "user_message": "Cannot edit a deprecated group. Create a new one instead."})

    changes = {}
    if body.name is not None and body.name != group.name:
        changes["name"] = {"old": group.name, "new": body.name}
        group.name = body.name
    if body.description is not None:
        changes["description"] = {"old": group.description, "new": body.description}
        group.description = body.description
    if body.source_url is not None:
        changes["source_url"] = {"old": group.source_url, "new": body.source_url}
        group.source_url = body.source_url
    if body.source_date is not None:
        changes["source_date"] = {"old": str(group.source_date), "new": str(body.source_date)}
        group.source_date = body.source_date

    membership_changed = False
    if body.members is not None:
        # Get current members
        current = {r[0] for r in (await db.execute(
            select(GroupMember.country_code).where(GroupMember.group_id == group.id)
        )).all()}
        new_set = {c.upper() for c in body.members}

        if current != new_set:
            membership_changed = True
            # Remove old
            await db.execute(
                text("DELETE FROM group_members WHERE group_id = :gid"),
                {"gid": str(group.id)},
            )
            # Add new
            for cc in sorted(new_set):
                country = (await db.execute(select(Country).where(Country.code == cc))).scalar_one_or_none()
                if not country:
                    await db.rollback()
                    raise HTTPException(status_code=422, detail={"code": "invalid_country", "user_message": f"Country code '{cc}' not found."})
                db.add(GroupMember(group_id=group.id, country_code=cc))

            changes["members"] = {"old_count": len(current), "new_count": len(new_set)}

    if changes:
        group.updated_at = datetime.now(timezone.utc)
        await db.commit()

        await log_admin_action(db, admin_id=admin.id, admin_email=admin.email,
                               action="group.update", target_type="group",
                               target_id=str(group.id), payload={"code": group.code, "changes": changes})
        await db.commit()

        # Trigger re-resolution if membership changed
        if membership_changed:
            logger.info("Group %s membership changed, triggering re-resolution", code)
            stats = await re_resolve_stale_scholarships(code)
            logger.info("Re-resolution after group %s update: %s", code, stats)

    await db.refresh(group)
    data = await _build_group_response(db, group)
    return GroupResponse(**data)


# ── Soft-delete group ──────────────────────────────────────────────


@router.delete("/groups/{code}")
async def delete_group(
    code: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    group = (await db.execute(select(Group).where(Group.code == code))).scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail={"code": "group_not_found", "user_message": f"Group '{code}' not found."})
    if group.status == "deprecated":
        return {"deprecated": True, "code": code, "message": "Already deprecated."}

    group.status = "deprecated"
    group.updated_at = datetime.now(timezone.utc)
    await db.commit()

    await log_admin_action(db, admin_id=admin.id, admin_email=admin.email,
                           action="group.deprecate", target_type="group",
                           target_id=str(group.id), payload={"code": group.code, "name": group.name})
    await db.commit()

    return {"deprecated": True, "code": code}


# ── Usage (which scholarships reference this group) ────────────────


@router.get("/groups/{code}/usage")
async def group_usage(
    code: str,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    group = (await db.execute(select(Group).where(Group.code == code))).scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail={"code": "group_not_found"})

    # Find scholarships that reference this group code in any of the 4 group arrays
    result = await db.execute(
        text("""
            SELECT id, name, slug, eligibility_display, eligibility_unresolved
            FROM scholarships
            WHERE :code = ANY(included_groups) OR :code = ANY(excluded_groups)
            ORDER BY name
        """),
        {"code": code},
    )
    rows = result.fetchall()

    return {
        "group_code": code,
        "group_name": group.name,
        "scholarship_count": len(rows),
        "scholarships": [
            {
                "id": str(r[0]),
                "name": r[1],
                "slug": r[2],
                "eligibility_display": r[3],
                "eligibility_unresolved": r[4],
            }
            for r in rows
        ],
    }


# ── Eligibility preview (for admin form live preview) ──────────────


@router.post("/groups/preview", response_model=EligibilityPreviewResponse)
async def eligibility_preview(
    body: EligibilityPreviewRequest,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Compute the resolved country list for a given set of groups/countries.

    Used by the admin scholarship form's live preview — debounced calls
    as the admin edits the pickers.
    """
    resolved, unresolved = await resolve_eligibility(
        included_groups=body.included_groups,
        included_countries=body.included_countries,
        excluded_groups=body.excluded_groups,
        excluded_countries=body.excluded_countries,
        db=db,
    )

    # Resolve country names for display
    countries = []
    if resolved:
        rows = (
            await db.execute(
                select(Country.code, Country.name).where(Country.code.in_(resolved))
            )
        ).all()
        countries = [{"code": r[0], "name": r[1]} for r in rows]

    return EligibilityPreviewResponse(
        resolved_count=len(resolved),
        unresolved=unresolved,
        countries=countries,
    )


# ── Countries list (for country picker) ────────────────────────────


@router.get("/countries")
async def list_countries(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
    search: Optional[str] = Query(None, description="Search by name or code"),
):
    query = select(Country).order_by(Country.name)
    if search:
        like = f"%{search.lower()}%"
        query = query.where(
            func.lower(Country.name).like(like) | func.lower(Country.code).like(like)
        )
    rows = (await db.execute(query)).scalars().all()
    return [{"code": c.code, "name": c.name, "iso3": c.iso3} for c in rows]
