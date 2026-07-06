"""
Shared test fixtures for ScholarshipRight backend tests.
"""
import os
import uuid
from datetime import date, datetime, timezone
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

# Override settings BEFORE any app imports
os.environ.setdefault("DATABASE_URL", "postgresql://postgres:challengeall@localhost:5432/scholarshipright_test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379")
os.environ.setdefault("FRONTEND_URL", "http://localhost:3000")
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "test-key")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-jwt-secret-for-testing-only-32chars!")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-for-testing-only-32chars!")
os.environ.setdefault("CLAUDE_API_KEY", "test-claude-key")

from app.db.session import Base, get_db
from app.models.scholarship import Scholarship
from app.models.pending_scholarship import PendingScholarship
from app.mcp.auth import McpApiKey, generate_key


# ── Database ───────────────────────────────────────────────────────

TEST_DB_URL = os.environ["DATABASE_URL"].replace("postgresql://", "postgresql+asyncpg://")
test_engine = create_async_engine(TEST_DB_URL, echo=False, pool_size=5, max_overflow=0)
TestSessionLocal = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture(autouse=True)
async def setup_tables():
    """Create tables before each test, drop after."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await test_engine.dispose()


@pytest_asyncio.fixture
async def db() -> AsyncGenerator[AsyncSession, None]:
    async with TestSessionLocal() as session:
        yield session
        await session.rollback()


# ── Model fixtures ─────────────────────────────────────────────────

@pytest_asyncio.fixture
async def sample_scholarship(db: AsyncSession) -> Scholarship:
    sch = Scholarship(
        id=uuid.uuid4(),
        name="Test Scholarship",
        slug="test-scholarship",
        host_country="United Kingdom",
        host_institution="Test University",
        provider="Test Provider",
        degree_levels=["master"],
        funding_type="fully_funded",
        covers_tuition=True,
        monthly_stipend_usd=1500,
        requires_ielts=True,
        min_ielts_score=6.5,
        deadline=date(2026, 11, 1),
        official_url="https://example.com/scholarship",
        is_active=True,
        is_verified=True,
    )
    db.add(sch)
    await db.commit()
    await db.refresh(sch)
    return sch


@pytest_asyncio.fixture
async def sample_pending(db: AsyncSession) -> PendingScholarship:
    pending = PendingScholarship(
        id=uuid.uuid4(),
        payload={
            "name": "Pending Scholarship",
            "host_country": "Germany",
            "funding_type": "fully_funded",
            "deadline": "2026-12-01",
            "official_url": "https://example.com/pending",
        },
        submitted_by="mcp:agent",
        status="pending_review",
    )
    db.add(pending)
    await db.commit()
    await db.refresh(pending)
    return pending


@pytest_asyncio.fixture
async def sample_mcp_key(db: AsyncSession) -> McpApiKey:
    raw_key, key_hash = generate_key()
    key_record = McpApiKey(
        id=uuid.uuid4(),
        name="Test Agent",
        key_hash=key_hash,
        key_prefix=raw_key[:8],
        is_active=True,
        rate_limit_per_hour=20,
    )
    db.add(key_record)
    await db.commit()
    await db.refresh(key_record)
    key_record._raw_key = raw_key
    return key_record
