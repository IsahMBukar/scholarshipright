"""Lightweight task queue backed by Redis lists.

Replaces in-process BackgroundTasks for heavy operations like match
recompute. Jobs are JSON messages pushed to a Redis list; the worker
pops and executes them.

Why not Celery:
  - One fewer dependency to manage
  - Redis is already in the stack
  - We only have 2-3 job types (recompute, global invalidate)
  - No need for chains, chords, retries, or result backends

Usage:
    # Enqueue (from API handler):
    from app.core.task_queue import enqueue_match_recompute, enqueue_global_invalidate
    await enqueue_match_recompute(user_id, reason="profile_updated")

    # Process (from worker process):
    from app.core.task_queue import process_jobs
    await process_jobs()  # blocks forever, runs in a separate process
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Optional

import redis.asyncio as aioredis

from app.core.config import get_settings

logger = logging.getLogger("sr.task_queue")

QUEUE_KEY = "sr:tasks:queue"
PROCESSING_KEY = "sr:tasks:processing"

_redis: Optional[aioredis.Redis] = None


async def _get_redis() -> Optional[aioredis.Redis]:
    global _redis
    if _redis is not None:
        return _redis
    try:
        settings = get_settings()
        _redis = aioredis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=5,
        )
        await _redis.ping()
        return _redis
    except Exception as e:
        logger.warning("Task queue: Redis unavailable (%s)", e)
        return None


# ── Enqueue helpers (called from API handlers) ────────────────────

async def enqueue_match_recompute(user_id: str, reason: str = "manual") -> bool:
    """Enqueue a match recompute job for a single user."""
    return await _enqueue({
        "type": "recompute_matches",
        "user_id": user_id,
        "reason": reason,
    })


async def enqueue_global_invalidate(reason: str = "scholarship_data_changed") -> bool:
    """Enqueue a global match invalidation (all users)."""
    return await _enqueue({
        "type": "global_invalidate",
        "reason": reason,
    })


async def _enqueue(job: dict) -> bool:
    """Push a job to the Redis queue. Returns True on success."""
    r = await _get_redis()
    if r is None:
        return False
    try:
        await r.lpush(QUEUE_KEY, json.dumps(job, default=str))
        logger.debug("Enqueued job: %s", job.get("type"))
        return True
    except Exception as e:
        logger.warning("Task queue: enqueue failed (%s)", e)
        return False


# ── Worker loop (runs in a separate process) ──────────────────────

async def process_jobs() -> None:
    """Block forever, processing jobs from the queue.

    Run this in a separate process:
        python -m app.core.task_queue
    or:
        uvicorn app.core.task_queue:run_worker --factory --host 0.0.0.0 --port 8001
    """
    r = await _get_redis()
    if r is None:
        logger.error("Task queue: cannot start — Redis unavailable")
        return

    logger.info("Task queue: worker started, listening on %s", QUEUE_KEY)

    while True:
        try:
            # BRPOPLPUSH: atomic pop from queue + push to processing list
            # Timeout 5s so we can check for shutdown periodically
            result = await r.brpoplpush(QUEUE_KEY, PROCESSING_KEY, timeout=5)
            if result is None:
                continue

            job = json.loads(result)
            job_type = job.get("type", "unknown")
            logger.info("Processing job: %s", job_type)

            try:
                await _dispatch(job)
                # Remove from processing list on success
                await r.lrem(PROCESSING_KEY, 1, result)
                logger.info("Job done: %s", job_type)
            except Exception as e:
                logger.exception("Job failed: %s — %s", job_type, e)
                # Remove from processing to avoid poison pill
                await r.lrem(PROCESSING_KEY, 1, result)

        except asyncio.CancelledError:
            logger.info("Task queue: worker shutting down")
            break
        except Exception as e:
            logger.exception("Task queue: unexpected error — %s", e)
            await asyncio.sleep(1)


async def _dispatch(job: dict) -> None:
    """Route a job to the right handler."""
    from app.services.match_auto import recompute_matches_for_user, mark_all_users_dirty
    from app.core.cache import invalidate_user_match_cache, invalidate_scholarship_caches

    job_type = job.get("type")

    if job_type == "recompute_matches":
        user_id = job["user_id"]
        reason = job.get("reason", "manual")
        result = await recompute_matches_for_user(user_id, reason=reason)
        # Invalidate user's match cache
        await invalidate_user_match_cache(user_id)
        logger.info("Recompute result: user=%s matches=%s penalized=%s",
                     user_id, result.get("matches"), result.get("penalized"))

    elif job_type == "global_invalidate":
        reason = job.get("reason", "scholarship_data_changed")
        count = await mark_all_users_dirty(reason=reason)
        # Invalidate all scholarship caches
        await invalidate_scholarship_caches()
        logger.info("Global invalidate: %d users marked dirty", count)

    else:
        logger.warning("Unknown job type: %s", job_type)


# ── Standalone entry point ────────────────────────────────────────

async def run_worker():
    """Entry point for running the worker as a standalone process."""
    await process_jobs()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    asyncio.run(run_worker())
