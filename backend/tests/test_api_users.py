"""
Tests for user profile: model fields, profile CRUD, scoping.
"""
import uuid
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.user import User
from app.models.profile import Profile


@pytest_asyncio.fixture
async def sample_user(db: AsyncSession) -> User:
    user = User(id=uuid.uuid4(), email=f"user-{uuid.uuid4().hex[:8]}@test.com", is_active=True)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


class TestUserModel:
    """Unit tests for User model basics."""

    async def test_create_user(self, db: AsyncSession):
        user = User(
            id=uuid.uuid4(),
            email="newuser@test.com",
            full_name="Test User",
            password_hash="hashed",
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

        assert user.is_active is True
        assert user.is_admin is False
        assert user.admin_role is None
        assert user.match_dirty is True
        assert user.auth_provider == "local"

    async def test_unique_email(self, db: AsyncSession):
        u1 = User(id=uuid.uuid4(), email="dup@test.com")
        db.add(u1)
        await db.commit()

        u2 = User(id=uuid.uuid4(), email="dup@test.com")
        db.add(u2)
        with pytest.raises(Exception):
            await db.commit()
        await db.rollback()

    async def test_admin_role_fields(self, db: AsyncSession):
        user = User(
            id=uuid.uuid4(),
            email="admin@test.com",
            is_admin=True,
            admin_role="super_admin",
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

        assert user.is_admin is True
        assert user.admin_role == "super_admin"


class TestProfileModel:
    """Unit tests for Profile model."""

    async def test_create_profile(self, db: AsyncSession, sample_user):
        profile = Profile(
            user_id=sample_user.id,
            country_of_origin="Nigeria",
            nationality_code="NG",
            degree_level="master",
            field_of_study="Computer Science",
        )
        db.add(profile)
        await db.commit()
        await db.refresh(profile)

        assert profile.country_of_origin == "Nigeria"
        assert profile.nationality_code == "NG"
        assert profile.degree_level == "master"

    async def test_profile_update(self, db: AsyncSession, sample_user):
        profile = Profile(user_id=sample_user.id, country_of_origin="Nigeria", degree_level="bachelor")
        db.add(profile)
        await db.commit()

        profile.degree_level = "phd"
        profile.field_of_study = "AI"
        await db.commit()
        await db.refresh(profile)

        assert profile.degree_level == "phd"
        assert profile.field_of_study == "AI"

    async def test_user_scoping(self, db: AsyncSession):
        u1 = User(id=uuid.uuid4(), email=f"p1-{uuid.uuid4().hex[:6]}@test.com")
        u2 = User(id=uuid.uuid4(), email=f"p2-{uuid.uuid4().hex[:6]}@test.com")
        db.add_all([u1, u2])
        await db.commit()

        db.add(Profile(user_id=u1.id, country_of_origin="Kenya"))
        await db.commit()

        result = await db.execute(select(Profile).where(Profile.user_id == u2.id))
        assert result.scalar_one_or_none() is None

    async def test_profile_not_found(self, db: AsyncSession, sample_user):
        result = await db.execute(select(Profile).where(Profile.user_id == sample_user.id))
        assert result.scalar_one_or_none() is None
