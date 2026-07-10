"""
Tests for saved scholarships: model CRUD + status transitions.
"""
import uuid
import pytest
import pytest_asyncio
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.user import User
from app.models.scholarship import Scholarship
from app.models.saved_scholarship import SavedScholarship


@pytest_asyncio.fixture
async def sample_user(db: AsyncSession) -> User:
    user = User(id=uuid.uuid4(), email=f"saved-{uuid.uuid4().hex[:8]}@test.com", is_active=True)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def sample_sch_for_save(db: AsyncSession) -> Scholarship:
    sch = Scholarship(
        id=uuid.uuid4(),
        name="Save Test Scholarship",
        slug="save-test-" + uuid.uuid4().hex[:6],
        host_country="Germany",
        host_institution="TU Munich",
        provider="DAAD",
        degree_levels=["master"],
        funding_type="fully_funded",
        deadline=date(2027, 3, 1),
        official_url="https://example.com/save-test",
        is_active=True,
    )
    db.add(sch)
    await db.commit()
    await db.refresh(sch)
    return sch


class TestSavedScholarshipModel:
    """Unit tests for SavedScholarship model."""

    async def test_create_saved(self, db: AsyncSession, sample_user, sample_sch_for_save):
        saved = SavedScholarship(
            id=uuid.uuid4(),
            user_id=sample_user.id,
            scholarship_id=sample_sch_for_save.id,
        )
        db.add(saved)
        await db.commit()
        await db.refresh(saved)

        assert saved.status == "saved"  # default
        assert saved.reminder_enabled is True  # default
        assert saved.notes is None

    async def test_status_transition(self, db: AsyncSession, sample_user, sample_sch_for_save):
        saved = SavedScholarship(
            user_id=sample_user.id,
            scholarship_id=sample_sch_for_save.id,
            status="saved",
        )
        db.add(saved)
        await db.commit()

        # Transition through statuses
        for new_status in ["applying", "applied", "reviewing", "accepted"]:
            saved.status = new_status
            await db.commit()
            await db.refresh(saved)
            assert saved.status == new_status

    async def test_unique_constraint(self, db: AsyncSession, sample_user, sample_sch_for_save):
        s1 = SavedScholarship(user_id=sample_user.id, scholarship_id=sample_sch_for_save.id)
        db.add(s1)
        await db.commit()

        s2 = SavedScholarship(user_id=sample_user.id, scholarship_id=sample_sch_for_save.id)
        db.add(s2)
        with pytest.raises(Exception):  # UniqueViolation
            await db.commit()
        await db.rollback()

    async def test_notes_field(self, db: AsyncSession, sample_user, sample_sch_for_save):
        saved = SavedScholarship(
            user_id=sample_user.id,
            scholarship_id=sample_sch_for_save.id,
            notes="Priority — apply before March",
        )
        db.add(saved)
        await db.commit()
        await db.refresh(saved)
        assert saved.notes == "Priority — apply before March"

    async def test_user_scoping(self, db: AsyncSession, sample_sch_for_save):
        """Each user only sees their own saved scholarships."""
        u1 = User(id=uuid.uuid4(), email=f"u1-{uuid.uuid4().hex[:6]}@test.com")
        u2 = User(id=uuid.uuid4(), email=f"u2-{uuid.uuid4().hex[:6]}@test.com")
        db.add_all([u1, u2])
        await db.commit()

        s1 = SavedScholarship(user_id=u1.id, scholarship_id=sample_sch_for_save.id)
        db.add(s1)
        await db.commit()

        result = await db.execute(
            select(SavedScholarship).where(SavedScholarship.user_id == u2.id)
        )
        assert result.scalars().all() == []
