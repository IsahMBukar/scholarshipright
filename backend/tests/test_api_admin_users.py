"""
Tests for admin user management: role changes, protections, scoping.
"""
import uuid
import pytest
import pytest_asyncio
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.user import User
from app.models.admin_audit import AdminAuditLog


@pytest_asyncio.fixture
async def super_admin(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"superadmin-{uuid.uuid4().hex[:6]}@test.com",
        is_active=True,
        is_admin=True,
        admin_role="super_admin",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def support_staff(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"staff-{uuid.uuid4().hex[:6]}@test.com",
        is_active=True,
        is_admin=True,
        admin_role="support_staff",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def normal_user(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"user-{uuid.uuid4().hex[:6]}@test.com",
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


class TestAdminRoleModel:
    """Unit tests for admin role logic at the model level."""

    async def test_promote_to_support_staff(self, db: AsyncSession, normal_user):
        normal_user.is_admin = True
        normal_user.admin_role = "support_staff"
        await db.commit()
        await db.refresh(normal_user)

        assert normal_user.is_admin is True
        assert normal_user.admin_role == "support_staff"

    async def test_promote_to_super_admin(self, db: AsyncSession, normal_user):
        normal_user.is_admin = True
        normal_user.admin_role = "super_admin"
        await db.commit()
        await db.refresh(normal_user)

        assert normal_user.is_admin is True
        assert normal_user.admin_role == "super_admin"

    async def test_demote_to_normal_user(self, db: AsyncSession, support_staff):
        support_staff.is_admin = False
        support_staff.admin_role = None
        await db.commit()
        await db.refresh(support_staff)

        assert support_staff.is_admin is False
        assert support_staff.admin_role is None

    async def test_admin_role_fields_default(self, db: AsyncSession):
        user = User(id=uuid.uuid4(), email=f"def-{uuid.uuid4().hex[:6]}@test.com")
        db.add(user)
        await db.commit()
        await db.refresh(user)

        assert user.is_admin is False
        assert user.admin_role is None

    async def test_count_super_admins(self, db: AsyncSession, super_admin, support_staff):
        """Can count super_admins for lock-out protection."""
        from sqlalchemy import func, and_

        n = (await db.execute(
            select(func.count(User.id)).where(
                and_(User.is_admin == True, User.admin_role == "super_admin")
            )
        )).scalar_one()
        assert n == 1  # only super_admin fixture


class TestAdminAuditLog:
    """Unit tests for the audit log model."""

    async def test_create_audit_entry(self, db: AsyncSession, super_admin):
        entry = AdminAuditLog(
            id=uuid.uuid4(),
            admin_id=super_admin.id,
            admin_email=super_admin.email,
            action="user.update",
            target_type="user",
            target_id=str(uuid.uuid4()),
            payload={"changes": {"is_active": {"old": True, "new": False}}},
        )
        db.add(entry)
        await db.commit()
        await db.refresh(entry)

        assert entry.action == "user.update"
        assert entry.target_type == "user"
        assert entry.payload["changes"]["is_active"]["new"] is False
        assert entry.created_at is not None

    async def test_audit_defaults(self, db: AsyncSession):
        entry = AdminAuditLog(
            action="scholarship.create",
            target_type="scholarship",
        )
        db.add(entry)
        await db.commit()
        await db.refresh(entry)

        assert entry.admin_id is None  # nullable
        assert entry.payload is None
        assert entry.created_at is not None

    async def test_audit_filter_by_action(self, db: AsyncSession, super_admin):
        for action in ["user.update", "scholarship.create", "user.update"]:
            db.add(AdminAuditLog(
                admin_id=super_admin.id,
                action=action,
                target_type="test",
            ))
        await db.commit()

        result = await db.execute(
            select(AdminAuditLog).where(AdminAuditLog.action == "user.update")
        )
        entries = result.scalars().all()
        assert len(entries) == 2

    async def test_audit_filter_by_target_type(self, db: AsyncSession, super_admin):
        for tt in ["user", "scholarship", "user", "group"]:
            db.add(AdminAuditLog(
                admin_id=super_admin.id,
                action="test.action",
                target_type=tt,
            ))
        await db.commit()

        result = await db.execute(
            select(AdminAuditLog).where(AdminAuditLog.target_type == "user")
        )
        assert len(result.scalars().all()) == 2
