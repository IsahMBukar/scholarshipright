"""Seed script to load scholarships from JSON into the database.

Reads all `*.json` files in this directory (alphabetic order) that contain
either a top-level array of scholarship objects or `{"scholarships": [...]}`.
Existing scholarships (matched by slug) are skipped — re-runs are safe.
"""
import asyncio
import glob
import json
import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from app.db.session import AsyncSessionLocal, engine, Base
from app.models.scholarship import Scholarship

DATE_FIELDS = ["deadline", "program_start_date", "open_date"]
SEEDS_DIR = os.path.dirname(os.path.abspath(__file__))
# Files that the loader should NEVER try to ingest — they are
# config/inputs for other tools in the seeds/ pipeline (e.g. the
# scraper's `sources.json`).
SKIP_FILES = {"sources.json", "scrape_sources.json"}


def parse_dates(data: dict) -> dict:
    """Convert date strings to date objects (in place)."""
    for field in DATE_FIELDS:
        if field in data and isinstance(data[field], str):
            data[field] = date.fromisoformat(data[field])
    return data


def load_all_seed_files() -> tuple[list[dict], set[str]]:
    """Read every `*.json` file in the seeds/ directory.

    Supports two shapes per file:
      * top-level array — `[ {...}, {...} ]`
      * wrapper object — `{"scholarships": [ {...} ]}`
    Files that fail to parse are skipped with a warning so a single bad
    file doesn't take the whole loader down.
    """
    sources_used: set[str] = set()
    all_records: list[dict] = []
    for path in sorted(glob.glob(os.path.join(SEEDS_DIR, "*.json"))):
        filename = os.path.basename(path)
        if filename in SKIP_FILES:
            print(f"  ⏭️  Skipped {filename} (scraper config, not a seed file)")
            continue
        try:
            with open(path) as f:
                payload = json.load(f)
        except Exception as e:  # noqa: BLE001
            print(f"  ⚠️  Skipped {filename}: parse error ({e})")
            continue
        if isinstance(payload, list):
            records = payload
        elif isinstance(payload, dict) and "scholarships" in payload:
            records = payload["scholarships"]
        else:
            print(f"  ⚠️  Skipped {filename}: unknown shape (expected list or {{'scholarships': [...]}})")
            continue
        all_records.extend({"_source_file": filename, **r} for r in records)
        sources_used.add(filename)
        print(f"  📄 {filename}: {len(records)} records")
    return all_records, sources_used


async def seed_scholarships() -> int:
    """Seed scholarships from all JSON files in this directory. Returns
    the number of new scholarships inserted (existing-by-slug skipped)."""
    # Create tables if they don't exist
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    records, sources_used = load_all_seed_files()
    if not records:
        print("\n⚠️  No scholarship records found in seeds/*.json")
        return 0

    async with AsyncSessionLocal() as session:
        count = 0
        skipped = 0
        for data in records:
            source_file = data.pop("_source_file", "?")
            slug = data.get("slug")
            if not slug:
                print(f"  ⚠️  Skipped (no slug) in {source_file}: {data.get('name', '?')}")
                skipped += 1
                continue

            # Check if already exists (idempotent by slug)
            result = await session.execute(
                select(Scholarship).where(Scholarship.slug == slug)
            )
            if result.scalar_one_or_none():
                print(f"  ⏭️  Skipping (exists): {slug}")
                skipped += 1
                continue

            # Convert date strings to date objects
            data = parse_dates(data)

            scholarship = Scholarship(**data)
            session.add(scholarship)
            count += 1
            print(f"  ✅ Added ({source_file}): {data['name']}")

        await session.commit()
        print(f"\n🎉 Seeded {count} new scholarships ({skipped} skipped) from "
              f"{len(sources_used)} file(s)")
        return count


if __name__ == "__main__":
    asyncio.run(seed_scholarships())
