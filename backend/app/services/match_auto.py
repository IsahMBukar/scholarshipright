"""Auto-recompute orchestration for scholarship match scores.

This service keeps match scores in sync with the data that drives them:

- profile changes (PUT /api/profile)
- resume create / update / set-primary / delete
- scholarship data changes (manual `invalidate_all_users`)

Triggers fire from request handlers via `trigger_recompute(user_id, reason,
background_tasks=...)`. The actual work runs on its own DB session, in a
FastAPI background task when one is available, or fire-and-forget otherwise.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import BackgroundTasks
from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal, engine
from app.models.match_score import MatchScore
from app.models.scholarship import Scholarship
from app.models.user import User
from app.models.profile import Profile
from app.models.resume import Resume
from app.services.match_engine import compute_match_score
from app.services.notifications import (
    emit_match_new,
    emit_match_improved,
    is_improvement,
    is_new_match,
)


logger = logging.getLogger("scholara.matches")


# Reason codes — used for logging/audit only.
REASON_PROFILE_UPDATED = "profile_updated"
REASON_RESUME_CREATED = "resume_created"
REASON_RESUME_UPDATED = "resume_updated"
REASON_RESUME_PRIMARY_CHANGED = "resume_primary_changed"
REASON_RESUME_DELETED = "resume_deleted"
REASON_SCHOLARSHIP_DATA_CHANGED = "scholarship_data_changed"
REASON_MANUAL = "manual"


async def ensure_schema_columns() -> None:
    """Idempotent runtime migration for the new User columns.

    `Base.metadata.create_all` doesn't add columns to existing tables, so we
    use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` to be safe for both fresh
    and already-deployed databases.
    """
    from sqlalchemy import text

    async with engine.begin() as conn:
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS match_dirty BOOLEAN NOT NULL DEFAULT TRUE"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS match_invalidated_at TIMESTAMPTZ"))


async def mark_user_dirty(user_id: UUID, reason: str = REASON_MANUAL) -> None:
    """Set the user's match_dirty flag so the next read recomputes."""
    async with AsyncSessionLocal() as db:
        await db.execute(
            update(User)
            .where(User.id == user_id)
            .values(match_dirty=True, match_invalidated_at=datetime.now(timezone.utc))
        )
        await db.commit()
    logger.info("match_dirty user=%s reason=%s", user_id, reason)


async def mark_all_users_dirty(reason: str = REASON_SCHOLARSHIP_DATA_CHANGED) -> int:
    """Mark every user as needing a recompute. Returns the count updated."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            update(User)
            .where(User.match_dirty.is_(False))
            .values(match_dirty=True, match_invalidated_at=datetime.now(timezone.utc))
        )
        await db.commit()
        try:
            count = result.rowcount or 0
        except Exception:  # noqa: BLE001 - some dialects don't expose rowcount
            count = 0
    logger.info("match_dirty_all reason=%s updated=%s", reason, count)
    return count


async def recompute_matches_for_user(user_id: UUID, reason: str = REASON_MANUAL) -> dict:
    """Synchronously recompute match scores for a single user.

    Opens its own DB session so it's safe to run from a background task or
    from a CLI script. Returns a small result dict for logging/audit.

    Side effects:
      - Updates match_scores for this user (delete + insert)
      - Emits match_new notifications for newly-crossed 70%+ scholarships
      - Emits match_improved notifications for scholarships that jumped
        by ≥10 points or crossed into the 80+ tier
    """
    async with AsyncSessionLocal() as db:
        try:
            profile_result = await db.execute(select(Profile).where(Profile.user_id == user_id))
            profile = profile_result.scalar_one_or_none()
            if not profile:
                logger.info("recompute skipped user=%s reason=%s (no profile)", user_id, reason)
                return {"status": "skipped", "reason": "no_profile", "matches": 0}

            resume_result = await db.execute(
                select(Resume).where(Resume.user_id == user_id, Resume.is_primary == True)
            )
            resume = resume_result.scalar_one_or_none()
            if not resume:
                resume_result = await db.execute(
                    select(Resume).where(Resume.user_id == user_id).order_by(Resume.updated_at.desc())
                )
                resume = resume_result.scalar_one_or_none()

            sch_result = await db.execute(select(Scholarship).where(Scholarship.is_active == True))
            scholarships = sch_result.scalars().all()

            # Snapshot the old scores BEFORE we delete them, so we can diff
            # against the new set and emit improvement/new-match notifications.
            old_scores_q = await db.execute(
                select(MatchScore.scholarship_id, MatchScore.score)
                .where(MatchScore.user_id == user_id)
            )
            old_scores: dict[UUID, float] = {row[0]: float(row[1]) for row in old_scores_q.all()}

            await db.execute(delete(MatchScore).where(MatchScore.user_id == user_id))

            computed = 0
            new_scores: dict[UUID, float] = {}
            for sch in scholarships:
                result = compute_match_score(profile, sch, resume=resume)
                if result["score"] > 0:
                    db.add(MatchScore(
                        user_id=user_id,
                        scholarship_id=sch.id,
                        score=result["score"],
                        breakdown=result["breakdown"],
                    ))
                    new_scores[sch.id] = float(result["score"])
                    computed += 1

            await db.execute(
                update(User)
                .where(User.id == user_id)
                .values(match_dirty=False, match_invalidated_at=datetime.now(timezone.utc))
            )

            # ── Notification side-effects ────────────────────────────
            # Compute the diff in this same session so the notif INSERTs
            # share the transaction with the match INSERTs.
            notif_new = 0
            notif_improved = 0
            for sch_id, new_score in new_scores.items():
                old_score = old_scores.get(sch_id)
                if old_score is None:
                    # New match — was not in the old set
                    if is_new_match(new_score):
                        n = await emit_match_new(
                            db,
                            user_id=user_id,
                            scholarship_id=sch_id,
                            score=new_score,
                        )
                        if n is not None:
                            notif_new += 1
                else:
                    # Existing match — check for improvement
                    if is_improvement(new_score, old_score):
                        n = await emit_match_improved(
                            db,
                            user_id=user_id,
                            scholarship_id=sch_id,
                            new_score=new_score,
                            old_score=old_score,
                        )
                        if n is not None:
                            notif_improved += 1

            await db.commit()

            # Send new-match emails (after commit, fire-and-forget)
            if notif_new > 0:
                from app.services.email import send_templated_email
                user_row = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
                if user_row:
                    for sch_id, new_score in new_scores.items():
                        old_score = old_scores.get(sch_id)
                        if old_score is None and is_new_match(new_score):
                            sch = (await db.execute(select(Scholarship).where(Scholarship.id == sch_id))).scalar_one_or_none()
                            if sch:
                                deadline_str = sch.deadline.strftime("%b %d, %Y") if sch.deadline else "Open"
                                await send_templated_email(
                                    to=user_row.email,
                                    template="new_match",
                                    variables={
                                        "RECIPIENT_NAME": user_row.full_name or "Student",
                                        "SCHOLARSHIP_NAME": sch.name,
                                        "MATCH_SCORE": str(round(new_score)),
                                        "AMOUNT": getattr(sch, "amount", "See details") or "See details",
                                        "DEADLINE": deadline_str,
                                        "COUNTRY": getattr(sch, "host_country", "") or "",
                                        "USER_ID": str(user_id),
                                        "UNSUBSCRIBE_CATEGORY": "new_matches",
                                    },
                                    subject=f"New match: {sch.name} ({round(new_score)}%)",
                                )

            logger.info(
                "recompute ok user=%s reason=%s matches=%s new_notifs=%s improved_notifs=%s",
                user_id, reason, computed, notif_new, notif_improved,
            )
            return {
                "status": "computed",
                "reason": reason,
                "matches": computed,
                "total_scholarships": len(scholarships),
                "resume_used": bool(resume),
                "notifs_new": notif_new,
                "notifs_improved": notif_improved,
            }
        except Exception as e:  # noqa: BLE001
            await db.rollback()
            logger.exception("recompute failed user=%s reason=%s: %s", user_id, reason, e)
            return {"status": "error", "reason": reason, "error": str(e)[:200]}


async def clear_user_matches(user_id: UUID) -> None:
    """Hard-delete a user's cached matches (e.g. after their resume is removed)."""
    async with AsyncSessionLocal() as db:
        await db.execute(delete(MatchScore).where(MatchScore.user_id == user_id))
        await db.execute(
            update(User)
            .where(User.id == user_id)
            .values(match_dirty=True, match_invalidated_at=datetime.now(timezone.utc))
        )
        await db.commit()
    logger.info("cleared matches user=%s", user_id)


def trigger_recompute(
    user_id: UUID,
    reason: str,
    background_tasks: Optional[BackgroundTasks] = None,
) -> None:
    """Schedule a recompute. FastAPI's BackgroundTasks is preferred because the
    task runs after the response is flushed and shares the event loop. When
    called outside a request (CLI, scheduler) we use a fire-and-forget asyncio
    task. We mark the user dirty first so the next GET reflects the staleness
    even if the recompute fails.
    """
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if background_tasks is not None:
        background_tasks.add_task(mark_user_dirty, user_id, reason)
        background_tasks.add_task(recompute_matches_for_user, user_id, reason)
    elif loop is not None:
        loop.create_task(mark_user_dirty(user_id, reason))
        loop.create_task(recompute_matches_for_user(user_id, reason))
    else:
        # No loop available — just mark dirty and let the next read trigger
        # a synchronous recompute via the GET endpoint.
        asyncio.run(mark_user_dirty(user_id, reason))


def trigger_global_invalidate(
    reason: str = REASON_SCHOLARSHIP_DATA_CHANGED,
    background_tasks: Optional[BackgroundTasks] = None,
) -> None:
    """Mark every user dirty so their next match read recomputes."""
    if background_tasks is not None:
        background_tasks.add_task(mark_all_users_dirty, reason)
    else:
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None
        if loop is not None:
            loop.create_task(mark_all_users_dirty(reason))
