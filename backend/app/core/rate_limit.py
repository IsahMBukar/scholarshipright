"""Rate limiting dependencies for high-cost/public endpoints.

Two-tier architecture (chosen at startup, not per-request):

  1. **Redis fixed-window** (primary when REDIS_URL is reachable)
     Uses INCR + EXPIRE — the simplest correct multi-worker pattern.
     Atomic across all workers; no memory drift.

  2. **In-memory sliding-log** (fallback when Redis is down or unset)
     Identical to the pre-M2 behaviour. Single-process only.

All public names are preserved so no route changes are needed.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import time
from collections import defaultdict, deque
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Optional

from fastapi import HTTPException, Request, status

logger = logging.getLogger("scholarshipright.rate_limit")


# ── Rule definition ───────────────────────────────────────────────

@dataclass(frozen=True)
class RateLimitRule:
    name: str
    max_requests: int
    window_seconds: int


# ── Redis store ───────────────────────────────────────────────────

_redis_client = None        # lazily created redis.asyncio.Redis
_redis_healthy: bool = False  # flips True on first successful INCR
_redis_probe_done = False   # True after the first connect attempt
_redis_url: Optional[str] = None  # set from config at import time


async def _get_redis():
    """Return the singleton Redis client, or None if unavailable."""
    global _redis_client, _redis_probe_done, _redis_healthy
    if _redis_probe_done and not _redis_healthy:
        return None
    if _redis_client is not None:
        return _redis_client

    try:
        import redis.asyncio as aioredis
        url = _redis_url or "redis://localhost:6379"
        _redis_client = aioredis.from_url(
            url,
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
            protocol=2,  # Force RESP2 — compatible with Redis 3.x (no HELLO command)
        )
        # Quick liveness ping — non-blocking for the first request only.
        await _redis_client.ping()
        _redis_healthy = True
        _redis_probe_done = True
        logger.info("Rate limiter: Redis connected at %s", url)
        return _redis_client
    except Exception as e:  # noqa: BLE001 — any connect/auth/timeout error
        _redis_healthy = False
        _redis_probe_done = True
        logger.warning(
            "Rate limiter: Redis unavailable (%s), falling back to in-memory", e
        )
        return None


def init_redis_url(url: str) -> None:
    """Called once from lifespan to inject the URL from Settings."""
    global _redis_url
    _redis_url = url


async def _redis_incr(
    redis_client, rule: RateLimitRule, identifier: str, now: float
) -> tuple[bool, int]:
    """Atomic fixed-window INCR. Returns (is_over_limit, retry_after)."""
    # Key: e.g. "rl:auth_login:cookie:abc123:1719500000"
    window_idx = int(now // rule.window_seconds)
    key = f"rl:{rule.name}:{identifier}:{window_idx}"

    try:
        count = await redis_client.incr(key)
        if count == 1:
            # First request in this window — set TTL so Redis auto-cleans.
            await redis_client.expire(key, rule.window_seconds)

        if count > rule.max_requests:
            # Calculate how long until this window expires.
            window_start = window_idx * rule.window_seconds
            elapsed = now - window_start
            retry_after = max(1, int(rule.window_seconds - elapsed))
            return True, retry_after
        return False, 0
    except Exception as e:  # noqa: BLE001 — Redis died mid-request
        logger.warning("Rate limiter: Redis INCR failed (%s), falling back", e)
        return False, -1  # sentinel: fallback to in-memory


# ── In-memory store (fallback) ────────────────────────────────────

_MEM_BUCKETS: dict[str, deque[float]] = defaultdict(deque)
_MEM_LAST_SWEEP = 0.0
_MEM_SWEEP_INTERVAL = 300


def _sweep_old_buckets(now: float) -> None:
    global _MEM_LAST_SWEEP
    if now - _MEM_LAST_SWEEP < _MEM_SWEEP_INTERVAL:
        return
    _MEM_LAST_SWEEP = now

    empty_keys: list[str] = []
    for key, timestamps in _MEM_BUCKETS.items():
        while timestamps and now - timestamps[0] > 24 * 60 * 60:
            timestamps.popleft()
        if not timestamps:
            empty_keys.append(key)
    for key in empty_keys:
        _MEM_BUCKETS.pop(key, None)


# ── Client identifier ─────────────────────────────────────────────

def _client_identifier(request: Request) -> str:
    """Privacy-safe identifier. Prefers auth cookie, falls back to IP."""
    token = request.cookies.get("sr_token")
    if token:
        digest = hashlib.sha256(
            token.encode("utf-8", errors="ignore")
        ).hexdigest()[:24]
        return f"cookie:{digest}"

    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return f"ip:{forwarded_for.split(',')[0].strip()}"

    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return f"ip:{real_ip.strip()}"

    if request.client and request.client.host:
        return f"ip:{request.client.host}"

    return "ip:unknown"


# ── Factory ───────────────────────────────────────────────────────

def rate_limit(
    name: str, max_requests: int, window_seconds: int
) -> Callable[[Request], Awaitable[None]]:
    """Create a FastAPI dependency enforcing a fixed-window limit.

    Tries Redis first (atomic, multi-worker-safe).  Falls back to
    in-memory sliding-log if Redis is unavailable at this moment.
    """
    rule = RateLimitRule(name=name, max_requests=max_requests, window_seconds=window_seconds)

    async def dependency(request: Request) -> None:
        now = time.time()
        identifier = _client_identifier(request)

        # ── Attempt Redis store ──────────────────────────────────
        r = await _get_redis()
        if r is not None:
            over, retry_after = await _redis_incr(r, rule, identifier, now)
            if retry_after == -1:
                # INCR failed mid-request — fall through to in-memory.
                pass
            elif over:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=(
                        f"Too many requests. Please try again in "
                        f"{retry_after} seconds."
                    ),
                    headers={"Retry-After": str(retry_after)},
                )
            else:
                return  # within limit, done

        # ── Fallback: in-memory sliding-log ──────────────────────
        _sweep_old_buckets(now)
        key = f"{rule.name}:{identifier}"
        timestamps = _MEM_BUCKETS[key]

        while timestamps and now - timestamps[0] >= rule.window_seconds:
            timestamps.popleft()

        if len(timestamps) >= rule.max_requests:
            retry_after = max(1, int(rule.window_seconds - (now - timestamps[0])))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    f"Too many requests. Please try again in "
                    f"{retry_after} seconds."
                ),
                headers={"Retry-After": str(retry_after)},
            )

        timestamps.append(now)

    return dependency


# ── Probe helper (called from lifespan) ───────────────────────────

async def probe_redis() -> dict:
    """Ping Redis and return a status dict for /healthz."""
    r = await _get_redis()
    if r is not None:
        return {"rate_limit_backend": "redis", "healthy": True}
    return {"rate_limit_backend": "in-memory", "healthy": True}


# ── Rule instances ────────────────────────────────────────────────
# Identical values and names to the pre-M2 module so no route changes needed.

auth_register_rate_limit = rate_limit(
    "auth_register", max_requests=50, window_seconds=15 * 60
)
auth_login_rate_limit = rate_limit(
    "auth_login", max_requests=50, window_seconds=15 * 60
)
auth_invite_rate_limit = rate_limit(
    "auth_invite", max_requests=50, window_seconds=15 * 60
)
# Forgot-password: tight — prevents email-bombing.
auth_forgot_rate_limit = rate_limit(
    "auth_forgot", max_requests=5, window_seconds=15 * 60
)
# Reset-password: the brute-force target (token guessing).
auth_reset_rate_limit = rate_limit(
    "auth_reset", max_requests=10, window_seconds=15 * 60
)

# Resume uploads trigger file parsing + background AI analysis.
resume_upload_rate_limit = rate_limit(
    "resume_upload", max_requests=5, window_seconds=60 * 60
)

# Re-analysis is directly LLM-backed and can be expensive.
resume_analysis_rate_limit = rate_limit(
    "resume_analysis", max_requests=6, window_seconds=60 * 60
)

# Rewrite is lower-cost than full analysis but still LLM-backed.
resume_rewrite_rate_limit = rate_limit(
    "resume_rewrite", max_requests=20, window_seconds=60 * 60
)

# General agent/chat/actions call the LLM and sometimes tools.
agent_rate_limit = rate_limit(
    "agent", max_requests=30, window_seconds=60 * 60
)

# GET /api/matches is cheap on a warm cache but transparently triggers
# a synchronous recompute when user.match_dirty == True.
matches_rate_limit = rate_limit(
    "matches", max_requests=60, window_seconds=60 * 60
)

# MCP OAuth endpoints — protect against brute-force and abuse.
mcp_authorize_rate_limit = rate_limit(
    "mcp_authorize", max_requests=10, window_seconds=15 * 60
)
mcp_token_rate_limit = rate_limit(
    "mcp_token", max_requests=20, window_seconds=15 * 60
)
mcp_register_rate_limit = rate_limit(
    "mcp_register", max_requests=5, window_seconds=15 * 60
)
