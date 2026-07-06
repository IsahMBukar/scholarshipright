"""Tests for scholarship CRUD operations — DB-level only."""
import uuid
from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.models.scholarship import Scholarship


class TestScholarshipCRUD:
    @pytest.mark.asyncio
    async def test_create_and_query(self, db):
        sch = Scholarship(
            name="CRUD Test", slug="crud-test", host_country="Canada",
            funding_type="fully_funded", deadline=date(2026, 8, 1),
            official_url="https://example.com/crud", degree_levels=["master", "phd"],
        )
        db.add(sch)
        await db.commit()
        result = await db.execute(select(Scholarship).where(Scholarship.slug == "crud-test"))
        assert result.scalar_one().name == "CRUD Test"

    @pytest.mark.asyncio
    async def test_update_scholarship(self, db, sample_scholarship):
        sample_scholarship.name = "Updated Name"
        sample_scholarship.monthly_stipend_usd = 2000
        await db.commit()
        result = await db.execute(select(Scholarship).where(Scholarship.id == sample_scholarship.id))
        assert result.scalar_one().name == "Updated Name"

    @pytest.mark.asyncio
    async def test_soft_delete(self, db, sample_scholarship):
        sample_scholarship.is_active = False
        await db.commit()
        result = await db.execute(select(Scholarship).where(Scholarship.id == sample_scholarship.id))
        assert result.scalar_one().is_active is False

    @pytest.mark.asyncio
    async def test_slug_uniqueness(self, db, sample_scholarship):
        duplicate = Scholarship(
            name="Dup", slug=sample_scholarship.slug, host_country="USA",
            funding_type="partial", deadline=date(2026, 12, 1), official_url="https://x.com",
        )
        db.add(duplicate)
        with pytest.raises(IntegrityError):
            await db.commit()

    @pytest.mark.asyncio
    async def test_search_by_name(self, db, sample_scholarship):
        result = await db.execute(select(Scholarship).where(Scholarship.name.ilike("%test%")))
        assert any(s.slug == "test-scholarship" for s in result.scalars().all())

    @pytest.mark.asyncio
    async def test_filter_by_country(self, db, sample_scholarship):
        result = await db.execute(select(Scholarship).where(Scholarship.host_country == "United Kingdom"))
        assert len(result.scalars().all()) >= 1

    @pytest.mark.asyncio
    async def test_filter_by_funding_type(self, db, sample_scholarship):
        result = await db.execute(select(Scholarship).where(Scholarship.funding_type == "fully_funded"))
        assert len(result.scalars().all()) >= 1
