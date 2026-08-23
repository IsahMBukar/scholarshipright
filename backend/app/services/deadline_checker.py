"""
Deadline reminder service.
Checks saved scholarships with reminders enabled and creates notifications
when deadlines are approaching (7 days, 3 days, 1 day).

Runs as a background task on startup, then every 6 hours.
"""

from datetime import datetime, timezone, timedelta
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.saved_scholarship import SavedScholarship
from app.models.scholarship import Scholarship
from app.models.notification import Notification
from app.models.user import User
from app.db.session import AsyncSessionLocal
from app.services.notifications import emit_notification
import logging

logger = logging.getLogger(__name__)


# Reminder windows: (days_before_deadline, notification_title_template)
REMINDER_WINDOWS = [
    (7, "⏰ 7 days left"),
    (3, "⚠️ 3 days left"),
    (1, "🚨 Deadline tomorrow!"),
]


async def check_deadlines():
    """Check all saved scholarships with reminders and create notifications."""
    try:
        async with AsyncSessionLocal() as db:
            now = datetime.now(timezone.utc).date()
            notifications_created = 0

            for days_before, title_template in REMINDER_WINDOWS:
                target_date = now + timedelta(days=days_before)

                # Find saved scholarships with reminders enabled whose deadline matches
                query = (
                    select(SavedScholarship, Scholarship)
                    .join(Scholarship, SavedScholarship.scholarship_id == Scholarship.id)
                    .where(
                        SavedScholarship.reminder_enabled == True,
                        Scholarship.is_active == True,
                        Scholarship.deadline == target_date,
                    )
                )
                result = await db.execute(query)
                rows = result.all()

                for saved, scholarship in rows:
                    # Check if we already sent this notification today
                    existing = await db.execute(
                        select(Notification).where(
                            Notification.user_id == saved.user_id,
                            Notification.scholarship_id == scholarship.id,
                            Notification.type == "deadline",
                            Notification.title.like(f"%{days_before}%"),
                            Notification.created_at >= datetime.combine(now, datetime.min.time()).replace(tzinfo=timezone.utc),
                        )
                    )
                    if existing.scalar_one_or_none():
                        continue  # Already notified today

                    # Create notification via the shared helper — dedup
                    # rules (DEDUP_WINDOWS["deadline"]) apply.
                    deadline_str = scholarship.deadline.strftime("%b %d, %Y")
                    n = await emit_notification(
                        db,
                        user_id=saved.user_id,
                        kind="deadline",
                        title=f"{title_template} — {scholarship.name}",
                        message=(
                            f"The application deadline for {scholarship.name} "
                            f"({scholarship.host_country}) is on {deadline_str}. "
                            "Don't miss it!"
                        ),
                        link=f"/scholarships/{scholarship.slug}",
                        scholarship_id=scholarship.id,
                        dedup=True,
                    )
                    if n is not None:
                        notifications_created += 1

                        # Send deadline reminder email (fire-and-forget)
                        from app.services.email import send_templated_email
                        # Resolve user email
                        from app.models.user import User
                        user_result = await db.execute(select(User).where(User.id == saved.user_id))
                        user = user_result.scalar_one_or_none()
                        if user:
                            urgency_map = {
                                7: ("d4972e", "7 DAYS LEFT", "You have one week left to apply for this scholarship."),
                                3: ("e67e22", "3 DAYS LEFT", "Only 3 days left! Don't miss this deadline."),
                                1: ("e74c3c", "DEADLINE TOMORROW", "This deadline is tomorrow — apply now!"),
                            }
                            color, badge, msg = urgency_map.get(days_before, ("d4972e", "REMINDER", "Deadline approaching."))
                            await send_templated_email(
                                to=user.email,
                                template="deadline_reminder",
                                variables={
                                    "RECIPIENT_NAME": user.full_name or "Student",
                                    "SCHOLARSHIP_NAME": scholarship.name,
                                    "DEADLINE": deadline_str,
                                    "DAYS_LEFT": str(days_before),
                                    "URGENCY_COLOR": color,
                                    "URGENCY_BADGE": badge,
                                    "URGENCY_MESSAGE": msg,
                                    "USER_ID": str(user.id),
                                    "UNSUBSCRIBE_CATEGORY": "deadline_reminders",
                                },
                                subject=f"{badge}: {scholarship.name}",
                            )

            await db.commit()
            if notifications_created > 0:
                logger.info("[DeadlineChecker] Created %d deadline notifications", notifications_created)
            else:
                logger.info("[DeadlineChecker] No new deadline notifications needed")

            # ── Deadline passed: turn the loss into re-engagement ────
            await notify_deadlines_passed(db, now)

    except Exception as e:
        logger.exception("[DeadlineChecker] Error")


async def notify_deadlines_passed(db: AsyncSession, now):
    """One day after a saved scholarship's deadline passes, send a
    'this one closed' email suggesting similar open scholarships."""
    try:
        target_date = now - timedelta(days=1)

        query = (
            select(SavedScholarship, Scholarship)
            .join(Scholarship, SavedScholarship.scholarship_id == Scholarship.id)
            .where(
                SavedScholarship.reminder_enabled == True,
                Scholarship.deadline == target_date,
            )
        )
        result = await db.execute(query)
        rows = result.all()

        sent = 0
        for saved, scholarship in rows:
            if not scholarship.is_active:
                continue

            # Per-day dedup via a dedicated notification kind.
            existing = await db.execute(
                select(Notification).where(
                    Notification.user_id == saved.user_id,
                    Notification.scholarship_id == scholarship.id,
                    Notification.type == "deadline_closed",
                    Notification.created_at >= datetime.combine(now, datetime.min.time()).replace(tzinfo=timezone.utc),
                )
            )
            if existing.scalar_one_or_none():
                continue

            user_result = await db.execute(select(User).where(User.id == saved.user_id))
            user = user_result.scalar_one_or_none()
            if not user or not user.is_active or user.email_confirmed_at is None:
                continue

            from app.models.notification_preference import get_or_create_preferences
            prefs = await get_or_create_preferences(db, saved.user_id)
            if not prefs.email_deadline_reminders:
                continue

            n = await emit_notification(
                db,
                user_id=saved.user_id,
                kind="deadline_closed",
                title=f"⌛ Deadline passed — {scholarship.name}",
                message=(
                    f"The deadline for {scholarship.name} has passed. "
                    "We found similar scholarships that are still open."
                ),
                link="/scholarships",
                scholarship_id=scholarship.id,
                dedup=True,
            )

            if n is not None:
                # Find similar still-open scholarships: same country first,
                # then fill up with any open ones ordered by deadline.
                similar_q = (
                    select(Scholarship)
                    .where(
                        Scholarship.is_active == True,
                        Scholarship.id != scholarship.id,
                        Scholarship.deadline.isnot(None),
                        Scholarship.deadline > now,
                    )
                    .order_by(
                        (Scholarship.host_country == scholarship.host_country).desc(),
                        Scholarship.deadline.asc(),
                    )
                    .limit(3)
                )
                similar = (await db.execute(similar_q)).scalars().all()

                from app.services.weekly_digest import _build_match_card
                cards = []
                for sch in similar:
                    deadline_str = sch.deadline.strftime("%b %d, %Y") if sch.deadline else "Open"
                    cards.append(_build_match_card(
                        scholarship_name=sch.name,
                        score=0,
                        amount=getattr(sch, "amount", None) or "See details",
                        deadline=deadline_str,
                        country=getattr(sch, "host_country", None) or "",
                    ))

                from app.services.email import send_templated_email
                await send_templated_email(
                    to=user.email,
                    template="deadline_passed",
                    variables={
                        "RECIPIENT_NAME": user.full_name or "Student",
                        "SCHOLARSHIP_NAME": scholarship.name,
                        "DEADLINE": scholarship.deadline.strftime("%b %d, %Y"),
                        "SIMILAR_CARDS": "\n".join(cards),
                        "USER_ID": str(user.id),
                        "UNSUBSCRIBE_CATEGORY": "deadline_reminders",
                    },
                    subject=f"Deadline passed: {scholarship.name} — here's what's still open",
                )
                sent += 1

        await db.commit()
        if sent:
            logger.info("[DeadlineChecker] Sent %d deadline-passed emails", sent)

    except Exception:
        logger.exception("[DeadlineChecker] notify_deadlines_passed failed")


async def deadline_checker_loop():
    """Run deadline check on startup, then every 6 hours."""
    import asyncio

    # Run immediately on startup
    await check_deadlines()

    # Then every 6 hours
    while True:
        await asyncio.sleep(6 * 60 * 60)  # 6 hours
        await check_deadlines()
