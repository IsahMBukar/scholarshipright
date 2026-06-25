"""Cookie flag helpers for the auth subsystem.

Centralizing cookie flags here keeps `set_cookie(...)` and `delete_cookie(...)`
calls in sync across every endpoint that issues or clears the auth cookie.
Without this, it's easy to miss a call site (especially delete_cookie during
logout) and silently leak a session in production because the Secure flag
set on create doesn't match the flags on the delete.

Flags policy:
  httponly : True    -- JS can't read it; primary XSS defense
  samesite : "lax"   -- blocks cross-site POSTs; allows top-level GET
                         navigation so the user lands logged-in after
                         email-link redirects
  secure   : True iff environment == "production"
                       -- browser refuses to send the cookie over HTTP,
                          so a token issued in prod cannot leak via a
                          downgrade. Dev keeps secure=False because
                          local backends run over plain HTTP.
  domain   : unset    -- host-only cookie today. Live deploys that put
                          frontend and backend on different subdomains
                          (eg api.x.com + app.x.com) will need to set
                          domain=".x.com" here once the split lands.
"""
from __future__ import annotations

from app.core.config import get_settings


def auth_cookie_kwargs() -> dict:
    """Return the kwargs to splat into every auth-cookie set_cookie /
    delete_cookie call. Pulls fresh from settings so changing ENVIRONMENT
    at runtime (e.g. for tests) flips the Secure flag without a restart.
    """
    settings = get_settings()
    return {
        "httponly": True,
        "samesite": "lax",
        "secure": settings.environment == "production",
    }
