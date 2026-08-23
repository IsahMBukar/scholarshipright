"""
Onboarding drip (nurture) email service for users with incomplete profiles.

Runs once per day (default 10:00 UTC). Sends a time-based sequence of
awareness emails to users who signed up but never completed their
profile/resume:

    Day 3  — "Your matches are waiting" teaser
    Day 7  — Feature spotlight: resume upload + auto-scoring
    Day 10 — Feature spotlight: saved scholarships + deadline reminders
    Day 14 — Final nudge, then the drip stops permanently

Rules:
 - Users whose profile AND primary resume exist never receive drip emails.
 - Each send is gated on the `email_product_updates` preference.
 - At most one drip email per user every 48 hours.
 - The weekly digest continues regardless; this only replaces the silence
   for users who can't be match-scored yet.

Runs alongside the deadline_checker / weekly_digest / daily_match_bundle
loops in main.py lifespan.
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


DRIP_DONE = 99
MIN_HOURS_BETWEEN_SENDS = 48

# (days_since_signup, template) — index == drip_step after sending
DRIP_STEPS = [
    (3, "nudge_matches_waiting"),
    (7, "feature_spotlight_resume"),
    (10, "feature_spotlight_saved"),
    (14, "nudge_final"),
]


async def _has_completed_profile(db, user_id) -> bool:
    """A user is 'in the loop' via match emails once they have a profile
    AND a resume — same condition recompute_matches_for_user requires."""
    from sqlalchemy import exists as sa_exists
    has_profile = (await db.execute(
        select(sa_exists().where(Profile.user_id == user_id))
    )).scalar()
    if not has_profile:
        return False
    has_resume = (await db.execute(
        select(Resume.id).where(Resume.user_id == user_id).limit(1)
    )).scalar_one_or_none()
    return has_resume is not None


async def _count_active_scholarships(db) -> int:
    return (await db.execute(
        select(func.count()).select_from(Scholarship).where(Scholarship.is_active == True)  # noqa: E712
    )).scalar() or 0


async def process_drip_users() -> int:
    """Send due drip emails. Returns number sent."""
    from app.models.notification_preference import get_or_create_preferences
    from app.services.email import send_templated_email

    now = datetime.now(timezone.utc)
    emails_sent = 0

    async with AsyncSessionLocal() as db:
        users_result = await db.execute(
            select(User).where(
                User.is_active == True,  # noqa: E712
                User.email_confirmed_at.isnot(None),
                User.drip_step < len(DRIP_STEPS),
            )
        )
        users = users_result.scalars().all()

        for user in users:
            try:
                # Completed profiles exit the drip immediately.
                if await _has_completed_profile(db, user.id):
                    user.drip_step = DRIP_DONE
                    continue

                # Preference gate.
                prefs = await get_or_create_preferences(db, user.id)
                if not prefs.email_product_updates:
                    user.drip_step = DRIP_DONE
                    continue

                step = int(user.drip_step or 0)
                days_needed, template = DRIP_STEPS[step]

                # Due? First step counts from signup; later steps count
                # from the previous send so they stay properly spaced.
                if step == 0:
                    due_at = user.created_at + timedelta(days=days_needed)
                else:
                    prev_days = DRIP_STEPS[step - 1][0]
                    due_at = (user.drip_last_sent_at or user.created_at) + timedelta(days=days_needed - prev_days)

                if now < due_at:
                    continue

                # Rate-limit: no more than one drip email per 48h.
                if user.drip_last_sent_at and now - user.drip_last_sent_at < timedelta(hours=MIN_HOURS_BETWEEN_SENDS):
                    continue

                variables = {
                    "RECIPIENT_NAME": user.full_name or "Student",
                    "USER_ID": str(user.id),
                    "UNSUBSCRIBE_CATEGORY": "product_updates",
                }

                if template == "nudge_matches_waiting":
                    sch_count = await _count_active_scholarships(db)
                    subject = f"{sch_count} scholarships are waiting for your profile"
                elif template == "feature_spotlight_resume":
                    subject = "Upload your resume once — we do the matching"
                elif template == "feature_spotlight_saved":
                    subject = "Never miss a scholarship deadline"
                else:  # nudge_final
                    subject = "Your ScholarshipRight account is one step away"

                await send_templated_email(
                    to=user.email,
                    template=template,
                    variables=variables,
                    subject=subject,
                )

                user.drip_step = step + 1
                user.drip_last_sent_at = now
                emails_sent += 1
            except Exception:  # noqa: BLE001 — one bad user must not stop the loop
                logger.exception("[Drip] Failed for user=%s", user.id)

        await db.commit()

    if emails_sent:
        logger.info("[Drip] Sent %d drip emails", emails_sent)
    return emails_sent


async def nurture_drip_loop() -> None:
    """Run the drip pass once per day at a fixed hour (UTC)."""
    import asyncio

    settings = get_settings()
    hour = settings.drip_send_hour_utc
    while True:
        if not settings.drip_enabled:
            await asyncio.sleep(6 * 3600)
            continue

        now = datetime.now(timezone.utc)
        next_run = now.replace(hour=hour, minute=0, second=0, microsecond=0)
        if next_run <= now:
            next_run += timedelta(days=1)

        wait_seconds = (next_run - now).total_seconds()
        logger.info("[Drip] Next run: %s (in %.1fh)", next_run.isoformat(), wait_seconds / 3600)
        await asyncio.sleep(wait_seconds)
        try:
            await process_drip_users()
        except Exception:  # noqa: BLE001
            logger.exception("[Drip] Run failed")
