"""Shared MCP tool business logic.

Both the stdio transport (`app/mcp/server.py`) and the SSE/HTTP transport
(`app/api/mcp_sse.py`) call into this module. Each transport adapts the
result to its own response shape (TextContent list vs JSON-RPC dict).

Keep functions in here transport-agnostic — no mcp.types imports, no
StreamingResponse, no JSON-RPC wrapping.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date as date_type, datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import func, select

from app.db.session import AsyncSessionLocal
from app.models.blog import BlogPost, BlogScholarshipTag, extract_scholarship_slugs
from app.models.pending_scholarship import PendingScholarship
from app.models.scholarship import Scholarship
from app.services.eligibility import validate_eligibility_inputs
from app.utils.db import escape_like
from app.utils.scholarship_tags import validate_scholarship_slugs

logger = logging.getLogger("scholara.mcp.handlers")


# ── Input parsing ───────────────────────────────────────────────────


def parse_eligibility_args(args: dict[str, Any]) -> tuple[list[str], list[str], list[str], list[str]] | None:
    """Pull the four eligibility arrays from raw MCP args.

    Returns (inc_groups, inc_countries, exc_groups, exc_countries) or
    None if any field is not a list of strings.
    """
    inc_groups = args.get("included_groups", []) or []
    inc_countries = args.get("included_countries", []) or []
    exc_groups = args.get("excluded_groups", []) or []
    exc_countries = args.get("excluded_countries", []) or []

    if (
        not isinstance(inc_groups, list)
        or not isinstance(inc_countries, list)
        or not isinstance(exc_groups, list)
        or not isinstance(exc_countries, list)
    ):
        return None
    return inc_groups, inc_countries, exc_groups, exc_countries


# ── validate_eligibility ────────────────────────────────────────────


def format_validate_eligibility(result: dict[str, Any]) -> str:
    """Format a validate_eligibility_inputs() result as human-readable text.

    Transport-agnostic. Both stdio and SSE render the same lines so an
    agent sees the same output regardless of which transport it uses.
    """
    lines = [f"Resolved: {result['resolved_count']} country(s)"]
    if result.get("sample_resolved"):
        lines.append(f"Sample: {', '.join(result['sample_resolved'])}")
    else:
        lines.append("Sample: (none)")
    if result.get("unresolved"):
        lines.append("Unresolved: TRUE — eligibility will be flagged for admin review")
    warnings = result.get("warnings") or []
    if warnings:
        lines.append("")
        lines.append("Warnings:")
        for w in warnings:
            lines.append(f"  - {w}")
    return "\n".join(lines)


async def run_validate_eligibility(
    inc_groups: list[str],
    inc_countries: list[str],
    exc_groups: list[str],
    exc_countries: list[str],
) -> dict[str, Any]:
    """Run the dry-run resolver and return the structured result dict.

    The dict contains: resolved_count, sample_resolved, unresolved,
    unresolved_groups, warnings, excluded_countries_not_in_set,
    excluded_groups_not_in_set. Use format_validate_eligibility() to
    render the human-readable version.
    """
    async with AsyncSessionLocal() as db:
        return await validate_eligibility_inputs(
            included_groups=inc_groups,
            included_countries=inc_countries,
            excluded_groups=exc_groups,
            excluded_countries=exc_countries,
            db=db,
        )


# ── Blog edit shared logic ─────────────────────────────────────────

# Fields whose before/after is worth tracking for the admin diff.
_TRACKED_BLOG_FIELDS = ("title", "excerpt", "body", "cover_image_url", "category", "tags")


async def apply_blog_post_changes(
    post: Any,
    editable: dict[str, Any],
    *,
    auth_identity: str,
    slugify_fn: Any,
    db: Any,
    extract_scholarship_slugs_fn: Any,
    validate_scholarship_slugs_fn: Any,
    sync_blog_scholarship_tags_fn: Any,
    compute_reading_time_fn: Any,
) -> tuple[list[str], list[str]]:
    """Mutate a BlogPost in-place from a validated editable dict.

    Returns (changed, invalid_slugs):
      - changed: list of field names that were updated. [] if the call
        short-circuited early (invalid scholarship slugs in body) or
        no fields were editable.
      - invalid_slugs: list of bad slugs; [] on success.

    The caller is responsible for committing the session.

    Handles:
      - title change → slug regen with collision suffix
      - body change → scholarship slug validation, body, reading time, tags
      - excerpt / cover / category / tags → straight set
      - status change → published_at + clears pending_changes
      - implicit reversion to pending_review when a live post is edited
        without an explicit status set
      - pending_changes JSONB diff snapshot for the admin UI
    """
    old_values: dict[str, Any] = {
        f: getattr(post, f) for f in _TRACKED_BLOG_FIELDS if f in editable
    }
    changed: list[str] = []

    if "title" in editable:
        new_slug = slugify_fn(editable["title"])
        slug_exists = await db.execute(
            select(BlogPost.id).where(BlogPost.slug == new_slug, BlogPost.id != post.id)
        )
        if slug_exists.scalar_one_or_none():
            new_slug = f"{new_slug}-{uuid4().hex[:6]}"
        post.slug = new_slug
        post.title = editable["title"]
        changed.append("title")

    if "body" in editable:
        slugs = extract_scholarship_slugs_fn(editable["body"])
        if slugs:
            v = await validate_scholarship_slugs_fn(db, slugs)
            if v["invalid"]:
                return changed, v["invalid"]
        post.body = editable["body"]
        post.reading_time_minutes = compute_reading_time_fn(editable["body"])
        await sync_blog_scholarship_tags_fn(db, post.id, editable["body"])
        changed.append("body")

    for field in ("excerpt", "cover_image_url", "category", "tags"):
        if field in editable:
            setattr(post, field, editable[field])
            changed.append(field)

    reverted_to_review = False
    if "status" in editable:
        new_status = editable["status"]
        if new_status == "published" and post.status != "published":
            post.published_at = datetime.now(timezone.utc)
        # Leaving pending_review (publish/approve, reject/archive, etc.)
        # clears the tracked before/after diff — mirrors the REST update path.
        if new_status != "pending_review":
            post.pending_changes = None
        post.status = new_status
        changed.append("status")
    elif post.status == "published" and changed:
        # Agent edited a live post without explicitly setting status →
        # revert to pending_review so admin re-approves before it goes live.
        post.status = "pending_review"
        changed.append("status→pending_review")
        reverted_to_review = True

    # Track what the agent changed while the post awaits re-approval,
    # so the admin blogs UI can show a before/after diff.
    if reverted_to_review or (post.status == "pending_review" and changed):
        post.pending_changes = {
            "edited_via": f"mcp:{auth_identity}",
            "changed_fields": changed,
            "old": {f: old_values[f] for f in changed if f in old_values},
        }

    return changed, []


def format_blog_edit_response(post: Any, changed: list[str]) -> dict[str, Any]:
    """Build the JSON response payload for a successful blog edit.

    Transport-agnostic. Both stdio and SSE serialize the same way so an
    agent gets identical feedback regardless of transport.
    """
    data: dict[str, Any] = {
        "id": str(post.id),
        "title": post.title,
        "slug": post.slug,
        "status": post.status,
        "updated_fields": changed,
    }
    if post.status == "pending_review":
        data["note"] = (
            "Post set to pending_review with tracked changes — "
            "admin will review the diff before it goes live again."
        )
    return data


# ── Scholarship edit shared logic ──────────────────────────────────

# Date-typed fields need ISO string → date coercion before diffing.
_SCHOLARSHIP_DATE_FIELDS = {"deadline", "open_date", "program_start_date"}


def _coerce_date(value: Any) -> Any:
    """If value is an ISO date string, return a date object. Pass-through otherwise."""
    if isinstance(value, str):
        try:
            return date_type.fromisoformat(value)
        except ValueError:
            return value
    return value


async def _find_scholarship(db: Any, id_or_slug: str) -> Any | None:
    """Lookup by slug first, then by UUID. Returns the row or None."""
    from sqlalchemy import select as _sel  # local import to avoid cycle
    result = await db.execute(_sel(Scholarship).where(Scholarship.slug == id_or_slug))
    sch = result.scalar_one_or_none()
    if sch:
        return sch
    try:
        uuid_value = UUID(id_or_slug)
    except (ValueError, AttributeError):
        return None
    result = await db.execute(_sel(Scholarship).where(Scholarship.id == uuid_value))
    return result.scalar_one_or_none()


async def propose_scholarship_edit(
    args: dict[str, Any],
    editable_fields: set[str],
    submitted_by: str,
    agent_key_id: Any | None = None,
) -> dict[str, Any]:
    """Compute the edit diff and queue a PendingScholarship for admin review.

    Returns a dict ready for transport adaptation:
      - on success: {"ok": True, "scholarship": sch, "pending": pending,
        "changes": dict, "doc_changes_summary": list[str]}
      - on bad input: {"ok": False, "error": str}
      - on no changes: {"ok": False, "no_changes": True, "scholarship": sch}

    The caller commits the session (handled inside this function via
    AsyncSessionLocal) and formats the response.
    """
    id_or_slug = args.get("id_or_slug", "").strip()
    if not id_or_slug:
        return {"ok": False, "error": "id_or_slug is required."}

    inline_degree_docs = args.get("degree_documents")
    inline_custom_docs = args.get("custom_documents")

    editable = {
        k: v for k, v in args.items()
        if k not in ("id_or_slug", "degree_documents", "custom_documents")
        and k in editable_fields
    }
    if not editable and inline_degree_docs is None and inline_custom_docs is None:
        return {"ok": False, "error": "No fields to update. Pass at least one field besides id_or_slug."}

    async with AsyncSessionLocal() as db:
        sch = await _find_scholarship(db, id_or_slug)
        if not sch:
            return {"ok": False, "error": f"Scholarship not found: {id_or_slug}"}

        # Compute the field-level diff against the live record.
        changes: dict[str, dict] = {}
        for field, value in editable.items():
            if not hasattr(sch, field):
                continue
            old = getattr(sch, field)
            if field in _SCHOLARSHIP_DATE_FIELDS:
                coerced = _coerce_date(value)
                if isinstance(coerced, str):
                    # Bad date string — surface a clear error.
                    return {
                        "ok": False,
                        "error": f"Invalid date format for {field}: {value}. Use YYYY-MM-DD.",
                    }
                value = coerced
            if old != value:
                changes[field] = {
                    "old": str(old) if old is not None else None,
                    "new": value.isoformat() if isinstance(value, date_type) else value,
                }

        doc_changes_summary: list[str] = []
        if inline_degree_docs is not None:
            levels = [d.get("degree_level", "?") for d in inline_degree_docs]
            doc_changes_summary.append(f"Replace degree documents: {', '.join(levels)}")
        if inline_custom_docs is not None:
            names = [d.get("name", "?") for d in inline_custom_docs]
            doc_changes_summary.append(
                f"Replace custom documents with {len(inline_custom_docs)} item(s): {', '.join(names)}"
            )

        if not changes and not doc_changes_summary:
            return {"ok": False, "no_changes": True, "scholarship": sch}

        pending_kwargs: dict[str, Any] = {
            "payload": {
                "is_edit": True,
                "scholarship_name": sch.name,
                "scholarship_slug": sch.slug,
                "changes": changes,
                "doc_changes_summary": doc_changes_summary,
                "degree_documents": inline_degree_docs,
                "custom_documents": inline_custom_docs,
            },
            "submitted_by": submitted_by,
            "status": "pending_review",
            "target_scholarship_id": sch.id,
        }
        if agent_key_id is not None:
            pending_kwargs["agent_key_id"] = agent_key_id
        pending = PendingScholarship(**pending_kwargs)
        db.add(pending)
        await db.commit()
        await db.refresh(pending)

        return {
            "ok": True,
            "scholarship": sch,
            "pending": pending,
            "changes": changes,
            "doc_changes_summary": doc_changes_summary,
        }


def format_scholarship_edit_response(
    scholarship: Any,
    pending: Any,
    changes: dict[str, dict],
    doc_changes_summary: list[str],
) -> str:
    """Format a successful scholarship-edit response as plain text.

    Includes the deadline-notification hint when the deadline was changed,
    so agents don't fire a redundant notification themselves.
    """
    lines = [
        f"Edit proposed for scholarship '{scholarship.name}' (proposal ID: {pending.id})",
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

    # If the agent extended the deadline, the savers-notification fires
    # when the admin approves (not at queueing time). Tell them so they
    # don't fire a redundant notification themselves.
    if "deadline" in changes:
        lines.append("")
        lines.append(
            "Note: extending the deadline will notify users who saved this "
            "scholarship, but only after an admin approves the edit."
        )

    return "\n".join(lines)


# â”€â”€ Shared tool result type â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


@dataclass
class ToolResult:
    """Transport-agnostic result from a shared MCP tool.

    The transport adapter turns this into the right response shape:
      - stdio: ``TextContent(type="text", text=...)``; ``is_error=True`` -> error
      - SSE:   ``{"content": [...], "isError": ...}``
    """
    text: str
    is_error: bool = False
    structured: dict[str, Any] | None = None


# â”€â”€ Scholarship submit (add) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


REQUIRED_FIELDS = ("name", "host_country", "funding_type", "deadline", "official_url")


async def submit_scholarship(
    args: dict[str, Any],
    submitted_by: str,
) -> ToolResult:
    """Queue a new scholarship for admin review.

    Args:
        args: Raw MCP arguments. Must include name, host_country,
            funding_type, deadline, official_url.
        submitted_by: Identity string for the PendingScholarship row
            (e.g. ``mcp:local`` for stdio, ``mcp:<key-name>`` for SSE).
    """
    missing = [f for f in REQUIRED_FIELDS if f not in args]
    if missing:
        return ToolResult(
            text=f"Missing required fields: {', '.join(missing)}",
            is_error=True,
        )

    # The SSE transport validates the URL prefix; mirror that here so
    # stdio clients get the same protection.
    url = args.get("official_url", "")
    if url and not url.startswith(("http://", "https://")):
        return ToolResult(
            text="official_url must start with http:// or https://",
            is_error=True,
        )

    async with AsyncSessionLocal() as db:
        search_name = args["name"].lower().strip()
        result = await db.execute(
            select(Scholarship)
            .where(func.lower(Scholarship.name).ilike(f"%{escape_like(search_name)}%"))
            .limit(5)
        )
        dupes = result.scalars().all()

        pending = PendingScholarship(
            payload=args,
            submitted_by=submitted_by,
            status="pending_review",
        )
        db.add(pending)
        await db.commit()
        await db.refresh(pending)

        lines = [
            f"Submitted to review queue (ID: {pending.id})",
            "Status: pending_review â€” admin will review before it goes live.",
        ]
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

    return ToolResult(text="\n".join(lines))


# â”€â”€ Scholarship list (search) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


def _format_scholarship_row(s: Any) -> str:
    return f"- {s.name} | {s.host_country} | {s.funding_type} | Deadline: {s.deadline} | Slug: {s.slug}"


async def list_scholarships(args: dict[str, Any]) -> ToolResult:
    """Search active scholarships by name or host country."""
    search = (args.get("search") or "").strip()
    limit = max(1, min(50, int(args.get("limit") or 10)))

    async with AsyncSessionLocal() as db:
        query = select(Scholarship).where(Scholarship.is_active == True)  # noqa: E712
        if search:
            pattern = f"%{escape_like(search)}%"
            query = query.where(
                Scholarship.name.ilike(pattern)
                | Scholarship.host_country.ilike(pattern)
            )
        query = query.order_by(Scholarship.created_at.desc()).limit(limit)
        rows = (await db.execute(query)).scalars().all()

    if not rows:
        return ToolResult(text="No scholarships found.")
    lines = [f"Found {len(rows)} scholarship(s):\n"]
    lines.extend(_format_scholarship_row(s) for s in rows)
    return ToolResult(text="\n".join(lines))


# â”€â”€ Scholarship get (one) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


async def get_scholarship(args: dict[str, Any]) -> ToolResult:
    """Get a single scholarship by slug or UUID."""
    id_or_slug = (args.get("id_or_slug") or "").strip()
    if not id_or_slug:
        return ToolResult(text="id_or_slug is required.", is_error=True)

    async with AsyncSessionLocal() as db:
        sch = await _find_scholarship_by_id_or_slug(db, id_or_slug)
        if not sch:
            return ToolResult(text=f"Not found: {id_or_slug}", is_error=True)

        data = {
            "id": str(sch.id),
            "name": sch.name,
            "slug": sch.slug,
            "host_country": sch.host_country,
            "host_institution": sch.host_institution,
            "provider": sch.provider,
            "degree_levels": sch.degree_levels,
            "funding_type": sch.funding_type,
            "deadline": str(sch.deadline) if sch.deadline else None,
            "official_url": sch.official_url,
            "is_active": sch.is_active,
        }
    return ToolResult(text=json.dumps(data, indent=2, default=str))


async def _find_scholarship_by_id_or_slug(db: Any, id_or_slug: str) -> Any | None:
    """Slug-first, then UUID lookup. Used by get_scholarship."""
    result = await db.execute(
        select(Scholarship).where(Scholarship.slug == id_or_slug)
    )
    sch = result.scalar_one_or_none()
    if sch:
        return sch
    try:
        uuid_value = UUID(id_or_slug)
    except (ValueError, AttributeError):
        return None
    result = await db.execute(
        select(Scholarship).where(Scholarship.id == uuid_value)
    )
    return result.scalar_one_or_none()


# â”€â”€ Blog create â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


def _pick_blog_author_id(db: Any) -> Any | None:
    """Find an admin to attribute the post to (admin â†’ super_admin â†’ first user)."""
    from app.models.user import User

    for role_filter in [
        User.is_admin == True,  # noqa: E712
        User.admin_role == "super_admin",
    ]:
        row = db.execute(select(User.id).where(role_filter).limit(1))
        author_id = row.scalar_one_or_none()
        if author_id:
            return author_id
    row = db.execute(select(User.id).limit(1))
    return row.scalar_one_or_none()


def _validate_blog_body_slugs(db: Any, body: str) -> list[str] | None:
    """Return None if all @[scholarship:slug] markers resolve, else the
    list of bad slugs."""
    slugs = extract_scholarship_slugs(body)
    if not slugs:
        return None
    v = validate_scholarship_slugs(db, slugs)
    return v["invalid"] if v["invalid"] else None


async def _sync_blog_scholarship_tags(db: Any, post_id: Any, body: str) -> None:
    """Update the @[scholarship:slug] tag rows for a post."""
    from app.utils.scholarship_tags import sync_scholarship_tags
    await sync_scholarship_tags(db, post_id, body)


async def create_blog_post(
    args: dict[str, Any],
    auth_identity: str,
    agent_key_id: Any | None = None,
) -> ToolResult:
    """Create a new blog post (defaults to pending_review for AI agents)."""
    required = ("title", "body")
    missing = [f for f in required if f not in args]
    if missing:
        return ToolResult(
            text=f"Missing required fields: {', '.join(missing)}",
            is_error=True,
        )

    title = args["title"].strip()
    body = args["body"].strip()
    if len(title) < 3:
        return ToolResult(text="Title must be at least 3 characters.", is_error=True)
    if len(body) < 10:
        return ToolResult(text="Body must be at least 10 characters.", is_error=True)

    status = args.get("status", "pending_review")

    from app.utils.blog import reading_time, slugify
    from app.models.blog import BlogPost

    async with AsyncSessionLocal() as db:
        # Validate scholarship slugs in the body before insert.
        invalid = _validate_blog_body_slugs(db, body)
        if invalid:
            lines = [f"Invalid scholarship slugs: {', '.join(invalid)}"]
            for bad in invalid:
                sug = (await validate_scholarship_slugs(db, [bad])).get(
                    "suggestions", {}
                ).get(bad, [])
                if sug:
                    lines.append(
                        f"  '{bad}' did you mean: {', '.join(s['slug'] for s in sug)}"
                    )
            return ToolResult(text="\n".join(lines), is_error=True)

        author_id = _pick_blog_author_id(db)
        if not author_id:
            return ToolResult(
                text="No users found. Cannot assign author.", is_error=True,
            )

        slug = slugify(title)
        existing = (await db.execute(
            select(BlogPost.id).where(BlogPost.slug == slug)
        )).scalar_one_or_none()
        if existing:
            slug = f"{slug}-{uuid4().hex[:6]}"

        now = datetime.now(timezone.utc)
        post = BlogPost(
            author_id=author_id,
            title=title,
            slug=slug,
            excerpt=args.get("excerpt"),
            body=body,
            cover_image_url=args.get("cover_image_url"),
            category=args.get("category", "general"),
            tags=args.get("tags", []),
            reading_time_minutes=reading_time(body),
            status=status,
            published_at=now if status == "published" else None,
        )
        db.add(post)
        await db.flush()
        await _sync_blog_scholarship_tags(db, post.id, body)
        await db.commit()
        await db.refresh(post)

    data = {
        "id": str(post.id),
        "title": post.title,
        "slug": post.slug,
        "status": post.status,
        "url": f"/blog/{post.slug}",
    }
    if status == "pending_review":
        data["note"] = "pending_review â€” admin will review before it goes live."
    elif status == "draft":
        data["note"] = "Saved as draft."

    structured = {
        "id": str(post.id),
        "title": post.title,
        "slug": post.slug,
        "status": post.status,
    }
    return ToolResult(
        text=json.dumps(data, indent=2, default=str),
        structured=structured,
    )


# â”€â”€ Blog list â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


async def list_blog_posts(args: dict[str, Any]) -> ToolResult:
    """List published blog posts (optionally filtered by category or tag)."""
    import math
    search = (args.get("search") or "").strip()
    category = args.get("category")
    tag = args.get("tag")
    page = max(1, int(args.get("page") or 1))
    limit = min(50, max(1, int(args.get("limit") or 10)))

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

        rows = (
            await db.execute(
                base.order_by(BlogPost.published_at.desc())
                .offset((page - 1) * limit)
                .limit(limit)
            )
        ).scalars().all()

    if not rows:
        return ToolResult(text="No blog posts found.")

    lines = [f"Found {total} post(s), page {page}/{pages}:\n"]
    for p in rows:
        tags_str = f" [{', '.join(p.tags)}]" if p.tags else ""
        lines.append(
            f"- {p.title} | {p.category} | {p.reading_time_minutes}min | Slug: {p.slug}{tags_str}"
        )
    return ToolResult(text="\n".join(lines))


# â”€â”€ Blog get (one) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


async def get_blog_post(args: dict[str, Any]) -> ToolResult:
    """Get a blog post by slug or UUID."""
    slug_or_id = (args.get("slug_or_id") or "").strip()
    if not slug_or_id:
        return ToolResult(text="slug_or_id is required.", is_error=True)

    from app.models.user import User

    async with AsyncSessionLocal() as db:
        row = await db.execute(
            select(BlogPost).where(BlogPost.slug == slug_or_id, BlogPost.status == "published")
        )
        post = row.scalar_one_or_none()

        if not post:
            try:
                row = await db.execute(
                    select(BlogPost).where(BlogPost.id == UUID(slug_or_id))
                )
                post = row.scalar_one_or_none()
            except (ValueError, AttributeError):
                pass

        if not post:
            return ToolResult(text=f"Not found: {slug_or_id}", is_error=True)

        author = (
            await db.execute(select(User.full_name).where(User.id == post.author_id))
        ).scalar()

    data = {
        "id": str(post.id),
        "title": post.title,
        "slug": post.slug,
        "excerpt": post.excerpt,
        "body": post.body,
        "cover_image_url": post.cover_image_url,
        "category": post.category,
        "tags": post.tags or [],
        "reading_time_minutes": post.reading_time_minutes,
        "view_count": post.view_count,
        "status": post.status,
        "author_name": author or "Anonymous",
        "published_at": post.published_at.isoformat() if post.published_at else None,
        "created_at": post.created_at.isoformat(),
        "updated_at": post.updated_at.isoformat(),
    }
    return ToolResult(text=json.dumps(data, indent=2, default=str))


# â”€â”€ Blog categories â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


async def list_blog_categories() -> ToolResult:
    """List distinct categories from published blog posts."""
    async with AsyncSessionLocal() as db:
        rows = await db.execute(
            select(BlogPost.category)
            .where(BlogPost.status == "published")
            .distinct()
            .order_by(BlogPost.category)
        )
        categories = [r[0] for r in rows.all()]

    if not categories:
        return ToolResult(text="No blog categories found.")
    return ToolResult(text="Categories:\n" + "\n".join(f"- {c}" for c in categories))

