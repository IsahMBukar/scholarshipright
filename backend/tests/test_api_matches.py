"""
Tests for match scores: model CRUD + query patterns.
"""
import uuid
import pytest
import pytest_asyncio
from datetime import date, datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.user import User
from app.models.scholarship import Scholarship
from app.models.match_score import MatchScore


@pytest_asyncio.fixture
async def sample_user(db: AsyncSession) -> User:
    user = User(id=uuid.uuid4(), email=f"match-{uuid.uuid4().hex[:8]}@test.com", is_active=True)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def sample_sch(db: AsyncSession) -> Scholarship:
    sch = Scholarship(
        id=uuid.uuid4(),
        name="Match Test Scholarship",
        slug="match-test-" + uuid.uuid4().hex[:6],
        host_country="UK",
        host_institution="Oxford",
        provider="Rhodes Trust",
        degree_levels=["phd"],
        funding_type="fully_funded",
        deadline=date(2027, 9, 1),
        official_url="https://example.com/match-test",
        is_active=True,
    )
    db.add(sch)
    await db.commit()
    await db.refresh(sch)
    return sch


class TestMatchScoreModel:
    """Unit tests for MatchScore model."""

    async def test_create_match_score(self, db: AsyncSession, sample_user, sample_sch):
        ms = MatchScore(
            id=uuid.uuid4(),
            user_id=sample_user.id,
            scholarship_id=sample_sch.id,
            score=85.50,
            breakdown={"semantic": 72, "field": 10, "country": 10, "language": 3},
        )
        db.add(ms)
        await db.commit()
        await db.refresh(ms)

        assert float(ms.score) == 85.50
        assert ms.breakdown["semantic"] == 72
        assert ms.computed_at is not None

    async def test_unique_constraint(self, db: AsyncSession, sample_user, sample_sch):
        m1 = MatchScore(user_id=sample_user.id, scholarship_id=sample_sch.id, score=80)
        db.add(m1)
        await db.commit()

        m2 = MatchScore(user_id=sample_user.id, scholarship_id=sample_sch.id, score=90)
        db.add(m2)
        with pytest.raises(Exception):
            await db.commit()
        await db.rollback()

    async def test_query_sorted_by_score(self, db: AsyncSession, sample_user):
        """Match scores should be retrievable sorted by score descending."""
        schs = []
        for i, (name, score) in enumerate([("High", 95), ("Mid", 60), ("Low", 30)]):
            s = Scholarship(
                id=uuid.uuid4(),
                name=f"{name} Scholarship",
                slug=f"sort-{name.lower()}-{uuid.uuid4().hex[:4]}",
                host_country="US",
                host_institution="MIT",
                provider="MIT",
                degree_levels=["master"],
                funding_type="fully_funded",
                deadline=date(2027, 6, 1),
                official_url="https://example.com/sort-test",
                is_active=True,
            )
            db.add(s)
            schs.append((s, score))
        await db.commit()

        for s, score in schs:
            await db.refresh(s)
            ms = MatchScore(user_id=sample_user.id, scholarship_id=s.id, score=score)
            db.add(ms)
        await db.commit()

        result = await db.execute(
            select(MatchScore)
            .where(MatchScore.user_id == sample_user.id)
            .order_by(MatchScore.score.desc())
        )
        scores = [float(r.score) for r in result.scalars().all()]
        assert scores == [95.0, 60.0, 30.0]

    async def test_score_update(self, db: AsyncSession, sample_user, sample_sch):
        ms = MatchScore(user_id=sample_user.id, scholarship_id=sample_sch.id, score=50)
        db.add(ms)
        await db.commit()

        ms.score = 75
        ms.breakdown = {"semantic": 65, "field": 10}
        await db.commit()
        await db.refresh(ms)

        assert float(ms.score) == 75
        assert ms.breakdown["semantic"] == 65

    async def test_user_scoping(self, db: AsyncSession, sample_sch):
        u1 = User(id=uuid.uuid4(), email=f"ms1-{uuid.uuid4().hex[:6]}@test.com")
        u2 = User(id=uuid.uuid4(), email=f"ms2-{uuid.uuid4().hex[:6]}@test.com")
        db.add_all([u1, u2])
        await db.commit()

        db.add(MatchScore(user_id=u1.id, scholarship_id=sample_sch.id, score=88))
        await db.commit()

        result = await db.execute(select(MatchScore).where(MatchScore.user_id == u2.id))
        assert result.scalars().all() == []
