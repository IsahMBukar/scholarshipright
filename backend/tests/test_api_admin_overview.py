"""
Tests for admin overview dependencies: Country model, admin analytics data shapes.
"""
import uuid
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.user import User
from app.models.scholarship import Scholarship
from app.models.country import Country
from datetime import date


@pytest_asyncio.fixture
async def sample_countries(db: AsyncSession) -> list[Country]:
    countries = [
        Country(code="US", name="United States", iso3="USA"),
        Country(code="GB", name="United Kingdom", iso3="GBR"),
        Country(code="DE", name="Germany", iso3="DEU"),
    ]
    db.add_all(countries)
    await db.commit()
    for c in countries:
        await db.refresh(c)
    return countries


class TestCountryModel:
    """Unit tests for Country reference table."""

    async def test_create_country(self, db: AsyncSession):
        c = Country(code="FR", name="France", iso3="FRA")
        db.add(c)
        await db.commit()
        await db.refresh(c)

        assert c.code == "FR"
        assert c.name == "France"
        assert c.iso3 == "FRA"

    async def test_pk_is_code(self, db: AsyncSession, sample_countries):
        result = await db.execute(select(Country).where(Country.code == "US"))
        c = result.scalar_one()
        assert c.name == "United States"

    async def test_unique_code(self, db: AsyncSession, sample_countries):
        dup = Country(code="US", name="Duplicate")
        db.add(dup)
        with pytest.raises(Exception):
            await db.commit()
        await db.rollback()

    async def test_list_all(self, db: AsyncSession, sample_countries):
        result = await db.execute(select(Country).order_by(Country.name))
        names = [c.name for c in result.scalars().all()]
        assert names == ["Germany", "United Kingdom", "United States"]

    async def test_search_by_name(self, db: AsyncSession, sample_countries):
        like = "%germany%"
        result = await db.execute(
            select(Country).where(func.lower(Country.name).like(like))
        )
        c = result.scalar_one()
        assert c.code == "DE"


class TestAdminOverviewData:
    """Tests for the data shapes the overview endpoint relies on."""

    async def test_user_count_query(self, db: AsyncSession):
        for i in range(3):
            db.add(User(id=uuid.uuid4(), email=f"ov-{i}-{uuid.uuid4().hex[:4]}@test.com"))
        await db.commit()

        count = (await db.execute(select(func.count()).select_from(User))).scalar_one()
        assert count == 3

    async def test_scholarship_count_by_funding(self, db: AsyncSession):
        for ft in ["fully_funded", "fully_funded", "partial"]:
            db.add(Scholarship(
                id=uuid.uuid4(),
                name=f"Sch-{uuid.uuid4().hex[:4]}",
                slug=f"sch-{uuid.uuid4().hex[:6]}",
                host_country="US",
                host_institution="MIT",
                provider="MIT",
                funding_type=ft,
                official_url="https://example.com",
                deadline=date(2027, 1, 1),
                is_active=True,
            ))
        await db.commit()

        result = await db.execute(
            select(Scholarship.funding_type, func.count())
            .group_by(Scholarship.funding_type)
        )
        counts = {row[0]: row[1] for row in result.all()}
        assert counts["fully_funded"] == 2
        assert counts["partial"] == 1
