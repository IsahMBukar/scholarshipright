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
from app.models.pending_scholarship import PendingScholarship
from app.models.blog import BlogPost, BlogScholarshipTag, extract_scholarship_slugs
from app.models.user import User
from app.mcp.schemas import get_tool_schemas, SCHOLARSHIP_FIELDS
from app.utils.db import escape_like
from app.utils.scholarship_tags import validate_scholarship_slugs, sync_scholarship_tags as _shared_sync
from app.mcp.security import require_mcp_auth, McpAuthRecord, log_mcp_request
from app.mcp.oauth import (
    is_oauth_enabled,
    get_protected_resource_metadata,
    get_www_authenticate_header,
    get_server_url,
    get_supported_scopes,
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
        "revocation_endpoint": f"{server_url}/api/auth/mcp-revoke",
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "revocation_endpoint_auth_methods_supported": ["none"],
        "code_challenge_methods_supported": ["S256"],
        "scopes_supported": get_supported_scopes(),
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
            result = await _handle_edit(args, auth)
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
        elif name == "validate_eligibility":
            result = await _handle_validate_eligibility(args)
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
    from app.mcp.handlers import submit_scholarship

    key_name = args.get("_key_name", "remote")
    result = await submit_scholarship(args, submitted_by=f"mcp:{key_name}")
    return _result_to_jsonrpc(result)


async def _handle_list(args: dict[str, Any]) -> dict:
    """List scholarships."""
    from app.mcp.handlers import list_scholarships as _list

    result = await _list(args)
    return _result_to_jsonrpc(result)



async def _handle_get(args: dict[str, Any]) -> dict:
    """Get a specific scholarship."""
    from app.mcp.handlers import get_scholarship

    result = await get_scholarship(args)
    return _result_to_jsonrpc(result)


def _result_to_jsonrpc(result) -> dict:
    """Adapt a shared ``ToolResult`` to the JSON-RPC response shape."""
    out: dict[str, Any] = {"content": [{"type": "text", "text": result.text}]}
    if result.is_error:
        out["isError"] = True
    if result.structured is not None:
        out["structuredContent"] = result.structured
    return out


async def _handle_edit(args: dict[str, Any], auth: McpAuthRecord) -> dict:
    """Propose an edit to an existing scholarship.

    Thin adapter over the shared ``propose_scholarship_edit`` helper.
    Changes are NOT applied directly — they are queued as a
    PendingScholarship with target_scholarship_id for admin approval.
    """
    from app.mcp.handlers import (
        format_scholarship_edit_response,
        propose_scholarship_edit,
    )

    identity = _get_auth_identity(auth)
    agent_key_id = auth.id if auth.auth_method == "api_key" else None

    result = await propose_scholarship_edit(
        args=args,
        editable_fields=set(SCHOLARSHIP_FIELDS.keys()),
        submitted_by=f"mcp:{identity}",
        agent_key_id=agent_key_id,
    )

    if not result["ok"]:
        if "no_changes" in result:
            return {
                "content": [{"type": "text", "text": f"No changes detected for scholarship: {result['scholarship'].name}"}],
            }
        # Bad input — return isError so the agent gets a clear failure.
        return {
            "content": [{"type": "text", "text": result["error"]}],
            "isError": True,
        }

    text = format_scholarship_edit_response(
        scholarship=result["scholarship"],
        pending=result["pending"],
        changes=result["changes"],
        doc_changes_summary=result["doc_changes_summary"],
    )
    return {"content": [{"type": "text", "text": text}]}


# ── Blog tool handlers ────────────────────────────────────────────

from app.utils.blog import slugify as _slugify, reading_time as _reading_time


async def _sync_blog_scholarship_tags(db: AsyncSession, post_id, body: str) -> None:
    await _shared_sync(db, post_id, body)


async def _handle_blog_create(args: dict[str, Any], auth: McpAuthRecord) -> dict:
    """Create a blog post. AI submissions default to pending_review.

    Thin adapter over the shared create_blog_post helper. The SSE path
    differs from stdio only in auth_identity — the actual blog-creation
    logic (slug validation, author pick, slugify, tags sync) is shared.
    """
    from app.mcp.handlers import create_blog_post

    identity = _get_auth_identity(auth)
    agent_key_id = auth.id if auth.auth_method == "api_key" else None
    result = await create_blog_post(
        args, auth_identity=identity or "unknown", agent_key_id=agent_key_id,
    )
    return _result_to_jsonrpc(result)


async def _handle_blog_list(args: dict[str, Any]) -> dict:
    """List published blog posts."""
    from app.mcp.handlers import list_blog_posts

    result = await list_blog_posts(args)
    return _result_to_jsonrpc(result)


async def _handle_blog_get(args: dict[str, Any]) -> dict:
    """Get a blog post by slug or ID."""
    from app.mcp.handlers import get_blog_post

    result = await get_blog_post(args)
    return _result_to_jsonrpc(result)


async def _handle_blog_edit(args: dict[str, Any], auth: McpAuthRecord) -> dict:
    """Edit an existing blog post."""
    import uuid as _uuid

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

        from app.mcp.handlers import apply_blog_post_changes, format_blog_edit_response

        identity = _get_auth_identity(auth)
        changed, invalid_slugs = await apply_blog_post_changes(
            post,
            editable,
            auth_identity=identity or "unknown",
            slugify_fn=_slugify,
            db=db,
            extract_scholarship_slugs_fn=extract_scholarship_slugs,
            validate_scholarship_slugs_fn=validate_scholarship_slugs,
            sync_blog_scholarship_tags_fn=_sync_blog_scholarship_tags,
            compute_reading_time_fn=_reading_time,
        )

        if invalid_slugs:
            lines = [f"Invalid scholarship slugs: {', '.join(invalid_slugs)}"]
            for bad in invalid_slugs:
                sug = (await validate_scholarship_slugs(db, [bad])).get("suggestions", {}).get(bad, [])
                if sug:
                    lines.append(f"  '{bad}' did you mean: {', '.join(s['slug'] for s in sug)}")
                else:
                    lines.append(f"  '{bad}' not found. Call list_scholarships search='{bad}'")
            return {"content": [{"type": "text", "text": "\n".join(lines)}], "isError": True}

        if not changed:
            return {"content": [{"type": "text", "text": f"No changes for: {post.title}"}]}

        post.updated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(post)

        return {
            "content": [{"type": "text", "text": json.dumps(format_blog_edit_response(post, changed), indent=2, default=str)}],
        }


async def _handle_blog_categories() -> dict:
    """List distinct categories from published posts."""
    from app.mcp.handlers import list_blog_categories

    result = await list_blog_categories()
    return _result_to_jsonrpc(result)


async def _handle_validate_eligibility(args: dict[str, Any]) -> dict:
    """Dry-run the eligibility resolver. Same business logic as stdio."""
    from app.mcp.handlers import (
        format_validate_eligibility,
        parse_eligibility_args,
        run_validate_eligibility,
    )

    parsed = parse_eligibility_args(args)
    if parsed is None:
        return {
            "content": [{"type": "text", "text": "All four fields must be arrays of strings."}],
            "isError": True,
        }
    inc_groups, inc_countries, exc_groups, exc_countries = parsed

    result = await run_validate_eligibility(
        inc_groups=inc_groups,
        inc_countries=inc_countries,
        exc_groups=exc_groups,
        exc_countries=exc_countries,
    )
    return {
        "content": [{"type": "text", "text": format_validate_eligibility(result)}],
        "structuredContent": result,
    }
