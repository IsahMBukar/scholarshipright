"""
MCP OAuth 2.0 Protected Resource middleware.

Implements RFC 9728 (OAuth 2.0 Protected Resource Metadata) so that
remote AI agents (Claude.ai, ChatGPT, etc.) can discover the
authorization server and obtain tokens via standard OAuth flows.

Provider-agnostic: works with Scalekit, Auth0, Supabase, or any
OAuth 2.0 provider that issues JWTs and exposes a JWKS endpoint.

Configuration (env vars):
    MCP_OAUTH_ENABLED         - "1" to enable OAuth (default: "0")
    MCP_OAUTH_ISSUER          - Token issuer URL (for JWKS fallback validation)
    MCP_OAUTH_JWKS_URL        - JWKS endpoint for public key fetching
    MCP_OAUTH_AUDIENCE        - Expected audience claim in tokens
    MCP_OAUTH_SERVER_URL      - This MCP server's public URL (for metadata)
    MCP_OAUTH_SCOPES_SUPPORTED - Comma-separated list of supported scopes

Usage:
    from app.mcp.oauth import validate_oauth_token, get_protected_resource_metadata

    # In your auth middleware:
    claims = await validate_oauth_token(bearer_token)
    if claims:
        # OAuth auth succeeded — claims["scope"] has scopes
        ...

    # Expose metadata:
    @app.get("/.well-known/oauth-protected-resource")
    async def metadata():
        return get_protected_resource_metadata()
"""

import json
import logging
import os
import time
from typing import Any, Optional

import httpx
from dotenv import load_dotenv
from jose import jwt, JWTError

logger = logging.getLogger("scholarshipright.mcp_oauth")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

_oauth_enabled: bool = False
_issuer: str = ""
_jwks_url: str = ""
_audience: str = ""
_server_url: str = ""
_scopes_supported: list[str] = ["scholarships:read", "scholarships:write"]

# JWKS cache (in-memory, refreshed on demand)
_jwks_cache: Optional[dict] = None
_jwks_fetched_at: float = 0
_JWKS_CACHE_TTL = 3600  # 1 hour


def load_oauth_config() -> None:
    """Load OAuth configuration from environment variables."""
    global _oauth_enabled, _issuer, _jwks_url, _audience, _server_url, _scopes_supported

    load_dotenv()

    _oauth_enabled = os.getenv("MCP_OAUTH_ENABLED", "0") == "1"
    _issuer = os.getenv("MCP_OAUTH_ISSUER", "")
    _jwks_url = os.getenv("MCP_OAUTH_JWKS_URL", "")
    _audience = os.getenv("MCP_OAUTH_AUDIENCE", "")
    _server_url = os.getenv("MCP_OAUTH_SERVER_URL", "")
    scopes_str = os.getenv("MCP_OAUTH_SCOPES_SUPPORTED", "scholarships:read,scholarships:write")
    _scopes_supported = [s.strip() for s in scopes_str.split(",") if s.strip()]

    if _oauth_enabled:
        if not _server_url:
            logger.warning(
                "OAuth enabled but MCP_OAUTH_SERVER_URL is missing — OAuth will be disabled",
            )
            _oauth_enabled = False
        else:
            logger.info(
                "OAuth enabled: server_url=%s scopes=%s",
                _server_url, _scopes_supported,
            )
            if not _issuer or not _jwks_url:
                logger.info(
                    "JWKS fallback disabled (MCP_OAUTH_ISSUER/MCP_OAUTH_JWKS_URL not set) — self-issued tokens only",
                )


def is_oauth_enabled() -> bool:
    """Check if OAuth is enabled and properly configured."""
    return _oauth_enabled


def get_server_url() -> str:
    """Return the MCP server's public URL (for OAuth metadata)."""
    return _server_url.rstrip("/")


# ---------------------------------------------------------------------------
# JWKS fetching and caching
# ---------------------------------------------------------------------------

async def _fetch_jwks() -> dict:
    """Fetch JWKS from the authorization server. Caches for 1 hour."""
    global _jwks_cache, _jwks_fetched_at

    now = time.time()
    if _jwks_cache and (now - _jwks_fetched_at) < _JWKS_CACHE_TTL:
        return _jwks_cache

    async with httpx.AsyncClient() as client:
        resp = await client.get(_jwks_url, timeout=10)
        resp.raise_for_status()
        _jwks_cache = resp.json()
        _jwks_fetched_at = now
        logger.info("JWKS refreshed from %s", _jwks_url)
        return _jwks_cache


def _find_signing_key(jwks: dict, token: str) -> dict:
    """Find the signing key from JWKS that matches the token's kid."""
    unverified_header = jwt.get_unverified_header(token)
    kid = unverified_header.get("kid")

    for key in jwks.get("keys", []):
        if key.get("kid") == kid:
            return key

    # If no kid match, try the first key (some providers don't use kid)
    if jwks.get("keys"):
        return jwks["keys"][0]

    raise ValueError("No matching key found in JWKS")


# ---------------------------------------------------------------------------
# Token validation
# ---------------------------------------------------------------------------

async def validate_oauth_token(token: str) -> Optional[dict[str, Any]]:
    """Validate an OAuth JWT token.

    Tries two validation strategies:
    1. Self-issued JWTs (HS256 with app's jwt_secret) — tokens from our own
       /api/auth/mcp-token endpoint.
    2. Scalekit JWKS (RS256/ES256 etc.) — tokens from Scalekit OAuth flow.

    Returns the decoded claims dict if valid, None if both fail.
    """
    if not _oauth_enabled:
        return None

    # --- Strategy 1: Self-issued JWT (HS256) ---
    try:
        from app.core.config import get_settings
        settings = get_settings()
        if settings.jwt_secret:
            claims = jwt.decode(
                token,
                settings.jwt_secret,
                algorithms=["HS256"],
                options={
                    "verify_exp": True,
                    "verify_aud": False,  # self-issued may have different aud format
                    "verify_iss": False,
                },
            )
            # Validate it looks like an MCP token (has scope claim)
            if "scope" in claims or "client_id" in claims:
                logger.info(
                    "Self-issued MCP token validated: sub=%s client_id=%s scopes=%s",
                    claims.get("sub", "?"),
                    claims.get("client_id", "?"),
                    claims.get("scope", "?"),
                )
                return claims
    except JWTError:
        pass  # Not a self-issued token, try Scalekit
    except Exception:
        logger.debug("Self-issued token validation failed, trying JWKS fallback", exc_info=True)

    # --- Strategy 2: Scalekit JWKS (RS256/ES256) ---
    if not _jwks_url:
        return None  # JWKS fallback not configured — self-issued only
    try:
        jwks = await _fetch_jwks()
        signing_key = _find_signing_key(jwks, token)

        claims = jwt.decode(
            token,
            signing_key,
            algorithms=["RS256", "RS384", "RS512", "ES256", "ES384", "ES512"],
            audience=_audience,
            issuer=_issuer,
            options={
                "verify_exp": True,
                "verify_aud": True,
                "verify_iss": True,
            },
        )

        logger.info(
            "OAuth token validated: sub=%s client_id=%s scopes=%s",
            claims.get("sub", "?"),
            claims.get("client_id", claims.get("azp", "?")),
            claims.get("scope", claims.get("scp", "?")),
        )
        return claims

    except JWTError as e:
        logger.warning("OAuth JWT validation failed: %s", e)
        return None
    except Exception as e:
        logger.warning("OAuth token validation error: %s", e)
        return None


def get_token_scopes(claims: dict[str, Any]) -> list[str]:
    """Extract scopes from token claims.

    Handles both "scope" (space-separated string) and "scp" (list) formats
    that different providers use.
    """
    # "scope" field (space-separated string) — most providers
    if "scope" in claims:
        scope_val = claims["scope"]
        if isinstance(scope_val, str):
            return [s.strip() for s in scope_val.split() if s.strip()]
        if isinstance(scope_val, list):
            return scope_val

    # "scp" field (list) — some providers
    scp = claims.get("scp", [])
    if isinstance(scp, list):
        return scp

    return []


def has_scope(claims: dict[str, Any], required_scope: str) -> bool:
    """Check if the token claims include the required scope."""
    scopes = get_token_scopes(claims)
    return required_scope in scopes


# ---------------------------------------------------------------------------
# Protected Resource Metadata (RFC 9728)
# ---------------------------------------------------------------------------

def get_protected_resource_metadata() -> dict:
    """Return the OAuth Protected Resource Metadata document.

    This is served at /.well-known/oauth-protected-resource so that
    OAuth clients (Claude.ai, ChatGPT, etc.) can discover:
    - Where to get tokens (authorization server)
    - What scopes this resource supports
    """
    return {
        "resource": _server_url,
        "authorization_servers": [_server_url],
        "scopes_supported": _scopes_supported,
        "bearer_methods_supported": ["header"],
        "resource_documentation": "https://github.com/IsahMBukar/scholarshipright",
    }


def get_www_authenticate_header() -> str:
    """Build the WWW-Authenticate header for 401 responses.

    Points OAuth clients to the metadata endpoint so they can
    discover the authorization server and initiate the OAuth flow.
    """
    metadata_url = f"{_server_url.rstrip('/')}/.well-known/oauth-protected-resource"
    return f'Bearer realm="MCP", resource_metadata="{metadata_url}"'
