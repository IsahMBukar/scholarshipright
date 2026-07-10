"""
Tests for reminders, unsubscribe, and admin_matches service logic.

These modules are thin API wrappers — the underlying models (SavedScholarship,
NotificationPreference) are already tested. This file covers the service-level
logic unique to each module.
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
from app.models.notification_preference import NotificationPreference, get_or_create_preferences


@pytest_asyncio.fixture
async def sample_user(db: AsyncSession) -> User:
    user = User(id=uuid.uuid4(), email=f"remain-{uuid.uuid4().hex[:8]}@test.com", is_active=True)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def sample_sch(db: AsyncSession) -> Scholarship:
    sch = Scholarship(
        id=uuid.uuid4(),
        name="Reminder Test",
        slug="reminder-" + uuid.uuid4().hex[:6],
        host_country="US",
        host_institution="MIT",
        provider="MIT",
        degree_levels=["master"],
        funding_type="fully_funded",
        official_url="https://example.com/reminder",
        deadline=date(2027, 5, 1),
        is_active=True,
    )
    db.add(sch)
    await db.commit()
    await db.refresh(sch)
    return sch


class TestReminderLogic:
    """Tests for the reminder_enabled toggle on SavedScholarship."""

    async def test_default_reminder_enabled(self, db: AsyncSession, sample_user, sample_sch):
        saved = SavedScholarship(user_id=sample_user.id, scholarship_id=sample_sch.id)
        db.add(saved)
        await db.commit()
        await db.refresh(saved)
        assert saved.reminder_enabled is True

    async def test_disable_reminder(self, db: AsyncSession, sample_user, sample_sch):
        saved = SavedScholarship(user_id=sample_user.id, scholarship_id=sample_sch.id)
        db.add(saved)
        await db.commit()

        saved.reminder_enabled = False
        await db.commit()
        await db.refresh(saved)
        assert saved.reminder_enabled is False

    async def test_re_enable_reminder(self, db: AsyncSession, sample_user, sample_sch):
        saved = SavedScholarship(
            user_id=sample_user.id,
            scholarship_id=sample_sch.id,
            reminder_enabled=False,
        )
        db.add(saved)
        await db.commit()

        saved.reminder_enabled = True
        await db.commit()
        await db.refresh(saved)
        assert saved.reminder_enabled is True

    async def test_list_reminders_query(self, db: AsyncSession, sample_user, sample_sch):
        """The reminders endpoint filters by reminder_enabled=True."""
        s1 = SavedScholarship(user_id=sample_user.id, scholarship_id=sample_sch.id, reminder_enabled=True)
        db.add(s1)
        await db.commit()

        result = await db.execute(
            select(SavedScholarship).where(
                SavedScholarship.user_id == sample_user.id,
                SavedScholarship.reminder_enabled == True,
            )
        )
        assert len(result.scalars().all()) == 1

        s1.reminder_enabled = False
        await db.commit()

        result = await db.execute(
            select(SavedScholarship).where(
                SavedScholarship.user_id == sample_user.id,
                SavedScholarship.reminder_enabled == True,
            )
        )
        assert len(result.scalars().all()) == 0


class TestUnsubscribeLogic:
    """Tests for unsubscribe category mapping and preference toggling."""

    async def test_category_map_completeness(self):
        """CATEGORY_MAP should cover all preference columns."""
        from app.services.unsubscribe import CATEGORY_MAP

        expected_cols = {
            "email_new_matches",
            "email_match_improvements",
            "email_deadline_reminders",
            "email_weekly_digest",
            "email_marketing",
        }
        assert set(CATEGORY_MAP.values()) == expected_cols

    async def test_unsubscribe_single_category(self, db: AsyncSession, sample_user):
        """Toggling one category off should leave others intact."""
        prefs = await get_or_create_preferences(db, sample_user.id)
        assert prefs.email_marketing is True

        prefs.email_marketing = False
        await db.commit()
        await db.refresh(prefs)

        assert prefs.email_marketing is False
        assert prefs.email_new_matches is True
        assert prefs.email_deadline_reminders is True

    async def test_unsubscribe_all(self, db: AsyncSession, sample_user):
        """Setting all categories to False."""
        prefs = await get_or_create_preferences(db, sample_user.id)

        from app.services.unsubscribe import CATEGORY_MAP
        for col in CATEGORY_MAP.values():
            setattr(prefs, col, False)
        await db.commit()
        await db.refresh(prefs)

        for col in CATEGORY_MAP.values():
            assert getattr(prefs, col) is False


class TestAdminMatchesTokenLogic:
    """Tests for the admin token validation in admin_matches."""

    def test_require_token_when_not_configured(self):
        """Should reject when MATCH_ADMIN_TOKEN is not set."""
        import os
        from unittest.mock import patch
        from fastapi import HTTPException

        with patch.dict(os.environ, {"MATCH_ADMIN_TOKEN": ""}):
            from app.api.admin_matches import _require_admin_token
            with pytest.raises(HTTPException) as exc_info:
                _require_admin_token("some-token")
            assert exc_info.value.status_code == 503

    def test_require_token_invalid(self):
        """Should reject invalid token."""
        import os
        from unittest.mock import patch
        from fastapi import HTTPException

        with patch.dict(os.environ, {"MATCH_ADMIN_TOKEN": "real-token"}):
            from app.api.admin_matches import _require_admin_token
            with pytest.raises(HTTPException) as exc_info:
                _require_admin_token("wrong-token")
            assert exc_info.value.status_code == 401

    def test_require_token_valid(self):
        """Should pass with correct token."""
        import os
        from unittest.mock import patch

        with patch.dict(os.environ, {"MATCH_ADMIN_TOKEN": "real-token"}):
            from app.api.admin_matches import _require_admin_token
            _require_admin_token("real-token")  # should not raise

    def test_require_token_none(self):
        """Should reject when no token provided."""
        import os
        from unittest.mock import patch
        from fastapi import HTTPException

        with patch.dict(os.environ, {"MATCH_ADMIN_TOKEN": "real-token"}):
            from app.api.admin_matches import _require_admin_token
            with pytest.raises(HTTPException) as exc_info:
                _require_admin_token(None)
            assert exc_info.value.status_code == 401
