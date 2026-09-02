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
    elif name == "validate_eligibility":
        return await _handle_validate_eligibility(arguments)
    return [TextContent(type="text", text=f"Unknown tool: {name}")]


# ── Scholarship handlers ──────────────────────────────────────────

async def _handle_add(args: dict[str, Any]) -> list[TextContent]:
    from app.mcp.handlers import submit_scholarship

    result = await submit_scholarship(args, submitted_by="mcp:local")
    return [TextContent(type="text", text=result.text)]


async def _handle_list(args: dict[str, Any]) -> list[TextContent]:
    from app.mcp.handlers import list_scholarships

    result = await list_scholarships(args)
    return [TextContent(type="text", text=result.text)]


async def _handle_get(args: dict[str, Any]) -> list[TextContent]:
    from app.mcp.handlers import get_scholarship

    result = await get_scholarship(args)
    return [TextContent(type="text", text=result.text)]


async def _handle_edit(args: dict[str, Any]) -> list[TextContent]:
    """Propose an edit to an existing scholarship.

    Thin adapter over the shared ``propose_scholarship_edit`` helper.
    Changes are NOT applied directly — they are queued as a
    PendingScholarship with target_scholarship_id for admin approval.
    """
    from app.mcp.handlers import (
        format_scholarship_edit_response,
        propose_scholarship_edit,
    )

    result = await propose_scholarship_edit(
        args=args,
        editable_fields=set(SCHOLARSHIP_FIELDS.keys()),
        submitted_by="mcp:local",
    )

    if not result["ok"]:
        if "no_changes" in result:
            return [TextContent(
                type="text",
                text=f"No changes detected for scholarship: {result['scholarship'].name}",
            )]
        return [TextContent(type="text", text=result["error"])]

    text = format_scholarship_edit_response(
        scholarship=result["scholarship"],
        pending=result["pending"],
        changes=result["changes"],
        doc_changes_summary=result["doc_changes_summary"],
    )
    return [TextContent(type="text", text=text)]


# ── Blog helpers (imported from app.utils.blog) ──────────────────

from app.utils.blog import slugify as _slugify, reading_time as _reading_time


async def _sync_blog_tags(db: AsyncSession, post_id, body: str) -> None:
    await _shared_sync(db, post_id, body)


# ── Blog handlers ─────────────────────────────────────────────────

async def _handle_blog_create(args: dict[str, Any]) -> list[TextContent]:
    from app.mcp.handlers import create_blog_post

    result = await create_blog_post(args, auth_identity="local")
    return [TextContent(type="text", text=result.text)]


async def _handle_blog_list(args: dict[str, Any]) -> list[TextContent]:
    from app.mcp.handlers import list_blog_posts

    result = await list_blog_posts(args)
    return [TextContent(type="text", text=result.text)]


async def _handle_blog_get(args: dict[str, Any]) -> list[TextContent]:
    from app.mcp.handlers import get_blog_post

    result = await get_blog_post(args)
    return [TextContent(type="text", text=result.text)]


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

        from app.mcp.handlers import apply_blog_post_changes, format_blog_edit_response
        from app.utils.scholarship_tags import (
            extract_scholarship_slugs,
            validate_scholarship_slugs,
        )

        changed, invalid_slugs = await apply_blog_post_changes(
            post,
            editable,
            auth_identity="local",
            slugify_fn=_slugify,
            db=db,
            extract_scholarship_slugs_fn=extract_scholarship_slugs,
            validate_scholarship_slugs_fn=validate_scholarship_slugs,
            sync_blog_scholarship_tags_fn=_sync_blog_tags,
            compute_reading_time_fn=_reading_time,
        )

        if invalid_slugs:
            # Body had unknown scholarship slugs — surface a helpful error.
            lines = [f"Invalid scholarship slugs: {', '.join(invalid_slugs)}"]
            for bad in invalid_slugs:
                sug = (await validate_scholarship_slugs(db, [bad])).get("suggestions", {}).get(bad, [])
                if sug:
                    lines.append(f"  '{bad}' did you mean: {', '.join(s['slug'] for s in sug)}")
            return [TextContent(type="text", text="\n".join(lines))]

        if not changed:
            return [TextContent(type="text", text=f"No changes for: {post.title}")]

        post.updated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(post)

        return [TextContent(
            type="text",
            text=json.dumps(format_blog_edit_response(post, changed), indent=2, default=str),
        )]


async def _handle_blog_categories() -> list[TextContent]:
    from app.mcp.handlers import list_blog_categories

    result = await list_blog_categories()
    return [TextContent(type="text", text=result.text)]


async def _handle_validate_eligibility(args: dict[str, Any]) -> list[TextContent]:
    from app.mcp.handlers import (
        format_validate_eligibility,
        parse_eligibility_args,
        run_validate_eligibility,
    )

    parsed = parse_eligibility_args(args)
    if parsed is None:
        return [TextContent(type="text", text="All four fields must be arrays of strings.")]
    inc_groups, inc_countries, exc_groups, exc_countries = parsed

    result = await run_validate_eligibility(
        inc_groups=inc_groups,
        inc_countries=inc_countries,
        exc_groups=exc_groups,
        exc_countries=exc_countries,
    )
    return [TextContent(type="text", text=format_validate_eligibility(result))]


async def main():
    async with stdio_server() as (r, w):
        await server.run(r, w, server.create_initialization_options())


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
