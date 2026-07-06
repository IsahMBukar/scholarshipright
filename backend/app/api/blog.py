"""
Blog CRUD API — public listing + authenticated create/edit/delete.

Endpoints:
    GET    /api/blog                  — list published posts (public)
    GET    /api/blog/categories       — list distinct categories (public)
    GET    /api/blog/{slug}           — single post detail (public, increments view count)
    POST   /api/blog                  — create post (auth required)
    PATCH  /api/blog/{post_id}        — update post (auth + ownership/admin)
    DELETE /api/blog/{post_id}        — soft-delete → archived (auth + ownership/admin)
"""
import re
import math
import logging
import uuid as _uuid
from datetime import datetime, timezone
from typing import Optional

import markdown
import bleach
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func, update, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.user import User
from app.models.blog import BlogPost, BlogScholarshipTag, extract_scholarship_slugs
from app.models.scholarship import Scholarship
from app.api.users import get_current_user
from app.core.admin import require_admin
from app.core.rate_limit import blog_write_rate_limit

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/blog", tags=["blog"])

# Allowed HTML tags in rendered blog body (safe for dangerouslySetInnerHTML)
_ALLOWED_TAGS = [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr',
    'ul', 'ol', 'li',
    'blockquote', 'pre', 'code',
    'strong', 'em', 'b', 'i', 'u', 's', 'del', 'mark', 'sub', 'sup',
    'a', 'img',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'div', 'span',
]
_ALLOWED_ATTRS = {
    'a': ['href', 'title', 'target', 'rel'],
    'img': ['src', 'alt', 'width', 'height'],
    'td': ['colspan', 'rowspan'],
    'th': ['colspan', 'rowspan'],
    'span': ['class'],
    'div': ['class'],
    'code': ['class'],
    'pre': ['class'],
}


# ── Helpers ──────────────────────────────────────────────────────

def _slugify(title: str) -> str:
    s = title.lower().strip()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[\s_]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s[:280]


def _reading_time(body: str) -> int:
    words = len(body.split())
    return max(1, math.ceil(words / 200))


def _md_to_html(md_text: str) -> str:
    """Convert markdown to sanitized HTML."""
    raw_html = markdown.markdown(
        md_text,
        extensions=["fenced_code", "tables", "nl2br", "sane_lists"],
    )
    return bleach.clean(raw_html, tags=_ALLOWED_TAGS, attributes=_ALLOWED_ATTRS)


# ── Pydantic schemas ────────────────────────────────────────────

class BlogCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=300)
    excerpt: Optional[str] = None
    body: str = Field(..., min_length=10)
    cover_image_url: Optional[str] = None
    category: str = Field(default="general", max_length=100)
    tags: list[str] = Field(default_factory=list)
    status: str = Field(default="draft", pattern="^(draft|published|pending_review)$")


class BlogUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=3, max_length=300)
    excerpt: Optional[str] = None
    body: Optional[str] = None
    cover_image_url: Optional[str] = None
    category: Optional[str] = Field(None, max_length=100)
    tags: Optional[list[str]] = None
    status: Optional[str] = Field(None, pattern="^(draft|published|pending_review|archived)$")


class ScholarshipTagOut(BaseModel):
    scholarship_id: str
    slug: str
    name: str
    host_country: str
    provider: Optional[str] = None
    deadline: Optional[str] = None
    funding_type: Optional[str] = None
    degree_levels: list[str] = []
    position_hint: int = 0


class BlogPostOut(BaseModel):
    id: str
    author_id: str
    author_name: Optional[str] = None
    title: str
    slug: str
    excerpt: Optional[str] = None
    body: str                    # raw markdown (for editing)
    html_body: str = ""          # rendered HTML (for display)
    cover_image_url: Optional[str] = None
    category: str
    tags: list[str] = []
    reading_time_minutes: int
    view_count: int
    status: str
    published_at: Optional[str] = None
    created_at: str
    updated_at: str
    scholarship_tags: list[ScholarshipTagOut] = []


class BlogListOut(BaseModel):
    id: str
    author_name: Optional[str] = None
    title: str
    slug: str
    excerpt: Optional[str] = None
    cover_image_url: Optional[str] = None
    category: str
    tags: list[str] = []
    reading_time_minutes: int
    view_count: int
    published_at: Optional[str] = None


class PaginatedBlogs(BaseModel):
    items: list[BlogListOut]
    total: int
    page: int
    pages: int


# ── Endpoints ────────────────────────────────────────────────────

@router.get("/categories", response_model=list[str])
async def list_categories(db: AsyncSession = Depends(get_db)):
    """Return distinct categories from published posts."""
    rows = await db.execute(
        select(BlogPost.category)
        .where(BlogPost.status == "published")
        .distinct()
        .order_by(BlogPost.category)
    )
    return [r[0] for r in rows.all()]


@router.get("", response_model=PaginatedBlogs)
async def list_posts(
    page: int = Query(1, ge=1),
    limit: int = Query(12, ge=1, le=50),
    category: Optional[str] = None,
    tag: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """List published blog posts, newest first."""
    base = select(BlogPost).where(BlogPost.status == "published")
    count_base = select(func.count(BlogPost.id)).where(BlogPost.status == "published")

    if category:
        base = base.where(BlogPost.category == category)
        count_base = count_base.where(BlogPost.category == category)
    if tag:
        base = base.where(BlogPost.tags.any(tag))
        count_base = count_base.where(BlogPost.tags.any(tag))

    total = (await db.execute(count_base)).scalar() or 0
    pages = max(1, math.ceil(total / limit))

    rows = await db.execute(
        base.order_by(BlogPost.published_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    posts = rows.scalars().all()

    # Fetch author names
    author_ids = list({p.author_id for p in posts})
    author_map: dict[str, str] = {}
    if author_ids:
        from sqlalchemy import select as _sel
        users_rows = await db.execute(
            _sel(User.id, User.full_name).where(User.id.in_(author_ids))
        )
        for uid, name in users_rows.all():
            author_map[str(uid)] = name or "Anonymous"

    items = [
        BlogListOut(
            id=str(p.id),
            author_name=author_map.get(str(p.author_id)),
            title=p.title,
            slug=p.slug,
            excerpt=p.excerpt,
            cover_image_url=p.cover_image_url,
            category=p.category,
            tags=p.tags or [],
            reading_time_minutes=p.reading_time_minutes,
            view_count=p.view_count,
            published_at=p.published_at.isoformat() if p.published_at else None,
        )
        for p in posts
    ]
    return PaginatedBlogs(items=items, total=total, page=page, pages=pages)


@router.get("/{slug}", response_model=BlogPostOut)
async def get_post(slug: str, db: AsyncSession = Depends(get_db)):
    """Get a single published post by slug. Increments view count."""
    row = await db.execute(
        select(BlogPost).where(BlogPost.slug == slug, BlogPost.status == "published")
    )
    post = row.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    # Increment view count (atomic SQL expression to avoid race condition)
    await db.execute(
        update(BlogPost).where(BlogPost.id == post.id).values(view_count=BlogPost.view_count + 1)
    )
    await db.flush()
    post.view_count += 1

    # Fetch scholarship tags
    tag_rows = await db.execute(
        select(BlogScholarshipTag, Scholarship)
        .join(Scholarship, BlogScholarshipTag.scholarship_id == Scholarship.id)
        .where(BlogScholarshipTag.blog_post_id == post.id)
        .order_by(BlogScholarshipTag.position_hint)
    )
    scholarship_tags = [
        ScholarshipTagOut(
            scholarship_id=str(tag.scholarship_id),
            slug=sch.slug,
            name=sch.name,
            host_country=sch.host_country,
            provider=sch.provider,
            deadline=sch.deadline.isoformat() if sch.deadline else None,
            funding_type=sch.funding_type,
            degree_levels=sch.degree_levels or [],
            position_hint=tag.position_hint,
        )
        for tag, sch in tag_rows.all()
    ]

    # Author name
    author = (await db.execute(select(User.full_name).where(User.id == post.author_id))).scalar()

    await db.commit()
    return BlogPostOut(
        id=str(post.id),
        author_id=str(post.author_id),
        author_name=author or "Anonymous",
        title=post.title,
        slug=post.slug,
        excerpt=post.excerpt,
        body=post.body,
        html_body=_md_to_html(post.body),
        cover_image_url=post.cover_image_url,
        category=post.category,
        tags=post.tags or [],
        reading_time_minutes=post.reading_time_minutes,
        view_count=post.view_count,
        status=post.status,
        published_at=post.published_at.isoformat() if post.published_at else None,
        created_at=post.created_at.isoformat(),
        updated_at=post.updated_at.isoformat(),
        scholarship_tags=scholarship_tags,
    )


@router.post("", response_model=BlogPostOut, status_code=status.HTTP_201_CREATED)
async def create_post(
    payload: BlogCreate,
    _rate: None = Depends(blog_write_rate_limit),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new blog post. Auth required."""
    slug = _slugify(payload.title)
    # Ensure unique slug
    existing = await db.execute(select(BlogPost.id).where(BlogPost.slug == slug))
    if existing.scalar_one_or_none():
        slug = f"{slug}-{_uuid.uuid4().hex[:6]}"

    now = datetime.now(timezone.utc)
    post = BlogPost(
        author_id=user.id,
        title=payload.title,
        slug=slug,
        excerpt=payload.excerpt,
        body=payload.body,
        cover_image_url=payload.cover_image_url,
        category=payload.category,
        tags=payload.tags,
        reading_time_minutes=_reading_time(payload.body),
        status=payload.status,
        published_at=now if payload.status == "published" else None,
    )
    db.add(post)
    await db.flush()

    # Parse scholarship tags from body
    await _sync_scholarship_tags(db, post.id, payload.body, 0)

    await db.commit()
    await db.refresh(post)

    return BlogPostOut(
        id=str(post.id),
        author_id=str(post.author_id),
        author_name=user.full_name or "Anonymous",
        title=post.title,
        slug=post.slug,
        excerpt=post.excerpt,
        body=post.body,
        html_body=_md_to_html(post.body),
        cover_image_url=post.cover_image_url,
        category=post.category,
        tags=post.tags or [],
        reading_time_minutes=post.reading_time_minutes,
        view_count=post.view_count,
        status=post.status,
        published_at=post.published_at.isoformat() if post.published_at else None,
        created_at=post.created_at.isoformat(),
        updated_at=post.updated_at.isoformat(),
        scholarship_tags=[],
    )


@router.patch("/{post_id}", response_model=BlogPostOut)
async def update_post(
    post_id: str,
    payload: BlogUpdate,
    _rate: None = Depends(blog_write_rate_limit),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a blog post. Owner or admin only."""
    row = await db.execute(select(BlogPost).where(BlogPost.id == _uuid.UUID(post_id)))
    post = row.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if str(post.author_id) != str(user.id) and not (user.is_admin and user.admin_role == "super_admin"):
        raise HTTPException(status_code=403, detail="Not authorized")

    update_data = payload.model_dump(exclude_unset=True)

    # If title changed, regenerate slug
    if "title" in update_data:
        new_slug = _slugify(update_data["title"])
        slug_exists = await db.execute(
            select(BlogPost.id).where(BlogPost.slug == new_slug, BlogPost.id != post.id)
        )
        if slug_exists.scalar_one_or_none():
            new_slug = f"{new_slug}-{_uuid.uuid4().hex[:6]}"
        post.slug = new_slug

    # If body changed, recalculate reading time and re-sync scholarship tags
    if "body" in update_data:
        update_data["reading_time_minutes"] = _reading_time(update_data["body"])
        await _sync_scholarship_tags(db, post.id, update_data["body"], 0)

    # If status changed to published, set published_at
    if update_data.get("status") == "published" and post.status != "published":
        update_data["published_at"] = datetime.now(timezone.utc)

    for key, val in update_data.items():
        setattr(post, key, val)

    db.add(post)
    await db.commit()
    await db.refresh(post)

    # Fetch scholarship tags for response
    tag_rows = await db.execute(
        select(BlogScholarshipTag, Scholarship)
        .join(Scholarship, BlogScholarshipTag.scholarship_id == Scholarship.id)
        .where(BlogScholarshipTag.blog_post_id == post.id)
        .order_by(BlogScholarshipTag.position_hint)
    )
    scholarship_tags = [
        ScholarshipTagOut(
            scholarship_id=str(t.scholarship_id),
            slug=sch.slug,
            name=sch.name,
            host_country=sch.host_country,
            provider=sch.provider,
            deadline=sch.deadline.isoformat() if sch.deadline else None,
            funding_type=sch.funding_type,
            degree_levels=sch.degree_levels or [],
            position_hint=t.position_hint,
        )
        for t, sch in tag_rows.all()
    ]

    author = (await db.execute(select(User.full_name).where(User.id == post.author_id))).scalar()

    return BlogPostOut(
        id=str(post.id),
        author_id=str(post.author_id),
        author_name=author or "Anonymous",
        title=post.title,
        slug=post.slug,
        excerpt=post.excerpt,
        body=post.body,
        html_body=_md_to_html(post.body),
        cover_image_url=post.cover_image_url,
        category=post.category,
        tags=post.tags or [],
        reading_time_minutes=post.reading_time_minutes,
        view_count=post.view_count,
        status=post.status,
        published_at=post.published_at.isoformat() if post.published_at else None,
        created_at=post.created_at.isoformat(),
        updated_at=post.updated_at.isoformat(),
        scholarship_tags=scholarship_tags,
    )


@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_post(
    post_id: str,
    _rate: None = Depends(blog_write_rate_limit),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete a post (set status to 'archived'). Owner or admin only."""
    row = await db.execute(select(BlogPost).where(BlogPost.id == _uuid.UUID(post_id)))
    post = row.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if str(post.author_id) != str(user.id) and not (user.is_admin and user.admin_role == "super_admin"):
        raise HTTPException(status_code=403, detail="Not authorized")

    post.status = "archived"
    db.add(post)
    await db.commit()


# ── Admin: list all posts (any status) ───────────────────────────

@router.get("/admin/all", response_model=PaginatedBlogs)
async def admin_list_all_posts(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = None,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: list all posts regardless of status."""
    base = select(BlogPost)
    count_base = select(func.count(BlogPost.id))

    if status_filter:
        base = base.where(BlogPost.status == status_filter)
        count_base = count_base.where(BlogPost.status == status_filter)
    if search:
        # Escape LIKE wildcards to prevent pattern-based exploration
        safe = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        ilike = f"%{safe}%"
        base = base.where(BlogPost.title.ilike(ilike))
        count_base = count_base.where(BlogPost.title.ilike(ilike))

    total = (await db.execute(count_base)).scalar() or 0
    pages = max(1, math.ceil(total / limit))

    rows = await db.execute(
        base.order_by(BlogPost.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    posts = rows.scalars().all()

    author_ids = list({p.author_id for p in posts})
    author_map: dict[str, str] = {}
    if author_ids:
        users_rows = await db.execute(
            select(User.id, User.full_name).where(User.id.in_(author_ids))
        )
        for uid, name in users_rows.all():
            author_map[str(uid)] = name or "Anonymous"

    items = [
        BlogListOut(
            id=str(p.id),
            author_name=author_map.get(str(p.author_id)),
            title=p.title,
            slug=p.slug,
            excerpt=p.excerpt,
            cover_image_url=p.cover_image_url,
            category=p.category,
            tags=p.tags or [],
            reading_time_minutes=p.reading_time_minutes,
            view_count=p.view_count,
            published_at=p.published_at.isoformat() if p.published_at else None,
        )
        for p in posts
    ]
    return PaginatedBlogs(items=items, total=total, page=page, pages=pages)


# ── Scholarship tag sync helper ──────────────────────────────────

async def _sync_scholarship_tags(
    db: AsyncSession,
    post_id: _uuid.UUID,
    body: str,
    start_offset: int = 0,
) -> None:
    """Parse @[scholarship:slug] from body and sync the tag table."""
    slugs = extract_scholarship_slugs(body)
    if not slugs:
        # Clear existing tags if body no longer has any
        await db.execute(
            text("DELETE FROM blog_scholarship_tags WHERE blog_post_id = :pid"),
            {"pid": str(post_id)},
        )
        return

    # Resolve slugs → scholarship ids
    rows = await db.execute(
        select(Scholarship.id, Scholarship.slug)
        .where(Scholarship.slug.in_(slugs))
    )
    slug_to_id = {r.slug: r.id for r in rows.all()}

    # Clear old tags and re-insert
    await db.execute(
        text("DELETE FROM blog_scholarship_tags WHERE blog_post_id = :pid"),
        {"pid": str(post_id)},
    )

    for i, slug in enumerate(slugs):
        sch_id = slug_to_id.get(slug)
        if sch_id:
            tag = BlogScholarshipTag(
                blog_post_id=post_id,
                scholarship_id=sch_id,
                position_hint=start_offset + i,
            )
            db.add(tag)
