"""Lightweight in-memory rate limiting dependencies for high-cost/public endpoints.

This protects auth, uploads, AI endpoints, and match computation from bursts that
can burn API/LLM spend. It is intentionally dependency-free for the current
single-process FastAPI deployment. For multi-worker/prod scale, swap the store
for Redis while keeping the route dependencies unchanged.
"""
from __future__ import annotations

import hashlib
import time
from collections import defaultdict, deque
from collections.abc import Callable, Awaitable
from dataclasses import dataclass

from fastapi import HTTPException, Request, status


@dataclass(frozen=True)
class RateLimitRule:
    name: str
    max_requests: int
    window_seconds: int


# key -> unix timestamps inside the current window
_BUCKETS: dict[str, deque[float]] = defaultdict(deque)
_LAST_SWEEP = 0.0
SWEEP_INTERVAL_SECONDS = 300


def _client_identifier(request: Request) -> str:
    """Return a privacy-safe identifier for this caller.

    Prefer user auth cookie when available so authenticated high-cost endpoints
    are limited per signed-in user/session. Fall back to proxy/client IP for
    login/register before a user has a cookie.
    """
    token = request.cookies.get("sr_token")
    if token:
        digest = hashlib.sha256(token.encode("utf-8", errors="ignore")).hexdigest()[:24]
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


def _sweep_old_buckets(now: float) -> None:
    global _LAST_SWEEP
    if now - _LAST_SWEEP < SWEEP_INTERVAL_SECONDS:
        return
    _LAST_SWEEP = now

    empty_keys = []
    for key, timestamps in _BUCKETS.items():
        # key format: rule:identifier; keep conservative max stale window.
        while timestamps and now - timestamps[0] > 24 * 60 * 60:
            timestamps.popleft()
        if not timestamps:
            empty_keys.append(key)
    for key in empty_keys:
        _BUCKETS.pop(key, None)


def rate_limit(name: str, max_requests: int, window_seconds: int) -> Callable[[Request], Awaitable[None]]:
    """Create a FastAPI dependency enforcing a fixed-window sliding log limit."""
    rule = RateLimitRule(name=name, max_requests=max_requests, window_seconds=window_seconds)

    async def dependency(request: Request) -> None:
        now = time.time()
        _sweep_old_buckets(now)

        identifier = _client_identifier(request)
        key = f"{rule.name}:{identifier}"
        timestamps = _BUCKETS[key]

        while timestamps and now - timestamps[0] >= rule.window_seconds:
            timestamps.popleft()

        if len(timestamps) >= rule.max_requests:
            retry_after = max(1, int(rule.window_seconds - (now - timestamps[0])))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many requests. Please try again in {retry_after} seconds.",
                headers={"Retry-After": str(retry_after)},
            )

        timestamps.append(now)

    return dependency


# ── Public auth endpoints: tight enough to slow brute force / signup
# abuse / invite spam. Each endpoint has its own bucket so a user who
# legitimately logs in several times doesn't block themselves from
# signing up, accepting an invite, or setting a password.
#
#   - auth_register   → /register                       (signup abuse)
#   - auth_login      → /login, /dev-login              (brute force)
#   - auth_invite     → /accept-invite, /set-password   (invite spam)
#   - auth_forgot     → /forgot-password                (reset-link spam / email-bomb)
#   - auth_reset      → /reset-password                 (token brute force)
#
# 50/15min gives ~1 attempt per 18s on average — still secure against
# brute force (a real attacker needs thousands) and bursty scripts, but
# leaves enough headroom for the full E2E suite (11 tests × 1-2 auth
# calls each per run, plus retries) to pass on a single bucket.
auth_register_rate_limit = rate_limit("auth_register", max_requests=50, window_seconds=15 * 60)
auth_login_rate_limit = rate_limit("auth_login", max_requests=50, window_seconds=15 * 60)
auth_invite_rate_limit = rate_limit("auth_invite", max_requests=50, window_seconds=15 * 60)
# Forgot-password is special: we don't want to let an attacker spam an
# arbitrary email with reset links (email-bombing). 5/15min per IP is
# enough for a real "I forgot my password" flow + retry, but blocks
# sustained spam.
auth_forgot_rate_limit = rate_limit("auth_forgot", max_requests=5, window_seconds=15 * 60)
# Reset-password is the actual brute-force target (raw token guessing).
# 32-byte URL-safe tokens = 256 bits of entropy, so 10/15min is plenty
# of room for the legitimate user who clicks the link + maybe retries
# once. Anything beyond that is hostile.
auth_reset_rate_limit = rate_limit("auth_reset", max_requests=10, window_seconds=15 * 60)

# Resume uploads trigger file parsing + background AI analysis.
resume_upload_rate_limit = rate_limit("resume_upload", max_requests=5, window_seconds=60 * 60)

# Re-analysis is directly LLM-backed and can be expensive.
resume_analysis_rate_limit = rate_limit("resume_analysis", max_requests=6, window_seconds=60 * 60)

# Rewrite is lower-cost than full analysis but still LLM-backed.
resume_rewrite_rate_limit = rate_limit("resume_rewrite", max_requests=20, window_seconds=60 * 60)

# General agent/chat/actions call the LLM and sometimes tools.
agent_rate_limit = rate_limit("agent", max_requests=30, window_seconds=60 * 60)

# GET /api/matches is cheap on a warm cache but transparently triggers
# a synchronous recompute when user.match_dirty == True (see matches.py).
# A recompute walks every active scholarship and re-runs the embedding
# cosine distance + heuristic scoring, so a polling UI loop or a
# racing client can quickly saturate it. 60/hour per user is enough
# for legitimate polling (the match card refetches on tab focus and
# after every onboarding/progress change, never faster than the user
# can navigate) while blocking runaway loops that would burn compute
# without delivering any new matches. Per-user bucketing happens
# automatically through the cookie-aware key in _client_identifier.
matches_rate_limit = rate_limit("matches", max_requests=60, window_seconds=60 * 60)
