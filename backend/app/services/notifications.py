"""
Notification service.

Single entry point for creating notifications. Centralises:

  - The "notification kinds" we support
  - Dedup rules (we don't re-notify for the same kind + entity within a
    configurable window)
  - The link/title/message templates for each kind

Kinds:
  - deadline          (created by deadline_checker.py)
  - match_new         (a new scholarship crossed the 70% match threshold)
  - match_improved    (a scholarship we already matched jumped significantly)
  - resume_failed     (background resume analysis failed or timed out)

Caller responsibilities:
  - Open / own the AsyncSession that gets passed in
  - Commit the session (emit_notification does flush but not commit, so
    notif creation is part of the caller's transaction — match recompute
    uses this to roll back matches + notifs together on failure)
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification
from app.models.scholarship import Scholarship


# Dedup window per kind — how long after a notif we suppress duplicates
# for the same (user, kind, scholarship_id) tuple.
DEDUP_WINDOWS = {
    "deadline": timedelta(hours=12),       # the deadline loop also gates per-day
    "match_new": timedelta(days=7),
    "match_improved": timedelta(days=3),
    "resume_failed": timedelta(hours=1),   # don't spam if user keeps retrying
}

# Match-related notif thresholds (locked with product).
NEW_MATCH_MIN_SCORE = 70.0         # only notif for new matches at 70%+
IMPROVEMENT_MIN_DELTA = 10.0       # score must jump by 10+ points
IMPROVEMENT_CROSS_TIER = 80.0      # OR cross into the 80+ tier


async def _dedup_hit(
    db: AsyncSession,
    *,
    user_id: UUID,
    kind: str,
    scholarship_id: Optional[UUID],
    window: timedelta,
) -> bool:
    """Return True if a recent notif of the same kind already exists for
    this user (and scholarship, if provided) within the dedup window."""
    cutoff = datetime.now(timezone.utc) - window
    q = (
        select(Notification)
        .where(
            Notification.user_id == user_id,
            Notification.type == kind,
            Notification.created_at >= cutoff,
        )
    )
    if scholarship_id is not None:
        q = q.where(Notification.scholarship_id == scholarship_id)
    return (await db.execute(q.limit(1))).scalar_one_or_none() is not None


async def emit_notification(
    db: AsyncSession,
    *,
    user_id: UUID,
    kind: str,
    title: str,
    message: str,
    link: Optional[str] = None,
    scholarship_id: Optional[UUID] = None,
    dedup: bool = True,
) -> Optional[Notification]:
    """Create a notification row, applying dedup rules.

    Returns the Notification if created, or None if suppressed by dedup.
    The session is flushed (so the row gets a primary key) but NOT
    committed — the caller controls the transaction.
    """
    if dedup and kind in DEDUP_WINDOWS:
        window = DEDUP_WINDOWS[kind]
        if await _dedup_hit(
            db,
            user_id=user_id,
            kind=kind,
            scholarship_id=scholarship_id,
            window=window,
        ):
            return None

    n = Notification(
        user_id=user_id,
        type=kind,
        title=title,
        message=message,
        link=link,
        scholarship_id=scholarship_id,
    )
    db.add(n)
    await db.flush()
    return n


# Templates for match-related notifs -----------------------------------------

async def _load_scholarship(db: AsyncSession, scholarship_id: UUID) -> Optional[Scholarship]:
    return (
        await db.execute(select(Scholarship).where(Scholarship.id == scholarship_id))
    ).scalar_one_or_none()


async def emit_match_new(
    db: AsyncSession, *, user_id: UUID, scholarship_id: UUID, score: float
) -> Optional[Notification]:
    """Notify the user that a new scholarship now matches them at 70%+."""
    sch = await _load_scholarship(db, scholarship_id)
    if not sch:
        return None
    deadline_str = sch.deadline.strftime("%b %d, %Y") if sch.deadline else "open"
    return await emit_notification(
        db,
        user_id=user_id,
        kind="match_new",
        title=f"🌟 New match: {sch.name}",
        message=(
            f"{sch.name} in {sch.host_country} is a {round(score, 1)}% match for you. "
            f"Deadline: {deadline_str}."
        ),
        link=f"/scholarships/{sch.slug}",
        scholarship_id=scholarship_id,
    )


async def emit_match_improved(
    db: AsyncSession,
    *,
    user_id: UUID,
    scholarship_id: UUID,
    new_score: float,
    old_score: float,
) -> Optional[Notification]:
    """Notify the user that a scholarship's match score jumped significantly.

    Fired when the score went up by IMPROVEMENT_MIN_DELTA+ points OR
    crossed into the 80+ tier.
    """
    sch = await _load_scholarship(db, scholarship_id)
    if not sch:
        return None
    delta = round(new_score - old_score, 1)
    crossed_tier = old_score < IMPROVEMENT_CROSS_TIER <= new_score
    return await emit_notification(
        db,
        user_id=user_id,
        kind="match_improved",
        title=f"📈 Match up: {sch.name} (+{delta} pts)"
        if not crossed_tier
        else f"🎯 Top match: {sch.name} ({round(new_score, 1)}%)",
        message=(
            f"Your match for {sch.name} improved from {round(old_score, 1)}% "
            f"to {round(new_score, 1)}%. "
            + ("It just crossed into the top tier." if crossed_tier else "Worth a look.")
        ),
        link=f"/scholarships/{sch.slug}",
        scholarship_id=scholarship_id,
    )


async def emit_resume_failed(
    db: AsyncSession, *, user_id: UUID, resume_id: UUID, reason: str
) -> Optional[Notification]:
    """Notify the user that background resume analysis failed."""
    return await emit_notification(
        db,
        user_id=user_id,
        kind="resume_failed",
        title="⚠️ Resume analysis failed",
        message=(
            f"We couldn't analyse your resume automatically. {reason} "
            "Open your resume to try again or edit fields manually."
        ),
        link="/resume",
        scholarship_id=None,  # not scholarship-related
    )


def is_improvement(new_score: float, old_score: float) -> bool:
    """Pure helper for the recompute hook to decide whether to emit an
    `match_improved` notif for a given (new, old) score pair."""
    if new_score <= old_score:
        return False
    delta = new_score - old_score
    crossed_tier = old_score < IMPROVEMENT_CROSS_TIER <= new_score
    return delta >= IMPROVEMENT_MIN_DELTA or crossed_tier


def is_new_match(new_score: float) -> bool:
    """Pure helper — does this new score qualify for a `match_new` notif?"""
    return new_score >= NEW_MATCH_MIN_SCORE
