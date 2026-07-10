"""
Tests for blog, MCP request log, and remaining model coverage.
"""
import uuid
import pytest
import pytest_asyncio
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.user import User
from app.models.blog import BlogPost


@pytest_asyncio.fixture
async def sample_author(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"author-{uuid.uuid4().hex[:8]}@test.com",
        is_active=True,
        is_admin=True,
        admin_role="super_admin",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


class TestBlogPostModel:
    """Unit tests for BlogPost model."""

    async def test_create_draft(self, db: AsyncSession, sample_author):
        post = BlogPost(
            id=uuid.uuid4(),
            author_id=sample_author.id,
            title="How to Win Scholarships",
            slug="how-to-win-scholarships-" + uuid.uuid4().hex[:4],
            body="# Tips\n\nStart early.",
        )
        db.add(post)
        await db.commit()
        await db.refresh(post)

        assert post.status == "draft"  # default
        assert post.view_count == 0
        assert post.reading_time_minutes == 1
        assert post.published_at is None

    async def test_publish_post(self, db: AsyncSession, sample_author):
        post = BlogPost(
            author_id=sample_author.id,
            title="Published Post",
            slug="pub-" + uuid.uuid4().hex[:4],
            body="Content here.",
            status="published",
            published_at=datetime.now(timezone.utc),
        )
        db.add(post)
        await db.commit()
        await db.refresh(post)

        assert post.status == "published"
        assert post.published_at is not None

    async def test_unique_slug(self, db: AsyncSession, sample_author):
        slug = "dup-slug-" + uuid.uuid4().hex[:4]
        p1 = BlogPost(author_id=sample_author.id, title="A", slug=slug, body="A")
        db.add(p1)
        await db.commit()

        p2 = BlogPost(author_id=sample_author.id, title="B", slug=slug, body="B")
        db.add(p2)
        with pytest.raises(Exception):
            await db.commit()
        await db.rollback()

    async def test_status_transitions(self, db: AsyncSession, sample_author):
        post = BlogPost(
            author_id=sample_author.id,
            title="Status Test",
            slug="status-" + uuid.uuid4().hex[:4],
            body="Body",
        )
        db.add(post)
        await db.commit()

        for status in ["published", "archived"]:
            post.status = status
            await db.commit()
            await db.refresh(post)
            assert post.status == status

    async def test_category_and_tags(self, db: AsyncSession, sample_author):
        post = BlogPost(
            author_id=sample_author.id,
            title="Tagged Post",
            slug="tagged-" + uuid.uuid4().hex[:4],
            body="Content",
            category="guides",
            tags=["scholarships", "tips", "funding"],
        )
        db.add(post)
        await db.commit()
        await db.refresh(post)

        assert post.category == "guides"
        assert "scholarships" in post.tags

    async def test_view_count_increment(self, db: AsyncSession, sample_author):
        post = BlogPost(
            author_id=sample_author.id,
            title="Views",
            slug="views-" + uuid.uuid4().hex[:4],
            body="Body",
            view_count=0,
        )
        db.add(post)
        await db.commit()

        post.view_count += 1
        await db.commit()
        await db.refresh(post)
        assert post.view_count == 1

    async def test_filter_by_status(self, db: AsyncSession, sample_author):
        for status in ["draft", "published", "draft", "archived"]:
            db.add(BlogPost(
                author_id=sample_author.id,
                title=f"Post-{status}",
                slug=f"filter-{status}-{uuid.uuid4().hex[:4]}",
                body="Body",
                status=status,
            ))
        await db.commit()

        result = await db.execute(
            select(BlogPost).where(BlogPost.status == "draft")
        )
        assert len(result.scalars().all()) == 2

        result = await db.execute(
            select(BlogPost).where(BlogPost.status == "published")
        )
        assert len(result.scalars().all()) == 1
