"""
Tests for notifications: model CRUD, read/unread, user scoping.
"""
import uuid
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update

from app.models.user import User
from app.models.notification import Notification


@pytest_asyncio.fixture
async def sample_user(db: AsyncSession) -> User:
    user = User(id=uuid.uuid4(), email=f"notif-{uuid.uuid4().hex[:8]}@test.com", is_active=True)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def sample_notifications(db: AsyncSession, sample_user) -> list[Notification]:
    notifs = []
    for i in range(5):
        n = Notification(
            id=uuid.uuid4(),
            user_id=sample_user.id,
            type="deadline",
            title=f"Reminder {i}",
            message=f"Deadline in {i} days",
            is_read=(i < 2),  # first 2 are read
        )
        db.add(n)
        notifs.append(n)
    await db.commit()
    for n in notifs:
        await db.refresh(n)
    return notifs


class TestNotificationModel:
    """Unit tests for Notification model."""

    async def test_create_notification(self, db: AsyncSession, sample_user):
        n = Notification(
            id=uuid.uuid4(),
            user_id=sample_user.id,
            type="match_new",
            title="New match found",
            message="Chevening Scholarship scores 85%",
            link="/scholarships/chevening",
        )
        db.add(n)
        await db.commit()
        await db.refresh(n)

        assert n.is_read is False  # default
        assert n.type == "match_new"
        assert n.created_at is not None

    async def test_defaults(self, db: AsyncSession, sample_user):
        n = Notification(user_id=sample_user.id, title="T", message="M")
        db.add(n)
        await db.commit()
        await db.refresh(n)

        assert n.type == "deadline"  # default
        assert n.is_read is False
        assert n.link is None
        assert n.scholarship_id is None

    async def test_user_scoping(self, db: AsyncSession, sample_notifications):
        """Users only see their own notifications."""
        other = User(id=uuid.uuid4(), email=f"other-{uuid.uuid4().hex[:6]}@test.com")
        db.add(other)
        await db.commit()

        result = await db.execute(
            select(Notification).where(Notification.user_id == other.id)
        )
        assert result.scalars().all() == []

    async def test_unread_count(self, db: AsyncSession, sample_user, sample_notifications):
        result = await db.execute(
            select(func.count()).where(
                Notification.user_id == sample_user.id,
                Notification.is_read == False,
            )
        )
        unread = result.scalar()
        assert unread == 3  # 5 total, 2 read

    async def test_mark_single_read(self, db: AsyncSession, sample_user, sample_notifications):
        unread = sample_notifications[2]  # 3rd one is unread
        assert unread.is_read is False

        result = await db.execute(
            select(Notification).where(
                Notification.id == unread.id,
                Notification.user_id == sample_user.id,
            )
        )
        n = result.scalar_one()
        n.is_read = True
        await db.commit()
        await db.refresh(n)
        assert n.is_read is True

    async def test_mark_all_read(self, db: AsyncSession, sample_user, sample_notifications):
        await db.execute(
            update(Notification)
            .where(Notification.user_id == sample_user.id, Notification.is_read == False)
            .values(is_read=True)
        )
        await db.commit()

        result = await db.execute(
            select(func.count()).where(
                Notification.user_id == sample_user.id,
                Notification.is_read == False,
            )
        )
        assert result.scalar() == 0

    async def test_delete_notification(self, db: AsyncSession, sample_user, sample_notifications):
        to_delete = sample_notifications[0]
        result = await db.execute(
            select(Notification).where(
                Notification.id == to_delete.id,
                Notification.user_id == sample_user.id,
            )
        )
        n = result.scalar_one()
        await db.delete(n)
        await db.commit()

        result = await db.execute(
            select(Notification).where(Notification.id == to_delete.id)
        )
        assert result.scalar_one_or_none() is None
