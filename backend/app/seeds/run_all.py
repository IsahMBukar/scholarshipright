"""Seed runners for countries and groups.

Run from CLI or startup:
    python -m app.seeds.run_all

Idempotent — safe to re-run (INSERT ON CONFLICT DO NOTHING).
"""
from __future__ import annotations

import logging
from datetime import date as date_type

from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db.session import AsyncSessionLocal, engine
from app.models.country import Country
from app.models.group import Group, GroupMember
from app.seeds.countries_data import COUNTRIES
from app.seeds.groups_data import INITIAL_GROUPS

logger = logging.getLogger("scholara.seeds")


def _parse_date(s: str | None) -> date_type | None:
    """Parse ISO date string to date object."""
    if not s:
        return None
    return date_type.fromisoformat(s)


async def seed_countries() -> int:
    """Insert all ISO 3166-1 countries. Returns count inserted (0 if all exist)."""
    async with AsyncSessionLocal() as db:
        inserted = 0
        for code, name, iso3 in COUNTRIES:
            result = await db.execute(
                text(
                    "INSERT INTO countries (code, name, iso3) "
                    "VALUES (:code, :name, :iso3) "
                    "ON CONFLICT (code) DO NOTHING"
                ),
                {"code": code, "name": name, "iso3": iso3},
            )
            inserted += result.rowcount
        await db.commit()
    logger.info("seed_countries: %d new rows (total source: %d)", inserted, len(COUNTRIES))
    return inserted


async def seed_groups() -> int:
    """Insert initial groups + members. Returns count of new groups created."""
    async with AsyncSessionLocal() as db:
        created = 0
        for code, data in INITIAL_GROUPS.items():
            # Check if group already exists
            existing = (
                await db.execute(
                    text("SELECT id FROM groups WHERE code = :code"),
                    {"code": code},
                )
            ).scalar_one_or_none()

            if existing:
                # Update source info but don't touch membership
                await db.execute(
                    text(
                        "UPDATE groups SET name = :name, description = :desc, "
                        "source_url = :url, source_date = :sd WHERE code = :code"
                    ),
                    {
                        "code": code,
                        "name": data["name"],
                        "desc": data.get("description"),
                        "url": data.get("source_url"),
                        "sd": _parse_date(data.get("source_date")),
                    },
                )
                group_id = existing
            else:
                result = await db.execute(
                    text(
                        "INSERT INTO groups (code, name, description, source_url, source_date, status) "
                        "VALUES (:code, :name, :desc, :url, :sd, 'active') "
                        "RETURNING id"
                    ),
                    {
                        "code": code,
                        "name": data["name"],
                        "desc": data.get("description"),
                        "url": data.get("source_url"),
                        "sd": _parse_date(data.get("source_date")),
                    },
                )
                group_id = result.scalar_one()
                created += 1

            # Seed members (idempotent)
            for country_code in data["members"]:
                await db.execute(
                    text(
                        "INSERT INTO group_members (group_id, country_code) "
                        "VALUES (:gid, :cc) ON CONFLICT DO NOTHING"
                    ),
                    {"gid": str(group_id), "cc": country_code},
                )

        await db.commit()
    logger.info("seed_groups: %d new groups (total source: %d)", created, len(INITIAL_GROUPS))
    return created


async def run_all_seeds() -> dict:
    """Run all seeds in order. Returns counts."""
    countries = await seed_countries()
    groups = await seed_groups()
    return {"countries_inserted": countries, "groups_created": groups}
