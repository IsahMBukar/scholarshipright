"""
Re-engagement (win-back) email service for dormant users.

Runs monthly (1st of month, 11:00 UTC). Targets users who completed
their profile/resume but have shown no activity in 60+ days:

    "N new scholarships were added while you were away"

Activity proxy: the most recent of (user.updated_at, profile.updated_at,
resume.updated_at). No login tracking exists, so any profile/resume edit
counts as activity.

Gated by the `email_marketing` preference and a 30-day dedup window
(in-app notification kind "win_back") so each user hears at most once
a month.
"""
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, func

from app.core.config import get_settings
from app.db.session import AsyncSessionLocal
from app.models.user import User
from app.models.profile import Profile
from app.models.resume import Resume
from app.models.scholarship import Scholarship

logger = logging.getLogger(__name__)


DORMANT_DAYS = 60


async def _last_activity(db, user_id, user) -> datetime:
    """Most recent touch across user/profile/resume rows."""
    candidates = [user.updated_at or user.created_at]
    profile = (await db.execute(
        select(Profile).where(Profile.user_id == user_id)
    )).scalar_one_or_none()
    if profile and profile.updated_at:
        candidates.append(profile.updated_at)
    latest_resume = (await db.execute(
        select(func.max(Resume.updated_at)).where(Resume.user_id == user_id)
    )).scalar()
    if latest_resume:
        candidates.append(latest_resume)
    return max(c for c in candidates if c is not None)


async def process_win_back() -> int:
    """Send win-back emails to dormant users. Returns number sent."""
    from app.services.email import send_templated_email
    from app.services.notifications import emit_notification

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=DORMANT_DAYS)
    emails_sent = 0

    async with AsyncSessionLocal() as db:
        users_result = await db.execute(
            select(User).where(
                User.is_active == True,  # noqa: E712
                User.email_confirmed_at.isnot(None),
            )
        )
        users = users_result.scalars().all()

        for user in users:
            try:
                # Must have a completed profile+resume (drip handles the rest).
                profile = (await db.execute(
                    select(Profile).where(Profile.user_id == user.id)
                )).scalar_one_or_none()
                if not profile:
                    continue
                has_resume = (await db.execute(
                    select(Resume.id).where(Resume.user_id == user.id).limit(1)
                )).scalar_one_or_none()
                if has_resume is None:
                    continue

                last_active = await _last_activity(db, user.id, user)
                if last_active >= cutoff:
                    continue

                from app.models.notification_preference import get_or_create_preferences
                prefs = await get_or_create_preferences(db, user.id)
                if not prefs.email_marketing:
                    continue

                # Count scholarships added since they went quiet.
                new_count = (await db.execute(
                    select(func.count()).select_from(Scholarship).where(
                        Scholarship.is_active == True,  # noqa: E712
                        Scholarship.created_at >= cutoff,
                    )
                )).scalar() or 0

                n = await emit_notification(
                    db,
                    user_id=user.id,
                    kind="win_back",
                    title=f"👋 We miss you — {new_count} new scholarships",
                    message=(
                        f"{new_count} fully funded scholarships were added "
                        "since your last visit. See if any fit you."
                    ),
                    link="/scholarships",
                    dedup=True,  # 30-day window via DEDUP_WINDOWS["win_back"]
                )
                if n is None:
                    continue  # dedup hit — emailed recently

                await send_templated_email(
                    to=user.email,
                    template="win_back",
                    variables={
                        "RECIPIENT_NAME": user.full_name or "Student",
                        "NEW_COUNT": str(new_count),
                        "DAYS_AWAY": str((now - last_active).days),
                        "USER_ID": str(user.id),
                        "UNSUBSCRIBE_CATEGORY": "marketing",
                    },
                    subject=f"{new_count} new scholarships added since you left",
                )
                emails_sent += 1
            except Exception:  # noqa: BLE001 — one bad user must not stop the loop
                logger.exception("[WinBack] Failed for user=%s", user.id)

        await db.commit()

    if emails_sent:
        logger.info("[WinBack] Sent %d re-engagement emails", emails_sent)
    return emails_sent


async def win_back_loop() -> None:
    """Run once a month on the 1st at a fixed hour (UTC)."""
    import asyncio

    hour = get_settings().drip_send_hour_utc + 1  # stagger after the drip pass

    while True:
        now = datetime.now(timezone.utc)
        # Next occurrence of day=1
        if now.day == 1:
            next_run = now.replace(hour=hour, minute=0, second=0, microsecond=0)
            if next_run <= now:
                next_run = next_run.replace(month=now.month % 12 + 1, day=1) if now.month < 12 else now.replace(year=now.year + 1, month=1, day=1, hour=hour, minute=0, second=0, microsecond=0)
        else:
            if now.month == 12:
                next_run = now.replace(year=now.year + 1, month=1, day=1, hour=hour, minute=0, second=0, microsecond=0)
            else:
                next_run = now.replace(month=now.month + 1, day=1, hour=hour, minute=0, second=0, microsecond=0)

        wait_seconds = (next_run - now).total_seconds()
        logger.info("[WinBack] Next run: %s (in %.1fh)", next_run.isoformat(), wait_seconds / 3600)
        await asyncio.sleep(wait_seconds)
        try:
            await process_win_back()
        except Exception:  # noqa: BLE001
            logger.exception("[WinBack] Run failed")
