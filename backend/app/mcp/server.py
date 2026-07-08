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

from sqlalchemy import select, func, text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.models.scholarship import Scholarship
from app.models.pending_scholarship import PendingScholarship
from app.models.scholarship_degree_document import ScholarshipDegreeDocument, auto_derive_for_level
from app.models.scholarship_custom_document import ScholarshipCustomDocument
from app.models.blog import BlogPost, BlogScholarshipTag, extract_scholarship_slugs
from app.models.user import User
from app.mcp.schemas import get_tool_schemas, SCHOLARSHIP_FIELDS

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
    elif name == "get_scholarship_documents":
        return await _handle_get_documents(arguments)
    elif name == "set_degree_documents":
        return await _handle_set_degree_documents(arguments)
    elif name == "add_custom_document":
        return await _handle_add_custom_document(arguments)
    elif name == "remove_custom_document":
        return await _handle_remove_custom_document(arguments)
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
            select(Scholarship).where(func.lower(Scholarship.name).ilike(f"%{search_name}%")).limit(5)
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
                Scholarship.name.ilike(f"%{search}%")
                | Scholarship.host_country.ilike(f"%{search}%")
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
    from uuid import UUID as UUID_T
    from datetime import date as date_t

    id_or_slug = args.get("id_or_slug", "").strip()
    if not id_or_slug:
        return [TextContent(type="text", text="id_or_slug is required.")]
    editable = {k: v for k, v in args.items() if k != "id_or_slug" and k in SCHOLARSHIP_FIELDS}
    if not editable:
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

        changed = []
        for field, value in editable.items():
            if not hasattr(sch, field):
                continue
            if field in {"deadline", "open_date", "program_start_date"} and isinstance(value, str):
                try:
                    value = date_t.fromisoformat(value)
                except ValueError:
                    return [TextContent(type="text", text=f"Invalid date for {field}: {value}")]
            if getattr(sch, field) != value:
                setattr(sch, field, value)
                changed.append(field)

        if not changed:
            return [TextContent(type="text", text=f"No changes for: {sch.name}")]

        sch.updated_at = datetime.now(timezone.utc)
        await db.commit()
        data = _fmt(sch)
        data["updated_fields"] = changed

    # Trigger incremental recompute: this scholarship against all users.
    from app.services.match_auto import trigger_scholarship_recompute
    trigger_scholarship_recompute(sch.id)

    return [TextContent(type="text", text=json.dumps(data, indent=2, default=str))]


# ── Document handlers ─────────────────────────────────────────────

async def _resolve_scholarship(db, id_or_slug):
    """Resolve scholarship by slug or UUID. Returns (sch, error_text)."""
    result = await db.execute(select(Scholarship).where(Scholarship.slug == id_or_slug))
    sch = result.scalar_one_or_none()
    if not sch:
        from uuid import UUID
        try:
            result = await db.execute(select(Scholarship).where(Scholarship.id == UUID(id_or_slug)))
            sch = result.scalar_one_or_none()
        except (ValueError, AttributeError):
            pass
    return sch


async def _handle_get_documents(args):
    id_or_slug = args.get("id_or_slug", "")
    async with AsyncSessionLocal() as db:
        sch = await _resolve_scholarship(db, id_or_slug)
        if not sch:
            return [TextContent(type="text", text=f"Not found: {id_or_slug}")]

        degree_docs = (await db.execute(
            select(ScholarshipDegreeDocument).where(ScholarshipDegreeDocument.scholarship_id == sch.id).order_by(ScholarshipDegreeDocument.degree_level)
        )).scalars().all()

        custom_docs = (await db.execute(
            select(ScholarshipCustomDocument).where(ScholarshipCustomDocument.scholarship_id == sch.id).order_by(ScholarshipCustomDocument.position)
        )).scalars().all()

        result = {"scholarship": sch.name, "slug": sch.slug, "degree_levels": sch.degree_levels or []}

        if degree_docs:
            result["degree_documents"] = [{
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
                "req_financial_proof": d.req_financial_proof,
                "req_photo": d.req_photo,
            } for d in degree_docs]
        else:
            result["degree_documents"] = "No per-level overrides — using flat defaults from scholarship fields."

        if custom_docs:
            result["custom_documents"] = [{
                "id": str(d.id), "name": d.name, "description": d.description,
                "required": d.required, "degree_level": d.degree_level,
            } for d in custom_docs]
        else:
            result["custom_documents"] = "No custom documents."

        return [TextContent(type="text", text=json.dumps(result, indent=2, default=str))]


async def _handle_set_degree_documents(args):
    id_or_slug = args.get("id_or_slug", "")
    documents = args.get("documents", [])
    if not documents:
        return [TextContent(type="text", text="documents array is required.")]

    async with AsyncSessionLocal() as db:
        sch = await _resolve_scholarship(db, id_or_slug)
        if not sch:
            return [TextContent(type="text", text=f"Not found: {id_or_slug}")]

        # Delete existing degree docs for the specified levels
        levels_specified = [d["degree_level"] for d in documents if "degree_level" in d]
        if levels_specified:
            await db.execute(
                sa_text("DELETE FROM scholarship_degree_documents WHERE scholarship_id = :sid AND degree_level = ANY(:levels)"),
                {"sid": str(sch.id), "levels": levels_specified},
            )

        created = []
        for doc_data in documents:
            level = doc_data.get("degree_level")
            if not level:
                continue
            defaults = auto_derive_for_level(level)
            doc = ScholarshipDegreeDocument(
                scholarship_id=sch.id,
                degree_level=level,
                req_transcripts=doc_data.get("req_transcripts", True),
                req_cv_resume=doc_data.get("req_cv_resume", True),
                req_sop_motivation_letter=doc_data.get("req_sop_motivation_letter", True),
                req_recommendation_letters=doc_data.get("req_recommendation_letters", True),
                req_english_test=doc_data.get("req_english_test", True),
                req_passport_or_id=doc_data.get("req_passport_or_id", True),
                req_financial_proof=doc_data.get("req_financial_proof", False),
                req_photo=doc_data.get("req_photo", False),
                previous_degree_required=doc_data.get("previous_degree_required") or defaults["previous_degree_required"],
                recommendation_letters_count=doc_data.get("recommendation_letters_count") or defaults["recommendation_letters_count"],
                research_proposal_required=doc_data.get("research_proposal_required") if "research_proposal_required" in doc_data else defaults["research_proposal_required"],
                writing_sample_required=doc_data.get("writing_sample_required") if "writing_sample_required" in doc_data else defaults["writing_sample_required"],
                standardized_test=doc_data.get("standardized_test") or defaults["standardized_test"],
                additional_required_documents=doc_data.get("additional_required_documents"),
            )
            db.add(doc)
            created.append(level)

        await db.commit()
        return [TextContent(type="text", text=f"Set degree documents for {sch.name}: {', '.join(created)}")]


async def _handle_add_custom_document(args):
    id_or_slug = args.get("id_or_slug", "")
    name = args.get("name", "").strip()
    if not name:
        return [TextContent(type="text", text="name is required.")]

    async with AsyncSessionLocal() as db:
        sch = await _resolve_scholarship(db, id_or_slug)
        if not sch:
            return [TextContent(type="text", text=f"Not found: {id_or_slug}")]

        # Get next position
        max_pos = (await db.execute(
            select(func.max(ScholarshipCustomDocument.position)).where(ScholarshipCustomDocument.scholarship_id == sch.id)
        )).scalar() or 0

        doc = ScholarshipCustomDocument(
            scholarship_id=sch.id,
            name=name,
            description=args.get("description"),
            required=args.get("required", True),
            degree_level=args.get("degree_level"),
            position=max_pos + 1,
        )
        db.add(doc)
        await db.commit()
        await db.refresh(doc)

        return [TextContent(type="text", text=json.dumps({
            "action": "created",
            "document": {
                "id": str(doc.id), "name": doc.name, "description": doc.description,
                "required": doc.required, "degree_level": doc.degree_level,
            },
            "scholarship": sch.name,
        }, indent=2))]


async def _handle_remove_custom_document(args):
    id_or_slug = args.get("id_or_slug", "")
    document_id = args.get("document_id", "")
    if not document_id:
        return [TextContent(type="text", text="document_id is required.")]

    from uuid import UUID
    async with AsyncSessionLocal() as db:
        sch = await _resolve_scholarship(db, id_or_slug)
        if not sch:
            return [TextContent(type="text", text=f"Not found: {id_or_slug}")]

        try:
            doc = (await db.execute(
                select(ScholarshipCustomDocument).where(
                    ScholarshipCustomDocument.id == UUID(document_id),
                    ScholarshipCustomDocument.scholarship_id == sch.id,
                )
            )).scalar_one_or_none()
        except ValueError:
            return [TextContent(type="text", text="Invalid document_id — must be a UUID.")]

        if not doc:
            return [TextContent(type="text", text=f"Document not found: {document_id}")]

        name = doc.name
        await db.delete(doc)
        await db.commit()
        return [TextContent(type="text", text=f"Removed custom document '{name}' from {sch.name}")]


# ── Blog helpers (imported from app.utils.blog) ──────────────────

from app.utils.blog import slugify as _slugify, reading_time as _reading_time


async def _sync_blog_tags(db: AsyncSession, post_id, body: str) -> None:
    slugs = extract_scholarship_slugs(body)
    if not slugs:
        await db.execute(sa_text("DELETE FROM blog_scholarship_tags WHERE blog_post_id = :pid"), {"pid": str(post_id)})
        return

    rows = await db.execute(select(Scholarship.id, Scholarship.slug).where(Scholarship.slug.in_(slugs)))
    slug_to_id = {r.slug: r.id for r in rows.all()}

    await db.execute(sa_text("DELETE FROM blog_scholarship_tags WHERE blog_post_id = :pid"), {"pid": str(post_id)})

    for i, slug in enumerate(slugs):
        sch_id = slug_to_id.get(slug)
        if sch_id:
            db.add(BlogScholarshipTag(blog_post_id=post_id, scholarship_id=sch_id, position_hint=i))


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
        # For stdio (local Claude Desktop): prefer super_admin, then admin, then any user
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
            ilike = f"%{search}%"
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
