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
from app.services.eligibility import passes_country_gate
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
            penalized = 0
            new_scores: dict[UUID, float] = {}
            for sch in scholarships:
                # Country eligibility — now a soft penalty, not a hard gate.
                # Compute eligibility context and pass it to the scorer so
                # a -35 penalty is applied when the user is ineligible.
                # The scholarship is still scored and shown in the feed.
                eligibility_info = passes_country_gate(
                    user_nationality=getattr(profile, "nationality_code", None),
                    user_residency=getattr(profile, "residency_code", None),
                    eligibility_basis=getattr(sch, "eligibility_basis", "either") or "either",
                    resolved_countries=list(getattr(sch, "resolved_countries", []) or []),
                    eligibility_unresolved=bool(getattr(sch, "eligibility_unresolved", False)),
                    eligibility_display=getattr(sch, "eligibility_display", None),
                )

                result = compute_match_score(profile, sch, resume=resume, eligibility_info=eligibility_info)
                if result["score"] > 0:
                    db.add(MatchScore(
                        user_id=user_id,
                        scholarship_id=sch.id,
                        score=result["score"],
                        breakdown=result["breakdown"],
                    ))
                    new_scores[sch.id] = float(result["score"])
                    computed += 1
                    if not eligibility_info.get("passes", True):
                        penalized += 1

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
            # Bundle all new matches into ONE email (max 10) instead of
            # sending individual emails per scholarship.
            if notif_new > 0:
                from app.services.email import send_templated_email
                from app.services.weekly_digest import _build_match_card
                user_row = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
                if user_row:
                    # Collect all new matches, sort by score, cap at 10
                    new_matches = []
                    for sch_id, new_score in new_scores.items():
                        old_score = old_scores.get(sch_id)
                        if old_score is None and is_new_match(new_score):
                            sch = (await db.execute(select(Scholarship).where(Scholarship.id == sch_id))).scalar_one_or_none()
                            if sch:
                                new_matches.append((sch, new_score))
                    new_matches.sort(key=lambda x: x[1], reverse=True)
                    new_matches = new_matches[:10]

                    if new_matches:
                        cards = []
                        for sch, score in new_matches:
                            deadline_str = sch.deadline.strftime("%b %d, %Y") if sch.deadline else "Open"
                            amount = getattr(sch, "amount", None) or "See details"
                            country = getattr(sch, "host_country", None) or ""
                            cards.append(_build_match_card(
                                scholarship_name=sch.name,
                                score=float(score),
                                amount=amount,
                                deadline=deadline_str,
                                country=country,
                            ))

                        match_cards_html = "\n".join(cards)
                        count = len(new_matches)
                        if count == 1:
                            heading = "New scholarship match!"
                            subtext = f"a new scholarship just scored {round(new_matches[0][1])}% against your profile."
                            subject = f"New match: {new_matches[0][0].name} ({round(new_matches[0][1])}%)"
                        else:
                            heading = f"{count} new scholarship matches!"
                            subtext = f"you have {count} new scholarships that scored 70%+ against your profile."
                            top_name = new_matches[0][0].name
                            subject = f"{count} new matches — top: {top_name} ({round(new_matches[0][1])}%)"

                        await send_templated_email(
                            to=user_row.email,
                            template="new_matches_bundle",
                            variables={
                                "RECIPIENT_NAME": user_row.full_name or "Student",
                                "HEADING": heading,
                                "SUBTEXT": subtext,
                                "MATCH_CARDS": match_cards_html,
                                "USER_ID": str(user_id),
                                "UNSUBSCRIBE_CATEGORY": "new_matches",
                            },
                            subject=subject,
                        )

            logger.info(
                "recompute ok user=%s reason=%s matches=%s penalized=%s new_notifs=%s improved_notifs=%s",
                user_id, reason, computed, penalized, notif_new, notif_improved,
            )
            return {
                "status": "computed",
                "reason": reason,
                "matches": computed,
                "penalized": penalized,
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
    """Schedule a recompute via Redis task queue (preferred) or fallback.

    Priority:
      1. Redis task queue — picked up by the separate worker process.
      2. FastAPI BackgroundTasks — runs after response flush (legacy).
      3. Fire-and-forget asyncio task — best-effort.
      4. Mark dirty only — next GET will recompute synchronously.
    """
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    # Try Redis task queue first (non-blocking, survives restarts)
    if loop is not None:
        try:
            from app.core.task_queue import enqueue_match_recompute
            loop.create_task(enqueue_match_recompute(str(user_id), reason))
            loop.create_task(mark_user_dirty(user_id, reason))
            return
        except Exception:
            pass  # fall through to legacy paths

    # Fallback: BackgroundTasks or asyncio
    if background_tasks is not None:
        background_tasks.add_task(mark_user_dirty, user_id, reason)
        background_tasks.add_task(recompute_matches_for_user, user_id, reason)
    elif loop is not None:
        loop.create_task(mark_user_dirty(user_id, reason))
        loop.create_task(recompute_matches_for_user(user_id, reason))
    else:
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
