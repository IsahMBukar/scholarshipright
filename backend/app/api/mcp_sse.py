"""
MCP Streamable HTTP transport — supports both SSE and direct POST.

Claude.ai uses the Streamable HTTP transport:
  POST /mcp/sse → JSON-RPC request → returns JSON-RPC response
  GET  /mcp/sse → opens SSE stream for server-initiated messages

Security:
  Every request must include: Authorization: Bearer ***
  Auth is validated via API key OR OAuth JWT (dual auth).
  Rate limited per key (configurable per-hour limit).
  All tool calls logged to mcp_request_log table.

OAuth Discovery:
  /.well-known/oauth-protected-resource → metadata for OAuth clients
"""
import asyncio
import json
import logging
import os
import uuid
from typing import Any, Optional

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db, AsyncSessionLocal
from app.models.scholarship import Scholarship
from app.models.pending_scholarship import PendingScholarship
from app.mcp.schemas import get_tool_schemas
from app.mcp.security import require_mcp_auth, McpAuthRecord, log_mcp_request
from app.mcp.oauth import (
    is_oauth_enabled,
    get_protected_resource_metadata,
    get_www_authenticate_header,
)

logger = logging.getLogger("scholarshipright.mcp_sse")

router = APIRouter(tags=["mcp"])

# SSE connections for server-initiated messages
_connections: dict[str, asyncio.Queue] = {}


# ---------------------------------------------------------------------------
# OAuth discovery endpoint
# ---------------------------------------------------------------------------

@router.get("/.well-known/oauth-protected-resource")
async def oauth_protected_resource_metadata():
    """RFC 9728 — Protected Resource Metadata.

    OAuth clients (Claude.ai, ChatGPT) hit this to discover:
    - Which authorization server to use
    - What scopes are supported
    - How to obtain tokens
    """
    if not is_oauth_enabled():
        return JSONResponse(
            status_code=404,
            content={"detail": "OAuth not enabled on this server"},
        )
    return JSONResponse(
        content=get_protected_resource_metadata(),
        headers={"Cache-Control": "no-store"},
    )


@router.get("/.well-known/oauth-authorization-server")
async def oauth_authorization_server_metadata():
    """RFC 8414 — Authorization Server Metadata.

    Returns our own authorization server metadata so MCP clients
    (Claude.ai, ChatGPT, etc.) redirect users to our custom login
    form instead of Scalekit's consent page.

    authorization_endpoint → /api/auth/mcp-authorize (custom login)
    token_endpoint         → /api/auth/mcp-token (code → JWT exchange)
    """
    if not is_oauth_enabled():
        return JSONResponse(
            status_code=404,
            content={"detail": "OAuth not enabled on this server"},
        )

    server_url = os.environ.get("MCP_OAUTH_SERVER_URL", "").rstrip("/")
    if not server_url:
        return JSONResponse(
            status_code=500,
            content={"detail": "MCP_OAUTH_SERVER_URL not configured"},
        )

    metadata = {
        "issuer": server_url,
        "authorization_endpoint": f"{server_url}/api/auth/mcp-authorize",
        "token_endpoint": f"{server_url}/api/auth/mcp-token",
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code"],
        "code_challenge_methods_supported": ["S256"],
        "scopes_supported": ["scholarships:read", "scholarships:write"],
        "token_endpoint_auth_methods_supported": ["none"],
        "registration_endpoint": f"{server_url}/api/auth/mcp-register",
    }
    return JSONResponse(
        content=metadata,
        headers={"Cache-Control": "no-store"},
    )


# ---------------------------------------------------------------------------
# MCP endpoint (dual auth)
# ---------------------------------------------------------------------------

@router.api_route("/mcp/sse", methods=["GET", "POST"])
async def mcp_endpoint(
    request: Request,
    auth: McpAuthRecord = Depends(require_mcp_auth),
):
    """Unified MCP endpoint — handles both SSE stream (GET) and JSON-RPC (POST).

    Requires valid auth (API key or OAuth token).
    """
    logger.info("MCP request from auth=%s method=%s name=%s",
                auth.auth_method, request.method, auth.name)

    if request.method == "GET":
        return await _handle_sse(request, auth)
    else:
        return await _handle_jsonrpc(request, auth)


async def _handle_sse(request: Request, auth: McpAuthRecord) -> StreamingResponse:
    """GET — open SSE stream for server-initiated messages."""
    conn_id = str(uuid.uuid4())
    queue: asyncio.Queue = asyncio.Queue()
    _connections[conn_id] = queue

    logger.info("MCP SSE client connected: %s (auth=%s, name=%s)", conn_id, auth.auth_method, auth.name)

    async def event_stream():
        try:
            yield f"event: endpoint\ndata: /mcp/messages\n\n"

            while True:
                if await request.is_disconnected():
                    break
                try:
                    message = await asyncio.wait_for(queue.get(), timeout=30)
                    yield f"event: message\ndata: {json.dumps(message)}\n\n"
                except asyncio.TimeoutError:
                    yield f": keepalive\n\n"
        finally:
            _connections.pop(conn_id, None)
            logger.info("MCP SSE client disconnected: %s", conn_id)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


async def _handle_jsonrpc(request: Request, auth: McpAuthRecord):
    """POST — handle JSON-RPC request and return response."""
    body = await request.json()

    # Handle batch requests
    if isinstance(body, list):
        results = []
        for msg in body:
            result = await _process_message(msg, request, auth)
            results.append(result)
        return JSONResponse(content=results)

    result = await _process_message(body, request, auth)
    return JSONResponse(content=result)


async def _process_message(body: dict, request: Request, auth: McpAuthRecord) -> dict:
    """Process a single JSON-RPC message."""
    method = body.get("method", "")
    params = body.get("params", {})
    msg_id = body.get("id")

    logger.info("MCP method: %s (id=%s, auth=%s, name=%s)", method, msg_id, auth.auth_method, auth.name)

    # Notifications (no id) don't need a response
    if msg_id is None:
        if method == "notifications/initialized":
            return {"jsonrpc": "2.0", "result": None}
        return {"jsonrpc": "2.0", "result": None}

    # Request/Response
    try:
        if method == "initialize":
            result = {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}},
                "serverInfo": {
                    "name": "scholarshipright-mcp",
                    "version": "1.0.0",
                },
            }
        elif method == "tools/list":
            schemas = get_tool_schemas()
            tools = []
            for name, spec in schemas.items():
                tools.append({
                    "name": name,
                    "description": spec["description"],
                    "inputSchema": spec["inputSchema"],
                })
            result = {"tools": tools}
        elif method == "tools/call":
            tool_name = params.get("name", "")
            arguments = params.get("arguments", {})
            result = await _call_tool(tool_name, arguments, request, auth)
        else:
            return {
                "jsonrpc": "2.0",
                "id": msg_id,
                "error": {"code": -32601, "message": f"Method not found: {method}"},
            }

        return {"jsonrpc": "2.0", "id": msg_id, "result": result}

    except Exception as e:
        logger.exception("MCP error processing %s", method)
        return {
            "jsonrpc": "2.0",
            "id": msg_id,
            "error": {"code": -32603, "message": str(e)},
        }


@router.post("/mcp/messages")
async def mcp_messages(
    request: Request,
    auth: McpAuthRecord = Depends(require_mcp_auth),
):
    """POST endpoint for MCP messages (alternative path)."""
    return await _handle_jsonrpc(request, auth)


def _get_auth_identity(auth: McpAuthRecord) -> Optional[str]:
    """Get a human-readable identity string for logging.

    API key → key name (e.g. "Claude Desktop Agent")
    OAuth  → email from JWT claims, or client_id fallback
    stdio  → "claude-desktop"
    """
    if auth.auth_method == "api_key":
        return auth.name
    # OAuth: prefer email from claims, fallback to client_id
    email = auth.oauth_claims.get("email")
    if email:
        return email
    return auth.name  # client_id or "oauth-client"


async def _call_tool(
    name: str,
    args: dict[str, Any],
    request: Request,
    auth: McpAuthRecord,
) -> dict:
    """Handle a tools/call request with scope checking and logging."""
    ip = request.client.host if request.client else "unknown"
    ua = request.headers.get("user-agent", "unknown")

    # Scope check: write operations require "scholarships:write" scope
    _write_tools = {"add_scholarship", "edit_scholarship"}
    if name in _write_tools and not auth.has_scope("scholarships:write"):
        logger.warning(
            "MCP scope denied: auth=%s name=%s tool=%s (needs write scope)",
            auth.auth_method, auth.name, name,
        )
        return {
            "content": [{"type": "text", "text": "Insufficient scope — scholarships:write required. Your token only has read access."}],
            "isError": True,
        }

    # Auth identity for logging: key name for API keys, email for OAuth
    identity = _get_auth_identity(auth)

    try:
        if name == "add_scholarship":
            result = await _handle_add(args)
        elif name == "list_scholarships":
            result = await _handle_list(args)
        elif name == "get_scholarship":
            result = await _handle_get(args)
        elif name == "edit_scholarship":
            result = await _handle_edit(args)
        else:
            result = {
                "content": [{"type": "text", "text": f"Unknown tool: {name}"}],
                "isError": True,
            }

        # Log successful request
        async with AsyncSessionLocal() as db:
            await log_mcp_request(db, auth.id, name, args, ip, ua, success=True, auth_method=auth.auth_method, auth_identity=identity)

        return result

    except Exception as e:
        # Log failed request
        async with AsyncSessionLocal() as db:
            await log_mcp_request(db, auth.id, name, args, ip, ua, success=False, error_message=str(e), auth_method=auth.auth_method, auth_identity=identity)
        raise


async def _handle_add(args: dict[str, Any]) -> dict:
    """Add scholarship to pending review queue."""
    required = ["name", "host_country", "funding_type", "deadline", "official_url"]
    missing = [f for f in required if f not in args]
    if missing:
        return {
            "content": [{"type": "text", "text": f"Missing required fields: {', '.join(missing)}"}],
            "isError": True,
        }

    # Validate URLs
    url = args.get("official_url", "")
    if url and not url.startswith(("http://", "https://")):
        return {
            "content": [{"type": "text", "text": "official_url must start with http:// or https://"}],
            "isError": True,
        }

    async with AsyncSessionLocal() as db:
        search_name = args["name"].lower().strip()
        result = await db.execute(
            select(Scholarship).where(
                func.lower(Scholarship.name).ilike(f"%{search_name}%")
            ).limit(5)
        )
        dupes = result.scalars().all()

        pending = PendingScholarship(
            payload=args,
            submitted_by=f"mcp:{args.get('_key_name', 'remote')}",
            status="pending_review",
        )
        db.add(pending)
        await db.commit()
        await db.refresh(pending)

        lines = [
            f"Scholarship submitted to review queue (ID: {pending.id})",
            f"Status: pending_review",
            f"Admin will review before it goes live.",
        ]

        if dupes:
            lines.append(f"\nPotential duplicates found:")
            for d in dupes[:3]:
                lines.append(f"  - {d.name} ({d.host_country}, {d.funding_type})")

        return {"content": [{"type": "text", "text": "\n".join(lines)}]}


async def _handle_list(args: dict[str, Any]) -> dict:
    """List scholarships."""
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
            return {"content": [{"type": "text", "text": "No scholarships found."}]}

        lines = [f"Found {len(scholarships)} scholarship(s):\n"]
        for s in scholarships:
            lines.append(
                f"- {s.name} | {s.host_country} | {s.funding_type} | "
                f"Deadline: {s.deadline} | Slug: {s.slug}"
            )

        return {"content": [{"type": "text", "text": "\n".join(lines)}]}


async def _handle_get(args: dict[str, Any]) -> dict:
    """Get a specific scholarship."""
    id_or_slug = args.get("id_or_slug", "")

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Scholarship).where(Scholarship.slug == id_or_slug)
        )
        sch = result.scalar_one_or_none()

        if not sch:
            from uuid import UUID
            try:
                result = await db.execute(
                    select(Scholarship).where(Scholarship.id == UUID(id_or_slug))
                )
                sch = result.scalar_one_or_none()
            except (ValueError, AttributeError):
                pass

        if not sch:
            return {
                "content": [{"type": "text", "text": f"Scholarship not found: {id_or_slug}"}],
                "isError": True,
            }

        data = {
            "id": str(sch.id),
            "name": sch.name,
            "slug": sch.slug,
            "host_country": sch.host_country,
            "host_institution": sch.host_institution,
            "provider": sch.provider,
            "degree_levels": sch.degree_levels or [],
            "funding_type": sch.funding_type,
            "deadline": str(sch.deadline) if sch.deadline else None,
            "official_url": sch.official_url,
            "description": sch.description,
            "is_active": sch.is_active,
        }

        return {"content": [{"type": "text", "text": json.dumps(data, indent=2, default=str)}]}


async def _handle_edit(args: dict[str, Any]) -> dict:
    """Edit an existing scholarship. Only provided fields are updated."""
    from uuid import UUID
    from datetime import date as date_type
    from app.mcp.schemas import SCHOLARSHIP_FIELDS

    id_or_slug = args.get("id_or_slug", "").strip()
    if not id_or_slug:
        return {
            "content": [{"type": "text", "text": "id_or_slug is required."}],
            "isError": True,
        }

    # Collect editable fields from args (everything except id_or_slug)
    editable = {k: v for k, v in args.items() if k != "id_or_slug" and k in SCHOLARSHIP_FIELDS}
    if not editable:
        return {
            "content": [{"type": "text", "text": "No fields to update. Pass at least one field besides id_or_slug."}],
            "isError": True,
        }

    async with AsyncSessionLocal() as db:
        # Find scholarship
        result = await db.execute(
            select(Scholarship).where(Scholarship.slug == id_or_slug)
        )
        sch = result.scalar_one_or_none()

        if not sch:
            try:
                result = await db.execute(
                    select(Scholarship).where(Scholarship.id == UUID(id_or_slug))
                )
                sch = result.scalar_one_or_none()
            except (ValueError, AttributeError):
                pass

        if not sch:
            return {
                "content": [{"type": "text", "text": f"Scholarship not found: {id_or_slug}"}],
                "isError": True,
            }

        # Apply changes
        changed_fields = []
        date_fields = {"deadline", "open_date", "program_start_date"}

        for field, value in editable.items():
            if not hasattr(sch, field):
                continue
            old = getattr(sch, field)

            # Coerce date strings to date objects
            if field in date_fields and isinstance(value, str):
                try:
                    value = date_type.fromisoformat(value)
                except ValueError:
                    return {
                        "content": [{"type": "text", "text": f"Invalid date format for {field}: {value}. Use YYYY-MM-DD."}],
                        "isError": True,
                    }

            if old != value:
                setattr(sch, field, value)
                changed_fields.append(field)

        if not changed_fields:
            return {
                "content": [{"type": "text", "text": f"No changes detected for scholarship: {sch.name}"}],
            }

        from datetime import datetime, timezone
        sch.updated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(sch)

        logger.info("MCP edit_scholarship: id=%s fields=%s", sch.id, changed_fields)

        data = {
            "id": str(sch.id),
            "name": sch.name,
            "slug": sch.slug,
            "host_country": sch.host_country,
            "host_institution": sch.host_institution,
            "provider": sch.provider,
            "degree_levels": sch.degree_levels or [],
            "funding_type": sch.funding_type,
            "deadline": str(sch.deadline) if sch.deadline else None,
            "official_url": sch.official_url,
            "description": sch.description,
            "is_active": sch.is_active,
            "updated_fields": changed_fields,
        }

        return {"content": [{"type": "text", "text": json.dumps(data, indent=2, default=str)}]}
