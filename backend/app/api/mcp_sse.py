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
from sqlalchemy import select, func, text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db, AsyncSessionLocal
from app.models.scholarship import Scholarship
from app.models.scholarship_degree_document import ScholarshipDegreeDocument, auto_derive_for_level
from app.models.scholarship_custom_document import ScholarshipCustomDocument
from app.models.pending_scholarship import PendingScholarship
from app.models.blog import BlogPost, BlogScholarshipTag, extract_scholarship_slugs
from app.models.user import User
from app.mcp.schemas import get_tool_schemas, SCHOLARSHIP_FIELDS
from app.mcp.security import require_mcp_auth, McpAuthRecord, log_mcp_request
from app.mcp.oauth import (
    is_oauth_enabled,
    get_protected_resource_metadata,
    get_www_authenticate_header,
    get_server_url,
)

logger = logging.getLogger("scholarshipright.mcp_sse")

router = APIRouter(tags=["mcp"])

# SSE connections for server-initiated messages
_MAX_SSE_CONNECTIONS = 50
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

    server_url = get_server_url()
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
        "scopes_supported": ["scholarships:read", "scholarships:write", "blogs:read", "blogs:write"],
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
    if len(_connections) >= _MAX_SSE_CONNECTIONS:
        logger.warning("SSE connection limit reached (%d), rejecting", _MAX_SSE_CONNECTIONS)
        return JSONResponse(status_code=429, content={"detail": "Too many SSE connections"})

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
    # Reject oversized bodies (1MB limit)
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > 1_000_000:
        return JSONResponse(
            status_code=413,
            content={"jsonrpc": "2.0", "error": {"code": -32600, "message": "Request body too large"}},
        )

    try:
        body = await request.json()
    except Exception:
        return JSONResponse(
            status_code=400,
            content={"jsonrpc": "2.0", "error": {"code": -32700, "message": "Invalid JSON"}},
        )

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
            "error": {"code": -32603, "message": "Internal server error"},
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

    # Scope check: write operations require appropriate write scope
    _sch_write_tools = {"add_scholarship", "edit_scholarship"}
    _blog_write_tools = {"create_blog_post", "edit_blog_post"}

    if name in _sch_write_tools and not auth.has_scope("scholarships:write"):
        logger.warning(
            "MCP scope denied: auth=%s name=%s tool=%s (needs scholarships:write)",
            auth.auth_method, auth.name, name,
        )
        return {
            "content": [{"type": "text", "text": "Insufficient scope — scholarships:write required. Your token only has read access."}],
            "isError": True,
        }

    if name in _blog_write_tools and not auth.has_scope("blogs:write"):
        logger.warning(
            "MCP scope denied: auth=%s name=%s tool=%s (needs blogs:write)",
            auth.auth_method, auth.name, name,
        )
        return {
            "content": [{"type": "text", "text": "Insufficient scope — blogs:write required. Your token only has read access."}],
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
        elif name == "create_blog_post":
            result = await _handle_blog_create(args, auth)
        elif name == "list_blog_posts":
            result = await _handle_blog_list(args)
        elif name == "get_blog_post":
            result = await _handle_blog_get(args)
        elif name == "edit_blog_post":
            result = await _handle_blog_edit(args, auth)
        elif name == "list_blog_categories":
            result = await _handle_blog_categories()
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

    # Extract inline documents — these are handled separately from flat fields
    inline_degree_docs = args.get("degree_documents")
    inline_custom_docs = args.get("custom_documents")

    # Collect editable fields from args (everything except id_or_slug and doc arrays)
    editable = {k: v for k, v in args.items() if k not in ("id_or_slug", "degree_documents", "custom_documents") and k in SCHOLARSHIP_FIELDS}
    if not editable and inline_degree_docs is None and inline_custom_docs is None:
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

        doc_changes = []

        # ── Inline degree-level documents ─────────────────────────
        if inline_degree_docs is not None:
            for dd in inline_degree_docs:
                level = dd.get("degree_level")
                if not level:
                    continue
                await db.execute(
                    sa_text("DELETE FROM scholarship_degree_documents WHERE scholarship_id = :sid AND degree_level = :lvl"),
                    {"sid": str(sch.id), "lvl": level},
                )
                defaults = auto_derive_for_level(level)
                doc = ScholarshipDegreeDocument(
                    scholarship_id=sch.id,
                    degree_level=level,
                    req_transcripts=dd.get("req_transcripts", True),
                    req_cv_resume=dd.get("req_cv_resume", True),
                    req_sop_motivation_letter=dd.get("req_sop_motivation_letter", True),
                    req_recommendation_letters=dd.get("req_recommendation_letters", True),
                    req_english_test=dd.get("req_english_test", True),
                    req_passport_or_id=dd.get("req_passport_or_id", True),
                    req_financial_proof=dd.get("req_financial_proof", False),
                    req_photo=dd.get("req_photo", False),
                    previous_degree_required=dd.get("previous_degree_required") or defaults["previous_degree_required"],
                    recommendation_letters_count=dd.get("recommendation_letters_count") or defaults["recommendation_letters_count"],
                    research_proposal_required=dd.get("research_proposal_required") if "research_proposal_required" in dd else defaults["research_proposal_required"],
                    writing_sample_required=dd.get("writing_sample_required") if "writing_sample_required" in dd else defaults["writing_sample_required"],
                    standardized_test=dd.get("standardized_test") or defaults["standardized_test"],
                )
                db.add(doc)
                doc_changes.append(f"degree_docs:{level}")

        # ── Inline custom documents ───────────────────────────────
        if inline_custom_docs is not None:
            await db.execute(
                sa_text("DELETE FROM scholarship_custom_documents WHERE scholarship_id = :sid"),
                {"sid": str(sch.id)},
            )
            for i, cd in enumerate(inline_custom_docs):
                name = cd.get("name", "").strip()
                if not name:
                    continue
                doc = ScholarshipCustomDocument(
                    scholarship_id=sch.id,
                    name=name,
                    description=cd.get("description"),
                    required=cd.get("required", True),
                    degree_level=cd.get("degree_level"),
                    position=cd.get("position", i),
                )
                db.add(doc)
                doc_changes.append(f"custom_doc:{name}")

        if not changed_fields and not doc_changes:
            return {
                "content": [{"type": "text", "text": f"No changes detected for scholarship: {sch.name}"}],
            }

        from datetime import datetime, timezone
        sch.updated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(sch)

        logger.info("MCP edit_scholarship: id=%s fields=%s docs=%s", sch.id, changed_fields, doc_changes)

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
        if changed_fields:
            data["updated_fields"] = changed_fields
        if doc_changes:
            data["document_changes"] = doc_changes

    # Trigger incremental recompute: this scholarship against all users.
    from app.services.match_auto import trigger_scholarship_recompute
    trigger_scholarship_recompute(sch.id)

    return {"content": [{"type": "text", "text": json.dumps(data, indent=2, default=str)}]}


# ── Blog tool handlers ────────────────────────────────────────────

from app.utils.blog import slugify as _slugify, reading_time as _reading_time


async def _sync_blog_scholarship_tags(db: AsyncSession, post_id, body: str) -> None:
    """Parse @[scholarship:slug] from body and sync the tag table."""
    from sqlalchemy import text as sa_text

    slugs = extract_scholarship_slugs(body)
    if not slugs:
        await db.execute(
            sa_text("DELETE FROM blog_scholarship_tags WHERE blog_post_id = :pid"),
            {"pid": str(post_id)},
        )
        return

    rows = await db.execute(
        select(Scholarship.id, Scholarship.slug).where(Scholarship.slug.in_(slugs))
    )
    slug_to_id = {r.slug: r.id for r in rows.all()}

    await db.execute(
        sa_text("DELETE FROM blog_scholarship_tags WHERE blog_post_id = :pid"),
        {"pid": str(post_id)},
    )

    for i, slug in enumerate(slugs):
        sch_id = slug_to_id.get(slug)
        if sch_id:
            tag = BlogScholarshipTag(
                blog_post_id=post_id,
                scholarship_id=sch_id,
                position_hint=i,
            )
            db.add(tag)


async def _handle_blog_create(args: dict[str, Any], auth: McpAuthRecord) -> dict:
    """Create a blog post. AI submissions default to pending_review."""
    from datetime import datetime, timezone

    required = ["title", "body"]
    missing = [f for f in required if f not in args]
    if missing:
        return {
            "content": [{"type": "text", "text": f"Missing required fields: {', '.join(missing)}"}],
            "isError": True,
        }

    title = args["title"].strip()
    body = args["body"].strip()
    if len(title) < 3:
        return {"content": [{"type": "text", "text": "Title must be at least 3 characters."}], "isError": True}
    if len(body) < 10:
        return {"content": [{"type": "text", "text": "Body must be at least 10 characters."}], "isError": True}

    # Default to pending_review for AI submissions
    status = args.get("status", "pending_review")

    async with AsyncSessionLocal() as db:
        # Resolve auth identity to a user ID
        # OAuth → try email from claims; API key → find super_admin
        author_id = None
        identity = _get_auth_identity(auth)

        if auth.auth_method == "oauth" and auth.oauth_claims.get("email"):
            email = auth.oauth_claims["email"]
            user_row = await db.execute(select(User.id).where(User.email == email))
            author_id = user_row.scalar_one_or_none()

        if not author_id:
            # Fallback: find super_admin, then any admin, then any user
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
            return {
                "content": [{"type": "text", "text": "No users found in database. Cannot assign author."}],
                "isError": True,
            }

        slug = _slugify(title)
        existing = await db.execute(select(BlogPost.id).where(BlogPost.slug == slug))
        if existing.scalar_one_or_none():
            import uuid
            slug = f"{slug}-{uuid.uuid4().hex[:6]}"

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
            reading_time_minutes=_reading_time(body),
            status=status,
            published_at=now if status == "published" else None,
        )
        db.add(post)
        await db.flush()

        await _sync_blog_scholarship_tags(db, post.id, body)

        await db.commit()
        await db.refresh(post)

        lines = [
            f"Blog post created (ID: {post.id})",
            f"Title: {post.title}",
            f"Slug: {post.slug}",
            f"Status: {post.status}",
            f"URL: /blog/{post.slug}",
        ]
        if status == "pending_review":
            lines.append("Status is pending_review — an admin will review before it goes live.")
        elif status == "draft":
            lines.append("Saved as draft. Set status='published' or 'pending_review' when ready.")

        return {"content": [{"type": "text", "text": "\n".join(lines)}]}


async def _handle_blog_list(args: dict[str, Any]) -> dict:
    """List published blog posts."""
    import math

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
            base.order_by(BlogPost.published_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
        posts = rows.scalars().all()

        if not posts:
            return {"content": [{"type": "text", "text": "No blog posts found."}]}

        lines = [f"Found {total} post(s), showing page {page}/{pages}:\n"]
        for p in posts:
            tags_str = f" [{', '.join(p.tags)}]" if p.tags else ""
            lines.append(f"- {p.title} | {p.category} | {p.reading_time_minutes}min read | Slug: {p.slug}{tags_str}")

        return {"content": [{"type": "text", "text": "\n".join(lines)}]}


async def _handle_blog_get(args: dict[str, Any]) -> dict:
    """Get a blog post by slug or ID."""
    slug_or_id = args.get("slug_or_id", "").strip()
    if not slug_or_id:
        return {"content": [{"type": "text", "text": "slug_or_id is required."}], "isError": True}

    async with AsyncSessionLocal() as db:
        # Try slug first
        row = await db.execute(
            select(BlogPost).where(BlogPost.slug == slug_or_id, BlogPost.status == "published")
        )
        post = row.scalar_one_or_none()

        # Fallback to UUID
        if not post:
            from uuid import UUID
            try:
                row = await db.execute(
                    select(BlogPost).where(BlogPost.id == UUID(slug_or_id))
                )
                post = row.scalar_one_or_none()
            except (ValueError, AttributeError):
                pass

        if not post:
            return {
                "content": [{"type": "text", "text": f"Blog post not found: {slug_or_id}"}],
                "isError": True,
            }

        # Fetch author name
        author = (await db.execute(select(User.full_name).where(User.id == post.author_id))).scalar()

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

        return {"content": [{"type": "text", "text": json.dumps(data, indent=2, default=str)}]}


async def _handle_blog_edit(args: dict[str, Any], auth: McpAuthRecord) -> dict:
    """Edit an existing blog post."""
    import uuid as _uuid
    from datetime import datetime, timezone

    post_id = args.get("post_id", "").strip()
    if not post_id:
        return {"content": [{"type": "text", "text": "post_id is required."}], "isError": True}

    from app.mcp.schemas import BLOG_FIELDS
    editable = {k: v for k, v in args.items() if k != "post_id" and k in BLOG_FIELDS}
    if not editable:
        return {
            "content": [{"type": "text", "text": "No fields to update. Pass at least one field besides post_id."}],
            "isError": True,
        }

    async with AsyncSessionLocal() as db:
        try:
            row = await db.execute(select(BlogPost).where(BlogPost.id == _uuid.UUID(post_id)))
        except ValueError:
            return {"content": [{"type": "text", "text": "Invalid post_id format. Must be a UUID."}], "isError": True}

        post = row.scalar_one_or_none()
        if not post:
            return {"content": [{"type": "text", "text": f"Blog post not found: {post_id}"}], "isError": True}

        changed = []

        # Handle title change → regenerate slug
        if "title" in editable:
            new_slug = _slugify(editable["title"])
            from sqlalchemy import select as _sel
            slug_exists = await db.execute(
                _sel(BlogPost.id).where(BlogPost.slug == new_slug, BlogPost.id != post.id)
            )
            if slug_exists.scalar_one_or_none():
                new_slug = f"{new_slug}-{_uuid.uuid4().hex[:6]}"
            post.slug = new_slug
            post.title = editable["title"]
            changed.append("title")

        if "body" in editable:
            post.body = editable["body"]
            post.reading_time_minutes = _reading_time(editable["body"])
            await _sync_blog_scholarship_tags(db, post.id, editable["body"])
            changed.append("body")

        for field in ("excerpt", "cover_image_url", "category", "tags"):
            if field in editable:
                setattr(post, field, editable[field])
                changed.append(field)

        # Handle status change
        if "status" in editable:
            new_status = editable["status"]
            if new_status == "published" and post.status != "published":
                post.published_at = datetime.now(timezone.utc)
            post.status = new_status
            changed.append("status")
        elif post.status == "published" and changed:
            # Agent edited a live post without explicitly setting status →
            # revert to pending_review so admin re-approves before it goes live again.
            post.status = "pending_review"
            changed.append("status→pending_review")

        if not changed:
            return {"content": [{"type": "text", "text": f"No changes for: {post.title}"}]}

        post.updated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(post)

        data = {
            "id": str(post.id),
            "title": post.title,
            "slug": post.slug,
            "status": post.status,
            "updated_fields": changed,
        }
        if post.status == "pending_review":
            data["note"] = "Post reverted to pending_review — admin will re-approve before it goes live again."
        return {"content": [{"type": "text", "text": json.dumps(data, indent=2, default=str)}]}


async def _handle_blog_categories() -> dict:
    """List distinct categories from published posts."""
    async with AsyncSessionLocal() as db:
        rows = await db.execute(
            select(BlogPost.category)
            .where(BlogPost.status == "published")
            .distinct()
            .order_by(BlogPost.category)
        )
        categories = [r[0] for r in rows.all()]

        if not categories:
            return {"content": [{"type": "text", "text": "No blog categories found."}]}

        return {"content": [{"type": "text", "text": "Categories:\n" + "\n".join(f"- {c}" for c in categories)}]}
