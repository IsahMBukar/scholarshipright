"""
Blog system — posts with scholarship tagging.

Schema:
    blog_posts(
        id uuid pk,
        author_id uuid NOT NULL REFERENCES users(id),
        title varchar(300) NOT NULL,
        slug varchar(300) NOT NULL UNIQUE,
        excerpt text,
        body text NOT NULL,            -- markdown with @[scholarship:slug] markers
        cover_image_url text,
        category varchar(100) DEFAULT 'general',
        tags text[] DEFAULT '{}',
        reading_time_minutes smallint DEFAULT 1,
        view_count int DEFAULT 0,
        status varchar(20) NOT NULL DEFAULT 'draft',
        -- 'draft' | 'published' | 'pending_review' | 'archived'
        published_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    )

    blog_scholarship_tags(
        id uuid pk,
        blog_post_id uuid NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
        scholarship_id uuid NOT NULL REFERENCES scholarships(id) ON DELETE CASCADE,
        position_hint smallint DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(blog_post_id, scholarship_id)
    )
"""
import uuid
import re
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, DateTime, Text, Integer, SmallInteger, ForeignKey,
    UniqueConstraint, text as sa_text,
)
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from app.db.session import Base, engine


class BlogPost(Base):
    __tablename__ = "blog_posts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    author_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    title = Column(String(300), nullable=False)
    slug = Column(String(300), nullable=False, unique=True, index=True)
    excerpt = Column(Text, nullable=True)
    body = Column(Text, nullable=False)
    cover_image_url = Column(Text, nullable=True)
    category = Column(String(100), nullable=False, default="general", index=True)
    tags = Column(ARRAY(String), default=list)
    reading_time_minutes = Column(SmallInteger, nullable=False, default=1)
    view_count = Column(Integer, nullable=False, default=0)
    status = Column(String(20), nullable=False, default="draft", index=True)
    published_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc), nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc), nullable=False,
    )


class BlogScholarshipTag(Base):
    __tablename__ = "blog_scholarship_tags"
    __table_args__ = (
        UniqueConstraint("blog_post_id", "scholarship_id", name="uq_blog_sch_tag"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    blog_post_id = Column(
        UUID(as_uuid=True), ForeignKey("blog_posts.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    scholarship_id = Column(
        UUID(as_uuid=True), ForeignKey("scholarships.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    position_hint = Column(SmallInteger, nullable=False, default=0)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc), nullable=False,
    )


# ── Scholarship tag parsing ─────────────────────────────────────
# Body syntax: @[scholarship:SLUG] — the frontend renders these as
# inline cards. The backend parses them for storage in the tag table.

_SCHOLARSHIP_TAG_RE = re.compile(r"@\[scholarship:([a-z0-9\-]+)\]")


def extract_scholarship_slugs(body: str) -> list[str]:
    """Return deduplicated slugs from @[scholarship:slug] markers in body."""
    return list(dict.fromkeys(_SCHOLARSHIP_TAG_RE.findall(body)))


# ── Runtime migration ────────────────────────────────────────────

async def ensure_blog_tables() -> None:
    """Idempotent runtime migration for blog tables."""
    import logging
    logger = logging.getLogger("scholarshipright.startup")
    try:
        async with engine.begin() as conn:
            await conn.execute(sa_text("""
                CREATE TABLE IF NOT EXISTS blog_posts (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    title VARCHAR(300) NOT NULL,
                    slug VARCHAR(300) NOT NULL UNIQUE,
                    excerpt TEXT,
                    body TEXT NOT NULL,
                    cover_image_url TEXT,
                    category VARCHAR(100) NOT NULL DEFAULT 'general',
                    tags TEXT[] DEFAULT '{}',
                    reading_time_minutes SMALLINT NOT NULL DEFAULT 1,
                    view_count INT NOT NULL DEFAULT 0,
                    status VARCHAR(20) NOT NULL DEFAULT 'draft',
                    published_at TIMESTAMPTZ,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )
            """))
            await conn.execute(sa_text(
                "CREATE INDEX IF NOT EXISTS ix_blog_posts_author_id ON blog_posts (author_id)"
            ))
            await conn.execute(sa_text(
                "CREATE INDEX IF NOT EXISTS ix_blog_posts_slug ON blog_posts (slug)"
            ))
            await conn.execute(sa_text(
                "CREATE INDEX IF NOT EXISTS ix_blog_posts_status ON blog_posts (status)"
            ))
            await conn.execute(sa_text(
                "CREATE INDEX IF NOT EXISTS ix_blog_posts_category ON blog_posts (category)"
            ))
            await conn.execute(sa_text(
                "CREATE INDEX IF NOT EXISTS ix_blog_posts_published_at ON blog_posts (published_at DESC)"
            ))

            await conn.execute(sa_text("""
                CREATE TABLE IF NOT EXISTS blog_scholarship_tags (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    blog_post_id UUID NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
                    scholarship_id UUID NOT NULL REFERENCES scholarships(id) ON DELETE CASCADE,
                    position_hint SMALLINT NOT NULL DEFAULT 0,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    UNIQUE(blog_post_id, scholarship_id)
                )
            """))
            await conn.execute(sa_text(
                "CREATE INDEX IF NOT EXISTS ix_blog_sch_tags_post ON blog_scholarship_tags (blog_post_id)"
            ))
            await conn.execute(sa_text(
                "CREATE INDEX IF NOT EXISTS ix_blog_sch_tags_scholarship ON blog_scholarship_tags (scholarship_id)"
            ))
    except Exception:
        logger.exception("ensure_blog_tables failed")
