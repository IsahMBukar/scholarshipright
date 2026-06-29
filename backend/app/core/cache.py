"""Redis caching layer for ScholarshipRight.

Caches hot read paths to eliminate redundant DB queries:
  - Scholarship list (paginated)
  - Individual scholarship by slug
  - User match scores
  - Filter metadata

Cache is invalidated on writes (profile update, scholarship edit, match recompute).
Falls back gracefully if Redis is unavailable — every read path works without cache.

Usage:
    from app.core.cache import cache_get, cache_set, cache_invalidate, CacheKeys
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

import redis.asyncio as aioredis

from app.core.config import get_settings

logger = logging.getLogger("sr.cache")

_redis: Optional[aioredis.Redis] = None
_healthy: bool = False
_probed: bool = False


async def get_redis() -> Optional[aioredis.Redis]:
    """Return the singleton Redis client, or None if unavailable."""
    global _redis, _healthy, _probed

    if _probed and not _healthy:
        return None
    if _redis is not None:
        return _redis

    try:
        settings = get_settings()
        _redis = aioredis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
        await _redis.ping()
        _healthy = True
        _probed = True
        logger.info("Cache: Redis connected at %s", settings.redis_url)
        return _redis
    except Exception as e:
        _healthy = False
        _probed = True
        logger.warning("Cache: Redis unavailable (%s), caching disabled", e)
        return None


# ── Cache key helpers ──────────────────────────────────────────────

class CacheKeys:
    """Centralised cache key patterns with TTLs."""

    # Scholarship list (paginated): "scholarships:list:{page}:{limit}:{filters_hash}"
    SCHOLARSHIP_LIST = "scholarships:list:{key}"
    SCHOLARSHIP_LIST_TTL = 300  # 5 minutes

    # Individual scholarship: "scholarships:detail:{slug}"
    SCHOLARSHIP_DETAIL = "scholarships:detail:{slug}"
    SCHOLARSHIP_DETAIL_TTL = 600  # 10 minutes

    # User match scores: "matches:user:{user_id}"
    USER_MATCHES = "matches:user:{user_id}"
    USER_MATCHES_TTL = 300  # 5 minutes

    # Filter metadata: "scholarships:meta"
    FILTER_META = "scholarships:meta"
    FILTER_META_TTL = 600  # 10 minutes

    @classmethod
    def scholarship_list(cls, key: str) -> str:
        return cls.SCHOLARSHIP_LIST.format(key=key)

    @classmethod
    def scholarship_detail(cls, slug: str) -> str:
        return cls.SCHOLARSHIP_DETAIL.format(slug=slug)

    @classmethod
    def user_matches(cls, user_id: str) -> str:
        return cls.USER_MATCHES.format(user_id=user_id)


# ── Core cache operations ─────────────────────────────────────────

async def cache_get(key: str) -> Optional[Any]:
    """Get a value from cache. Returns None if missing or Redis down."""
    r = await get_redis()
    if r is None:
        return None
    try:
        raw = await r.get(key)
        if raw is None:
            return None
        return json.loads(raw)
    except Exception as e:
        logger.debug("Cache GET error for %s: %s", key, e)
        return None


async def cache_set(key: str, value: Any, ttl: int = 300) -> bool:
    """Set a value in cache with TTL (seconds). Returns True on success."""
    r = await get_redis()
    if r is None:
        return False
    try:
        await r.set(key, json.dumps(value, default=str), ex=ttl)
        return True
    except Exception as e:
        logger.debug("Cache SET error for %s: %s", key, e)
        return False


async def cache_invalidate(*keys: str) -> None:
    """Delete one or more cache keys. No-op if Redis is down."""
    r = await get_redis()
    if r is None or not keys:
        return
    try:
        await r.delete(*keys)
    except Exception as e:
        logger.debug("Cache DELETE error: %s", e)


async def cache_invalidate_pattern(pattern: str) -> int:
    """Delete all keys matching a glob pattern. Returns count deleted."""
    r = await get_redis()
    if r is None:
        return 0
    try:
        keys = []
        async for key in r.scan_iter(match=pattern, count=100):
            keys.append(key)
        if keys:
            return await r.delete(*keys)
        return 0
    except Exception as e:
        logger.debug("Cache DELETE pattern error: %s", e)
        return 0


# ── Invalidation helpers ───────────────────────────────────────────

async def invalidate_scholarship_caches() -> None:
    """Call after any scholarship create/update/delete."""
    await cache_invalidate_pattern("scholarships:*")


async def invalidate_user_match_cache(user_id: str) -> None:
    """Call after match recompute for a user."""
    await cache_invalidate(CacheKeys.user_matches(user_id))
