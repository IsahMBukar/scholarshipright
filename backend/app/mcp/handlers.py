"""Shared MCP tool business logic.

Both the stdio transport (`app/mcp/server.py`) and the SSE/HTTP transport
(`app/api/mcp_sse.py`) call into this module. Each transport adapts the
result to its own response shape (TextContent list vs JSON-RPC dict).

Keep functions in here transport-agnostic — no mcp.types imports, no
StreamingResponse, no JSON-RPC wrapping.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.blog import BlogPost
from app.services.eligibility import validate_eligibility_inputs

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

    Transport-agnostic. Both stdio and SSE serialize this the same way
    so an agent gets identical feedback regardless of transport.
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
