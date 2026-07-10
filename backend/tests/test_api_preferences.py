"""
Tests for notification preferences: defaults, get_or_create, partial update.
"""
import uuid
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.user import User
from app.models.notification_preference import NotificationPreference, get_or_create_preferences


@pytest_asyncio.fixture
async def sample_user(db: AsyncSession) -> User:
    user = User(id=uuid.uuid4(), email=f"pref-{uuid.uuid4().hex[:8]}@test.com", is_active=True)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


class TestNotificationPreferenceModel:
    """Unit tests for NotificationPreference model + get_or_create helper."""

    async def test_create_with_defaults(self, db: AsyncSession, sample_user):
        prefs = NotificationPreference(user_id=sample_user.id)
        db.add(prefs)
        await db.commit()
        await db.refresh(prefs)

        assert prefs.email_new_matches is True
        assert prefs.email_match_improvements is True
        assert prefs.email_deadline_reminders is True
        assert prefs.email_weekly_digest is True
        assert prefs.email_marketing is True

    async def test_get_or_create_creates(self, db: AsyncSession, sample_user):
        """get_or_create should create defaults when none exist."""
        result = await db.execute(
            select(NotificationPreference).where(NotificationPreference.user_id == sample_user.id)
        )
        assert result.scalar_one_or_none() is None

        prefs = await get_or_create_preferences(db, sample_user.id)
        assert prefs.email_new_matches is True
        assert prefs.user_id == sample_user.id

    async def test_get_or_create_returns_existing(self, db: AsyncSession, sample_user):
        """get_or_create should return existing row, not create a duplicate."""
        existing = NotificationPreference(user_id=sample_user.id, email_marketing=False)
        db.add(existing)
        await db.commit()

        prefs = await get_or_create_preferences(db, sample_user.id)
        assert prefs.id == existing.id
        assert prefs.email_marketing is False

    async def test_partial_update(self, db: AsyncSession, sample_user):
        """Updating one field should not clobber others."""
        prefs = NotificationPreference(user_id=sample_user.id)
        db.add(prefs)
        await db.commit()

        prefs.email_marketing = False
        prefs.email_weekly_digest = False
        await db.commit()
        await db.refresh(prefs)

        assert prefs.email_marketing is False
        assert prefs.email_weekly_digest is False
        # Others should still be default
        assert prefs.email_new_matches is True
        assert prefs.email_deadline_reminders is True

    async def test_unique_per_user(self, db: AsyncSession, sample_user):
        """Only one preference row per user."""
        p1 = NotificationPreference(user_id=sample_user.id)
        db.add(p1)
        await db.commit()

        p2 = NotificationPreference(user_id=sample_user.id)
        db.add(p2)
        with pytest.raises(Exception):
            await db.commit()
        await db.rollback()

    async def test_user_scoping(self, db: AsyncSession):
        """Preferences are per-user — other users don't see them."""
        u1 = User(id=uuid.uuid4(), email=f"p1-{uuid.uuid4().hex[:6]}@test.com")
        u2 = User(id=uuid.uuid4(), email=f"p2-{uuid.uuid4().hex[:6]}@test.com")
        db.add_all([u1, u2])
        await db.commit()

        db.add(NotificationPreference(user_id=u1.id, email_marketing=False))
        await db.commit()

        result = await db.execute(
            select(NotificationPreference).where(NotificationPreference.user_id == u2.id)
        )
        assert result.scalar_one_or_none() is None
