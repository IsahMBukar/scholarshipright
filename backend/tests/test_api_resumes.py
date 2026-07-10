"""
Tests for resume model: CRUD, status transitions, primary flag, user scoping.
"""
import uuid
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.user import User
from app.models.resume import Resume


@pytest_asyncio.fixture
async def sample_user(db: AsyncSession) -> User:
    user = User(id=uuid.uuid4(), email=f"resume-{uuid.uuid4().hex[:8]}@test.com", is_active=True)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def sample_resume(db: AsyncSession, sample_user) -> Resume:
    resume = Resume(
        id=uuid.uuid4(),
        user_id=sample_user.id,
        title="My CV",
        status="completed",
        full_name="Test User",
        email="test@example.com",
        skills=["Python", "SQL"],
        education=[{"degree": "BSc", "institution": "MIT", "year": 2023}],
        experience=[{"title": "Intern", "company": "Google", "years": 1}],
    )
    db.add(resume)
    await db.commit()
    await db.refresh(resume)
    return resume


class TestResumeModel:
    """Unit tests for Resume model."""

    async def test_create_resume(self, db: AsyncSession, sample_user):
        resume = Resume(
            id=uuid.uuid4(),
            user_id=sample_user.id,
            title="Fresh CV",
        )
        db.add(resume)
        await db.commit()
        await db.refresh(resume)

        assert resume.status == "uploading"  # default
        assert resume.is_primary is False  # default
        assert resume.title == "Fresh CV"

    async def test_status_transitions(self, db: AsyncSession, sample_user):
        resume = Resume(user_id=sample_user.id, title="CV")
        db.add(resume)
        await db.commit()

        for new_status in ["analyzing", "completed"]:
            resume.status = new_status
            await db.commit()
            await db.refresh(resume)
            assert resume.status == new_status

    async def test_error_status(self, db: AsyncSession, sample_user):
        resume = Resume(user_id=sample_user.id, title="Bad CV", status="error")
        db.add(resume)
        await db.commit()
        await db.refresh(resume)

        assert resume.status == "error"

    async def test_structured_data(self, db: AsyncSession, sample_resume):
        assert "Python" in sample_resume.skills
        assert sample_resume.education[0]["degree"] == "BSc"
        assert sample_resume.experience[0]["company"] == "Google"

    async def test_primary_flag(self, db: AsyncSession, sample_user):
        r1 = Resume(user_id=sample_user.id, title="Old CV", is_primary=True)
        r2 = Resume(user_id=sample_user.id, title="New CV", is_primary=False)
        db.add_all([r1, r2])
        await db.commit()

        # Promote r2 to primary
        r1.is_primary = False
        r2.is_primary = True
        await db.commit()
        await db.refresh(r1)
        await db.refresh(r2)

        assert r1.is_primary is False
        assert r2.is_primary is True

    async def test_user_scoping(self, db: AsyncSession):
        u1 = User(id=uuid.uuid4(), email=f"r1-{uuid.uuid4().hex[:6]}@test.com")
        u2 = User(id=uuid.uuid4(), email=f"r2-{uuid.uuid4().hex[:6]}@test.com")
        db.add_all([u1, u2])
        await db.commit()

        db.add(Resume(user_id=u1.id, title="u1 CV"))
        await db.commit()

        result = await db.execute(select(Resume).where(Resume.user_id == u2.id))
        assert result.scalars().all() == []

    async def test_analysis_fields(self, db: AsyncSession, sample_resume):
        """Resume can store AI analysis results."""
        sample_resume.overall_score = 78
        sample_resume.section_scores = {"education": 85, "experience": 70, "skills": 80}
        sample_resume.issues = ["Missing phone number", "No publications"]
        sample_resume.ai_suggestions = "Add more detail to your research section."
        await db.commit()
        await db.refresh(sample_resume)

        assert sample_resume.overall_score == 78
        assert sample_resume.section_scores["education"] == 85
        assert len(sample_resume.issues) == 2
