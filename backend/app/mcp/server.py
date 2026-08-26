"""
MCP server — stdio transport for local Claude Desktop.

This is OPTIONAL. The production MCP endpoint is mcp_sse.py (SSE/HTTP),
mounted in the main FastAPI app. This file only exists for local dev
where Claude Desktop launches the server as a subprocess.

Usage:
    python -m app.mcp.server
"""
import asyncio
import json
import logging
import math
import re
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.models.scholarship import Scholarship
from app.models.pending_scholarship import PendingScholarship
from app.models.scholarship_degree_document import ScholarshipDegreeDocument
from app.models.scholarship_custom_document import ScholarshipCustomDocument
from app.models.blog import BlogPost, BlogScholarshipTag, extract_scholarship_slugs
from app.models.user import User
from app.mcp.schemas import get_tool_schemas, SCHOLARSHIP_FIELDS
from app.utils.db import escape_like
from app.utils.scholarship_tags import validate_scholarship_slugs, sync_scholarship_tags as _shared_sync

logger = logging.getLogger("scholarshipright.mcp")

server = Server("scholarshipright-mcp")


def _fmt(sch: Scholarship) -> dict:
    return {
        "id": str(sch.id), "name": sch.name, "slug": sch.slug,
        "host_country": sch.host_country, "host_institution": sch.host_institution,
        "provider": sch.provider, "degree_levels": sch.degree_levels or [],
        "funding_type": sch.funding_type,
        "deadline": str(sch.deadline) if sch.deadline else None,
        "official_url": sch.official_url, "is_active": sch.is_active,
    }


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(name=name, description=spec["description"], inputSchema=spec["inputSchema"])
        for name, spec in get_tool_schemas().items()
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    if name == "add_scholarship":
        return await _handle_add(arguments)
    elif name == "list_scholarships":
        return await _handle_list(arguments)
    elif name == "get_scholarship":
        return await _handle_get(arguments)
    elif name == "edit_scholarship":
        return await _handle_edit(arguments)
    elif name == "create_blog_post":
        return await _handle_blog_create(arguments)
    elif name == "list_blog_posts":
        return await _handle_blog_list(arguments)
    elif name == "get_blog_post":
        return await _handle_blog_get(arguments)
    elif name == "edit_blog_post":
        return await _handle_blog_edit(arguments)
    elif name == "list_blog_categories":
        return await _handle_blog_categories()
    return [TextContent(type="text", text=f"Unknown tool: {name}")]


# ── Scholarship handlers ──────────────────────────────────────────

async def _handle_add(args: dict[str, Any]) -> list[TextContent]:
    required = ["name", "host_country", "funding_type", "deadline", "official_url"]
    missing = [f for f in required if f not in args]
    if missing:
        return [TextContent(type="text", text=f"Missing required fields: {', '.join(missing)}")]

    async with AsyncSessionLocal() as db:
        search_name = args["name"].lower().strip()
        result = await db.execute(
            select(Scholarship).where(func.lower(Scholarship.name).ilike(f"%{escape_like(search_name)}%")).limit(5)
        )
        dupes = result.scalars().all()

        pending = PendingScholarship(payload=args, submitted_by="mcp:local", status="pending_review")
        db.add(pending)
        await db.commit()
        await db.refresh(pending)

        lines = [
            f"Submitted to review queue (ID: {pending.id})",
            "Status: pending_review — admin will review before it goes live.",
        ]
        # Mention inline documents if provided
        dd = args.get("degree_documents", [])
        cd = args.get("custom_documents", [])
        if dd:
            levels = [d.get("degree_level", "?") for d in dd]
            lines.append(f"  Degree documents: {', '.join(levels)}")
        if cd:
            names = [d.get("name", "?") for d in cd]
            lines.append(f"  Custom documents: {', '.join(names)}")
        if dupes:
            lines.append("\nPotential duplicates:")
            for d in dupes[:3]:
                lines.append(f"  - {d.name} ({d.host_country}, {d.funding_type})")
        return [TextContent(type="text", text="\n".join(lines))]


async def _handle_list(args: dict[str, Any]) -> list[TextContent]:
    search = args.get("search", "")
    limit = args.get("limit", 10)

    async with AsyncSessionLocal() as db:
        query = select(Scholarship).where(Scholarship.is_active == True)  # noqa: E712
        if search:
            query = query.where(
                Scholarship.name.ilike(f"%{escape_like(search)}%")
                | Scholarship.host_country.ilike(f"%{escape_like(search)}%")
            )
        query = query.order_by(Scholarship.created_at.desc()).limit(limit)
        result = await db.execute(query)
        scholarships = result.scalars().all()

        if not scholarships:
            return [TextContent(type="text", text="No scholarships found.")]
        lines = [f"Found {len(scholarships)} scholarship(s):\n"]
        for s in scholarships:
            lines.append(f"- {s.name} | {s.host_country} | {s.funding_type} | Deadline: {s.deadline} | Slug: {s.slug}")
        return [TextContent(type="text", text="\n".join(lines))]


async def _handle_get(args: dict[str, Any]) -> list[TextContent]:
    id_or_slug = args.get("id_or_slug", "")
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Scholarship).where(Scholarship.slug == id_or_slug))
        sch = result.scalar_one_or_none()
        if not sch:
            from uuid import UUID
            try:
                result = await db.execute(select(Scholarship).where(Scholarship.id == UUID(id_or_slug)))
                sch = result.scalar_one_or_none()
            except (ValueError, AttributeError):
                pass
        if not sch:
            return [TextContent(type="text", text=f"Not found: {id_or_slug}")]
        data = _fmt(sch)
        # Include degree-level and custom documents
        from sqlalchemy import select as sel
        degree_docs = (await db.execute(
            sel(ScholarshipDegreeDocument).where(ScholarshipDegreeDocument.scholarship_id == sch.id).order_by(ScholarshipDegreeDocument.degree_level)
        )).scalars().all()
        if degree_docs:
            data["degree_documents"] = [{
                "degree_level": d.degree_level,
                "previous_degree_required": d.previous_degree_required,
                "recommendation_letters_count": d.recommendation_letters_count,
                "research_proposal_required": d.research_proposal_required,
                "writing_sample_required": d.writing_sample_required,
                "standardized_test": d.standardized_test,
                "req_transcripts": d.req_transcripts,
                "req_cv_resume": d.req_cv_resume,
                "req_sop_motivation_letter": d.req_sop_motivation_letter,
                "req_recommendation_letters": d.req_recommendation_letters,
                "req_english_test": d.req_english_test,
                "req_passport_or_id": d.req_passport_or_id,
            } for d in degree_docs]
        custom_docs = (await db.execute(
            sel(ScholarshipCustomDocument).where(ScholarshipCustomDocument.scholarship_id == sch.id).order_by(ScholarshipCustomDocument.position)
        )).scalars().all()
        if custom_docs:
            data["custom_documents"] = [{
                "id": str(d.id), "name": d.name, "description": d.description,
                "required": d.required, "degree_level": d.degree_level,
            } for d in custom_docs]
        return [TextContent(type="text", text=json.dumps(data, indent=2, default=str))]


async def _handle_edit(args: dict[str, Any]) -> list[TextContent]:
    """Propose an edit to an existing scholarship.

    Changes are NOT applied directly — they are queued as an edit proposal
    (PendingScholarship with target_scholarship_id) for admin approval.
    Only provided fields are included in the diff. Matches the production
    HTTP MCP handler behaviour in ``app.api.mcp_sse``.
    """
    from uuid import UUID as UUID_T
    from datetime import date as date_t

    id_or_slug = args.get("id_or_slug", "").strip()
    if not id_or_slug:
        return [TextContent(type="text", text="id_or_slug is required.")]

    # Extract inline documents — handled separately from flat fields
    inline_degree_docs = args.get("degree_documents")
    inline_custom_docs = args.get("custom_documents")

    editable = {k: v for k, v in args.items() if k not in ("id_or_slug", "degree_documents", "custom_documents") and k in SCHOLARSHIP_FIELDS}
    if not editable and inline_degree_docs is None and inline_custom_docs is None:
        return [TextContent(type="text", text="No fields to update.")]

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Scholarship).where(Scholarship.slug == id_or_slug))
        sch = result.scalar_one_or_none()
        if not sch:
            try:
                result = await db.execute(select(Scholarship).where(Scholarship.id == UUID_T(id_or_slug)))
                sch = result.scalar_one_or_none()
            except (ValueError, AttributeError):
                pass
        if not sch:
            return [TextContent(type="text", text=f"Not found: {id_or_slug}")]

        # Compute field-level diff against the live record
        date_fields = {"deadline", "open_date", "program_start_date"}
        changes: dict[str, dict] = {}
        for field, value in editable.items():
            if not hasattr(sch, field):
                continue
            old = getattr(sch, field)
            if field in date_fields and isinstance(value, str):
                try:
                    value = date_t.fromisoformat(value)
                except ValueError:
                    return [TextContent(type="text", text=f"Invalid date for {field}: {value}")]
            if old != value:
                changes[field] = {
                    "old": str(old) if old is not None else None,
                    "new": value.isoformat() if isinstance(value, date_t) else value,
                }

        # Summarise document changes (full arrays stored for re-application on approve)
        doc_changes_summary = []
        if inline_degree_docs is not None:
            levels = [d.get("degree_level", "?") for d in inline_degree_docs]
            doc_changes_summary.append(f"Replace degree documents: {', '.join(levels)}")
        if inline_custom_docs is not None:
            names = [d.get("name", "?") for d in inline_custom_docs]
            doc_changes_summary.append(f"Replace custom documents with {len(inline_custom_docs)} item(s): {', '.join(names)}")

        if not changes and not doc_changes_summary:
            return [TextContent(type="text", text=f"No changes detected for scholarship: {sch.name}")]

        pending = PendingScholarship(
            payload={
                "is_edit": True,
                "scholarship_name": sch.name,
                "scholarship_slug": sch.slug,
                "changes": changes,
                "doc_changes_summary": doc_changes_summary,
                "degree_documents": inline_degree_docs,
                "custom_documents": inline_custom_docs,
            },
            submitted_by="mcp:local",
            status="pending_review",
            target_scholarship_id=sch.id,
        )
        db.add(pending)
        await db.commit()
        await db.refresh(pending)

        lines = [
            f"Edit proposed for scholarship '{sch.name}' (proposal ID: {pending.id})",
            "Status: pending_review",
            "The live scholarship is unchanged until an admin approves this edit.",
            "",
            "Proposed field changes:",
        ]
        for field, ch in changes.items():
            old_v = ch["old"] if ch["old"] is not None else "(none)"
            new_v = ch["new"] if ch["new"] is not None else "(none)"
            lines.append(f"  - {field}: {old_v} → {new_v}")
        for dc in doc_changes_summary:
            lines.append(f"  - {dc}")

        return [TextContent(type="text", text="\n".join(lines))]


# ── Blog helpers (imported from app.utils.blog) ──────────────────

from app.utils.blog import slugify as _slugify, reading_time as _reading_time


async def _sync_blog_tags(db: AsyncSession, post_id, body: str) -> None:
    await _shared_sync(db, post_id, body)


# ── Blog handlers ─────────────────────────────────────────────────

async def _handle_blog_create(args: dict[str, Any]) -> list[TextContent]:
    required = ["title", "body"]
    missing = [f for f in required if f not in args]
    if missing:
        return [TextContent(type="text", text=f"Missing required fields: {', '.join(missing)}")]

    title = args["title"].strip()
    body = args["body"].strip()
    if len(title) < 3:
        return [TextContent(type="text", text="Title must be at least 3 characters.")]
    if len(body) < 10:
        return [TextContent(type="text", text="Body must be at least 10 characters.")]

    status = args.get("status", "pending_review")

    async with AsyncSessionLocal() as db:
        slugs = extract_scholarship_slugs(body)
        if slugs:
            v = await validate_scholarship_slugs(db, slugs)
            if v["invalid"]:
                lines = [f"Invalid scholarship slugs: {', '.join(v['invalid'])}"]
                for bad in v["invalid"]:
                    sug = v["suggestions"].get(bad, [])
                    if sug:
                        lines.append(f"  '{bad}' did you mean: {', '.join(s['slug'] for s in sug)}")
                lines.append("Call list_scholarships with search=<term> or POST /api/scholarships/validate. Only active scholarships can be tagged.")
                return [TextContent(type="text", text="\n".join(lines))]
        author_id = None
        for role_filter in [
            User.is_admin == True, User.admin_role == "super_admin",  # noqa: E712
        ]:
            user_row = await db.execute(select(User.id).where(role_filter).limit(1))
            author_id = user_row.scalar_one_or_none()
            if author_id:
                break

        if not author_id:
            user_row = await db.execute(select(User.id).limit(1))
            author_id = user_row.scalar()

        if not author_id:
            return [TextContent(type="text", text="No users found. Cannot assign author.")]

        slug = _slugify(title)
        existing = await db.execute(select(BlogPost.id).where(BlogPost.slug == slug))
        if existing.scalar_one_or_none():
            slug = f"{slug}-{uuid4().hex[:6]}"

        now = datetime.now(timezone.utc)
        post = BlogPost(
            author_id=author_id, title=title, slug=slug,
            excerpt=args.get("excerpt"), body=body,
            cover_image_url=args.get("cover_image_url"),
            category=args.get("category", "general"),
            tags=args.get("tags", []),
            reading_time_minutes=_reading_time(body),
            status=status,
            published_at=now if status == "published" else None,
        )
        db.add(post)
        await db.flush()
        await _sync_blog_tags(db, post.id, body)
        await db.commit()
        await db.refresh(post)

        lines = [
            f"Blog post created (ID: {post.id})",
            f"Title: {post.title}", f"Slug: {post.slug}",
            f"Status: {post.status}", f"URL: /blog/{post.slug}",
        ]
        if status == "pending_review":
            lines.append("pending_review — admin will review before it goes live.")
        elif status == "draft":
            lines.append("Saved as draft.")
        return [TextContent(type="text", text="\n".join(lines))]


async def _handle_blog_list(args: dict[str, Any]) -> list[TextContent]:
    search = args.get("search", "")
    category = args.get("category")
    tag = args.get("tag")
    page = max(1, args.get("page", 1))
    limit = min(50, max(1, args.get("limit", 10)))

    async with AsyncSessionLocal() as db:
        base = select(BlogPost).where(BlogPost.status == "published")
        count_base = select(func.count(BlogPost.id)).where(BlogPost.status == "published")

        if search:
            ilike = f"%{escape_like(search)}%"
            base = base.where(BlogPost.title.ilike(ilike))
            count_base = count_base.where(BlogPost.title.ilike(ilike))
        if category:
            base = base.where(BlogPost.category == category)
            count_base = count_base.where(BlogPost.category == category)
        if tag:
            base = base.where(BlogPost.tags.any(tag))
            count_base = count_base.where(BlogPost.tags.any(tag))

        total = (await db.execute(count_base)).scalar() or 0
        pages = max(1, math.ceil(total / limit))

        rows = await db.execute(
            base.order_by(BlogPost.published_at.desc()).offset((page - 1) * limit).limit(limit)
        )
        posts = rows.scalars().all()

        if not posts:
            return [TextContent(type="text", text="No blog posts found.")]

        lines = [f"Found {total} post(s), page {page}/{pages}:\n"]
        for p in posts:
            tags_str = f" [{', '.join(p.tags)}]" if p.tags else ""
            lines.append(f"- {p.title} | {p.category} | {p.reading_time_minutes}min | Slug: {p.slug}{tags_str}")
        return [TextContent(type="text", text="\n".join(lines))]


async def _handle_blog_get(args: dict[str, Any]) -> list[TextContent]:
    slug_or_id = args.get("slug_or_id", "").strip()
    if not slug_or_id:
        return [TextContent(type="text", text="slug_or_id is required.")]

    async with AsyncSessionLocal() as db:
        row = await db.execute(select(BlogPost).where(BlogPost.slug == slug_or_id, BlogPost.status == "published"))
        post = row.scalar_one_or_none()

        if not post:
            from uuid import UUID
            try:
                row = await db.execute(select(BlogPost).where(BlogPost.id == UUID(slug_or_id)))
                post = row.scalar_one_or_none()
            except (ValueError, AttributeError):
                pass

        if not post:
            return [TextContent(type="text", text=f"Not found: {slug_or_id}")]

        author = (await db.execute(select(User.full_name).where(User.id == post.author_id))).scalar()

        data = {
            "id": str(post.id), "title": post.title, "slug": post.slug,
            "excerpt": post.excerpt, "body": post.body,
            "cover_image_url": post.cover_image_url, "category": post.category,
            "tags": post.tags or [], "reading_time_minutes": post.reading_time_minutes,
            "view_count": post.view_count, "status": post.status,
            "author_name": author or "Anonymous",
            "published_at": post.published_at.isoformat() if post.published_at else None,
            "created_at": post.created_at.isoformat(),
            "updated_at": post.updated_at.isoformat(),
        }
        return [TextContent(type="text", text=json.dumps(data, indent=2, default=str))]


async def _handle_blog_edit(args: dict[str, Any]) -> list[TextContent]:
    post_id = args.get("post_id", "").strip()
    if not post_id:
        return [TextContent(type="text", text="post_id is required.")]

    from app.mcp.schemas import BLOG_FIELDS
    editable = {k: v for k, v in args.items() if k != "post_id" and k in BLOG_FIELDS}
    if not editable:
        return [TextContent(type="text", text="No fields to update.")]

    async with AsyncSessionLocal() as db:
        from uuid import UUID as UUID_T
        try:
            row = await db.execute(select(BlogPost).where(BlogPost.id == UUID_T(post_id)))
        except ValueError:
            return [TextContent(type="text", text="Invalid post_id. Must be a UUID.")]

        post = row.scalar_one_or_none()
        if not post:
            return [TextContent(type="text", text=f"Not found: {post_id}")]

        changed = []

        if "title" in editable:
            new_slug = _slugify(editable["title"])
            slug_exists = await db.execute(
                select(BlogPost.id).where(BlogPost.slug == new_slug, BlogPost.id != post.id)
            )
            if slug_exists.scalar_one_or_none():
                new_slug = f"{new_slug}-{uuid4().hex[:6]}"
            post.slug = new_slug
            post.title = editable["title"]
            changed.append("title")

        if "body" in editable:
            slugs = extract_scholarship_slugs(editable["body"])
            if slugs:
                v = await validate_scholarship_slugs(db, slugs)
                if v["invalid"]:
                    lines = [f"Invalid scholarship slugs: {', '.join(v['invalid'])}"]
                    for bad in v["invalid"]:
                        sug = v["suggestions"].get(bad, [])
                        if sug:
                            lines.append(f"  '{bad}' did you mean: {', '.join(s['slug'] for s in sug)}")
                    return [TextContent(type="text", text="\n".join(lines))]
            post.body = editable["body"]
            post.reading_time_minutes = _reading_time(editable["body"])
            await _sync_blog_tags(db, post.id, editable["body"])
            changed.append("body")

        for field in ("excerpt", "cover_image_url", "category", "tags"):
            if field in editable:
                setattr(post, field, editable[field])
                changed.append(field)

        if "status" in editable:
            new_status = editable["status"]
            if new_status == "published" and post.status != "published":
                post.published_at = datetime.now(timezone.utc)
            post.status = new_status
            changed.append("status")
        elif post.status == "published" and changed:
            # Agent edited a live post → revert to pending_review
            post.status = "pending_review"
            changed.append("status→pending_review")

        if not changed:
            return [TextContent(type="text", text=f"No changes for: {post.title}")]

        post.updated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(post)

        data = {"id": str(post.id), "title": post.title, "slug": post.slug, "status": post.status, "updated_fields": changed}
        if post.status == "pending_review":
            data["note"] = "Post reverted to pending_review — admin will re-approve before it goes live again."
        return [TextContent(type="text", text=json.dumps(data, indent=2, default=str))]


async def _handle_blog_categories() -> list[TextContent]:
    async with AsyncSessionLocal() as db:
        rows = await db.execute(
            select(BlogPost.category).where(BlogPost.status == "published").distinct().order_by(BlogPost.category)
        )
        categories = [r[0] for r in rows.all()]
        if not categories:
            return [TextContent(type="text", text="No blog categories found.")]
        return [TextContent(type="text", text="Categories:\n" + "\n".join(f"- {c}" for c in categories))]


async def main():
    async with stdio_server() as (r, w):
        await server.run(r, w, server.create_initialization_options())


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
