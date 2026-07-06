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
from typing import Any

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.models.scholarship import Scholarship
from app.models.pending_scholarship import PendingScholarship
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
    return [TextContent(type="text", text=f"Unknown tool: {name}")]


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
        return [TextContent(type="text", text=json.dumps(_fmt(sch), indent=2, default=str))]


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

        from datetime import datetime, timezone
        sch.updated_at = datetime.now(timezone.utc)
        await db.commit()
        data = _fmt(sch)
        data["updated_fields"] = changed
        return [TextContent(type="text", text=json.dumps(data, indent=2, default=str))]


async def main():
    async with stdio_server() as (r, w):
        await server.run(r, w, server.create_initialization_options())


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
