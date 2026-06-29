"""Country eligibility resolution engine.

Core principle: resolve once at write time, lookup at match time.

The resolver composes eligibility as:
    included_groups + included_countries − excluded_groups − excluded_countries

All country codes are ISO 3166-1 alpha-2 internally. Display names are
resolved only in the UI layer.

Usage:
    from app.services.eligibility import resolve_eligibility, passes_country_gate
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional, Set
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.models.group import Group, GroupMember
from app.models.country import Country

logger = logging.getLogger("scholara.eligibility")


# ── Country code lookup ────────────────────────────────────────────

async def get_all_country_codes(db: AsyncSession) -> Set[str]:
    """Return the full set of ISO 3166-1 alpha-2 codes from the countries table."""
    rows = (await db.execute(select(Country.code))).scalars().all()
    return set(rows)


async def get_group_members(db: AsyncSession, group_code: str) -> Set[str]:
    """Return the set of country codes belonging to a group.

    Raises ValueError if the group doesn't exist or is deprecated.
    """
    group = (
        await db.execute(
            select(Group).where(Group.code == group_code, Group.status == "active")
        )
    ).scalar_one_or_none()

    if not group:
        raise ValueError(f"Group '{group_code}' not found or deprecated")

    rows = (
        await db.execute(
            select(GroupMember.country_code).where(GroupMember.group_id == group.id)
        )
    ).scalars().all()
    return set(rows)


async def get_groups_containing_country(db: AsyncSession, country_code: str) -> list[str]:
    """Return list of group codes that contain this country."""
    rows = (
        await db.execute(
            select(Group.code)
            .join(GroupMember, GroupMember.group_id == Group.id)
            .where(GroupMember.country_code == country_code, Group.status == "active")
        )
    ).scalars().all()
    return list(rows)


# ── Core resolver ──────────────────────────────────────────────────

async def resolve_eligibility(
    included_groups: list[str],
    included_countries: list[str],
    excluded_groups: list[str],
    excluded_countries: list[str],
    db: Optional[AsyncSession] = None,
) -> tuple[list[str], bool]:
    """Compute the resolved list of eligible country codes.

    Returns (resolved_countries_sorted, unresolved_flag).

    Logic:
        included = union(all group members) + included_countries
        excluded = union(all excluded group members) + excluded_countries
        resolved = included − excluded

    Edge case: if no groups and no countries are specified in included,
    the scholarship is open to ALL countries.
    """
    owns_session = db is None
    if owns_session:
        db = AsyncSessionLocal()
        db_cm = db
    else:
        db_cm = None

    try:
        included: Set[str] = set()
        unresolved = False

        # Resolve included groups
        for code in included_groups:
            try:
                members = await get_group_members(db, code)
                included |= members
            except ValueError:
                logger.warning("resolve_eligibility: included group '%s' not found/deprecated", code)
                unresolved = True

        # Add explicit included countries
        included |= {c.upper() for c in included_countries}

        # If no groups and no countries specified → open to all
        if not included_groups and not included_countries:
            included = await get_all_country_codes(db)

        # Resolve excluded groups
        excluded: Set[str] = set()
        for code in excluded_groups:
            try:
                members = await get_group_members(db, code)
                excluded |= members
            except ValueError:
                logger.warning("resolve_eligibility: excluded group '%s' not found/deprecated", code)
                unresolved = True

        # Add explicit excluded countries
        excluded |= {c.upper() for c in excluded_countries}

        resolved = sorted(included - excluded)

        if owns_session:
            await db.commit()

        return resolved, unresolved

    finally:
        if owns_session and db_cm is not None:
            await db_cm.close()


# ── Country gate (match engine integration) ────────────────────────

def passes_country_gate(
    user_nationality: Optional[str],
    user_residency: Optional[str],
    eligibility_basis: str,
    resolved_countries: list[str],
    eligibility_unresolved: bool,
) -> bool:
    """Boolean pass/fail gate evaluated BEFORE soft fit scoring.

    Args:
        user_nationality: ISO 3166-1 alpha-2 code of user's citizenship
        user_residency: ISO 3166-1 alpha-2 code of user's current residence
        eligibility_basis: 'citizenship', 'residency', or 'either'
        resolved_countries: list of eligible ISO codes from scholarship
        eligibility_unresolved: True if data was incomplete

    Returns:
        True if user passes the gate (eligible or unresolved/missing data).
        False only if resolved data clearly excludes the user.
    """
    # Fail-open for unresolved — flag in admin, don't silently exclude
    if eligibility_unresolved:
        return True

    # No restrictions → open to all
    if not resolved_countries:
        return True

    candidates = []
    nat = (user_nationality or "").upper()
    res = (user_residency or "").upper()

    if eligibility_basis in ("citizenship", "either") and nat:
        candidates.append(nat)
    if eligibility_basis in ("residency", "either") and res:
        candidates.append(res)

    if not candidates:
        return True  # no user data → fail open

    resolved_set = set(resolved_countries)
    return any(c in resolved_set for c in candidates)


# ── Re-resolution job ──────────────────────────────────────────────

async def re_resolve_stale_scholarships(triggering_group_code: str) -> dict:
    """Find and re-resolve all scholarships whose groups_resolved_at is older
    than any of their referenced groups' updated_at.

    Called after a group's membership changes.

    Returns: {re_resolved: int, errors: int, details: [...]}
    """
    from app.models.scholarship import Scholarship

    stats = {"re_resolved": 0, "errors": 0, "details": []}

    async with AsyncSessionLocal() as db:
        # Find scholarships that reference any group whose updated_at > groups_resolved_at
        result = await db.execute(
            text("""
                SELECT DISTINCT s.id, s.name, s.included_groups, s.excluded_groups,
                       s.included_countries, s.excluded_countries,
                       s.resolved_countries, s.groups_resolved_at
                FROM scholarships s
                WHERE s.included_groups IS NOT NULL AND array_length(s.included_groups, 1) > 0
                   OR s.excluded_groups IS NOT NULL AND array_length(s.excluded_groups, 1) > 0
            """)
        )
        rows = result.fetchall()

        for row in rows:
            sch_id = row[0]
            sch_name = row[1]
            inc_groups = row[2] or []
            exc_groups = row[3] or []
            inc_countries = row[4] or []
            exc_countries = row[5] or []
            old_count = len(row[6] or [])
            last_resolved = row[7]

            # Check if any referenced group has been updated since last resolution
            all_groups = inc_groups + exc_groups
            if not all_groups:
                continue

            needs_update = False
            if last_resolved is None:
                needs_update = True
            else:
                group_check = await db.execute(
                    text(
                        "SELECT code, updated_at FROM groups "
                        "WHERE code = ANY(:codes) AND updated_at > :last_resolved"
                    ),
                    {"codes": all_groups, "last_resolved": last_resolved},
                )
                if group_check.fetchone():
                    needs_update = True

            if not needs_update:
                continue

            # Re-resolve
            try:
                resolved, unresolved = await resolve_eligibility(
                    included_groups=inc_groups,
                    included_countries=inc_countries,
                    excluded_groups=exc_groups,
                    excluded_countries=exc_countries,
                    db=db,
                )

                await db.execute(
                    text(
                        "UPDATE scholarships SET "
                        "resolved_countries = :resolved, "
                        "eligibility_unresolved = :unresolved, "
                        "groups_resolved_at = NOW() "
                        "WHERE id = :id"
                    ),
                    {
                        "resolved": resolved,
                        "unresolved": unresolved,
                        "id": str(sch_id),
                    },
                )

                stats["re_resolved"] += 1
                stats["details"].append({
                    "scholarship_id": str(sch_id),
                    "name": sch_name,
                    "old_count": old_count,
                    "new_count": len(resolved),
                    "triggering_group": triggering_group_code,
                })

                logger.info(
                    "re-resolved scholarship %s (%s): %d → %d countries (triggered by group %s)",
                    sch_id, sch_name, old_count, len(resolved), triggering_group_code,
                )

            except Exception as e:
                stats["errors"] += 1
                logger.exception("re-resolve failed for scholarship %s: %s", sch_id, e)

        await db.commit()

    logger.info(
        "re_resolve_stale: %d re-resolved, %d errors (triggered by %s)",
        stats["re_resolved"], stats["errors"], triggering_group_code,
    )
    return stats


# ── Bulk resolve (for backfill / manual trigger) ───────────────────

async def resolve_all_scholarships() -> dict:
    """Re-resolve every scholarship. Used for backfill and manual ops trigger."""
    from app.models.scholarship import Scholarship

    stats = {"total": 0, "resolved": 0, "unresolved": 0, "errors": 0}

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Scholarship))
        scholarships = result.scalars().all()
        stats["total"] = len(scholarships)

        for sch in scholarships:
            try:
                inc_groups = list(sch.included_groups or [])
                inc_countries = list(sch.included_countries or [])
                exc_groups = list(sch.excluded_groups or [])
                exc_countries = list(sch.excluded_countries or [])

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

                if unresolved:
                    stats["unresolved"] += 1
                else:
                    stats["resolved"] += 1

            except Exception as e:
                stats["errors"] += 1
                logger.exception("resolve_all: failed for scholarship %s: %s", sch.id, e)

        await db.commit()

    logger.info("resolve_all_scholarships: %s", stats)
    return stats
