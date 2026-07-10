"""
Tests for admin groups: Group + GroupMember model CRUD, status transitions.
"""
import uuid
import pytest
import pytest_asyncio
from datetime import date, datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.user import User
from app.models.group import Group, GroupMember
from app.models.country import Country


@pytest_asyncio.fixture
async def sample_countries(db: AsyncSession) -> list[Country]:
    countries = [
        Country(code="NG", name="Nigeria", iso3="NGA"),
        Country(code="GH", name="Ghana", iso3="GHA"),
        Country(code="KE", name="Kenya", iso3="KEN"),
        Country(code="ZA", name="South Africa", iso3="ZAF"),
    ]
    db.add_all(countries)
    await db.commit()
    for c in countries:
        await db.refresh(c)
    return countries


@pytest_asyncio.fixture
async def sample_group(db: AsyncSession, sample_countries) -> Group:
    group = Group(
        id=uuid.uuid4(),
        code="ECOWAS",
        name="ECOWAS Countries",
        description="Economic Community of West African States",
        status="active",
    )
    db.add(group)
    await db.flush()

    for cc in ["NG", "GH"]:
        db.add(GroupMember(group_id=group.id, country_code=cc))
    await db.commit()
    await db.refresh(group)
    return group


class TestGroupModel:
    """Unit tests for Group model."""

    async def test_create_group(self, db: AsyncSession):
        group = Group(
            id=uuid.uuid4(),
            code="TEST_GRP",
            name="Test Group",
            description="A test group",
        )
        db.add(group)
        await db.commit()
        await db.refresh(group)

        assert group.status == "active"  # default
        assert group.code == "TEST_GRP"
        assert group.created_at is not None

    async def test_unique_code(self, db: AsyncSession, sample_group):
        dup = Group(id=uuid.uuid4(), code="ECOWAS", name="Duplicate")
        db.add(dup)
        with pytest.raises(Exception):
            await db.commit()
        await db.rollback()

    async def test_status_transition(self, db: AsyncSession, sample_group):
        assert sample_group.status == "active"
        sample_group.status = "deprecated"
        await db.commit()
        await db.refresh(sample_group)
        assert sample_group.status == "deprecated"

    async def test_soft_delete_idempotent(self, db: AsyncSession, sample_group):
        """Deprecating an already-deprecated group should be a no-op."""
        sample_group.status = "deprecated"
        await db.commit()

        sample_group.status = "deprecated"  # again
        await db.commit()
        await db.refresh(sample_group)
        assert sample_group.status == "deprecated"


class TestGroupMemberModel:
    """Unit tests for GroupMember model."""

    async def test_create_members(self, db: AsyncSession, sample_group, sample_countries):
        result = await db.execute(
            select(GroupMember).where(GroupMember.group_id == sample_group.id)
        )
        members = result.scalars().all()
        codes = sorted([m.country_code for m in members])
        assert codes == ["GH", "NG"]

    async def test_member_count(self, db: AsyncSession, sample_group):
        count = (await db.execute(
            select(func.count()).select_from(GroupMember)
            .where(GroupMember.group_id == sample_group.id)
        )).scalar_one()
        assert count == 2

    async def test_add_member(self, db: AsyncSession, sample_group):
        db.add(GroupMember(group_id=sample_group.id, country_code="KE"))
        await db.commit()

        count = (await db.execute(
            select(func.count()).select_from(GroupMember)
            .where(GroupMember.group_id == sample_group.id)
        )).scalar_one()
        assert count == 3

    async def test_cascade_delete(self, db: AsyncSession, sample_group):
        """Deleting the group should cascade-delete members."""
        await db.delete(sample_group)
        await db.commit()

        count = (await db.execute(
            select(func.count()).select_from(GroupMember)
            .where(GroupMember.group_id == sample_group.id)
        )).scalar_one()
        assert count == 0

    async def test_composite_pk(self, db: AsyncSession, sample_group):
        """GroupMember uses (group_id, country_code) as composite PK."""
        # Same group + same country should fail
        dup = GroupMember(group_id=sample_group.id, country_code="NG")
        db.add(dup)
        with pytest.raises(Exception):
            await db.commit()
        await db.rollback()
