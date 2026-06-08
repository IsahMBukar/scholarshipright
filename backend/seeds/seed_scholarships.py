"""Seed script to load scholarships from JSON into the database."""
import asyncio
import json
import sys
import os
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from app.db.session import AsyncSessionLocal, engine, Base
from app.models.scholarship import Scholarship

DATE_FIELDS = ["deadline", "program_start_date", "open_date"]


def parse_dates(data: dict) -> dict:
    """Convert date strings to date objects."""
    for field in DATE_FIELDS:
        if field in data and isinstance(data[field], str):
            data[field] = date.fromisoformat(data[field])
    return data


async def seed_scholarships():
    # Create tables if they don't exist
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Load JSON
    seeds_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "seeds", "scholarships.json")
    with open(seeds_path, "r") as f:
        scholarships_data = json.load(f)

    async with AsyncSessionLocal() as session:
        count = 0
        for data in scholarships_data:
            # Check if already exists
            result = await session.execute(
                select(Scholarship).where(Scholarship.slug == data["slug"])
            )
            if result.scalar_one_or_none():
                print(f"  ⏭️  Skipping (exists): {data['name']}")
                continue

            # Convert date strings to date objects
            data = parse_dates(data)

            scholarship = Scholarship(**data)
            session.add(scholarship)
            count += 1
            print(f"  ✅ Added: {data['name']}")

        await session.commit()
        print(f"\n🎉 Seeded {count} new scholarships ({len(scholarships_data) - count} skipped)")


if __name__ == "__main__":
    asyncio.run(seed_scholarships())
