"""
Deadline-extension notification service.

When an admin extends a scholarship's deadline, users who saved it
deserve the good news immediately: "more time to apply".

Called from the admin PATCH endpoint after commit. Creates an in-app
notification (kind "deadline_extended", 3-day dedup) and sends a
deadline_extended email, gated by the `email_deadline_reminders`
preference.
"""
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.saved_scholarship import SavedScholarship
from app.models.user import User

logger = logging.getLogger(__name__)


async def notify_deadline_extension(
    db: AsyncSession,
    *,
    scholarship,
    old_deadline,
) -> int:
    """Notify all users who saved this scholarship that its deadline was
    extended. Returns number of emails sent. Caller owns the session and
    commits."""
    from app.services.email import send_templated_email
    from app.services.notifications import emit_notification
    from app.models.notification_preference import get_or_create_preferences

    if old_deadline is None or scholarship.deadline is None:
        return 0
    if scholarship.deadline <= old_deadline:
        return 0  # not an extension (shortened or unchanged)

    new_str = scholarship.deadline.strftime("%b %d, %Y")
    old_str = old_deadline.strftime("%b %d, %Y")

    savers_result = await db.execute(
        select(SavedScholarship.user_id).where(
            SavedScholarship.scholarship_id == scholarship.id
        )
    )
    user_ids = savers_result.scalars().all()

    emails_sent = 0
    for user_id in user_ids:
        try:
            user = (await db.execute(
                select(User).where(User.id == user_id)
            )).scalar_one_or_none()
            if not user or not user.is_active or user.email_confirmed_at is None:
                continue

            prefs = await get_or_create_preferences(db, user_id)
            if not prefs.email_deadline_reminders:
                continue

            n = await emit_notification(
                db,
                user_id=user_id,
                kind="deadline_extended",
                title=f"📅 More time: {scholarship.name}",
                message=(
                    f"Good news — the deadline for {scholarship.name} was "
                    f"extended from {old_str} to {new_str}. You have more "
                    "time to apply!"
                ),
                link=f"/scholarships/{scholarship.slug}",
                scholarship_id=scholarship.id,
                dedup=True,
            )

            if n is not None:
                await send_templated_email(
                    to=user.email,
                    template="deadline_extended",
                    variables={
                        "RECIPIENT_NAME": user.full_name or "Student",
                        "SCHOLARSHIP_NAME": scholarship.name,
                        "OLD_DEADLINE": old_str,
                        "NEW_DEADLINE": new_str,
                        "USER_ID": str(user_id),
                        "UNSUBSCRIBE_CATEGORY": "deadline_reminders",
                    },
                    subject=f"Good news: {scholarship.name} deadline extended to {new_str}",
                )
                emails_sent += 1
        except Exception:  # noqa: BLE001 — one bad user must not stop the loop
            logger.exception("[DeadlineExtended] Failed for user=%s", user_id)

    if emails_sent:
        logger.info(
            "[DeadlineExtended] scholarship=%s notified %d savers",
            scholarship.id, emails_sent,
        )
    return emails_sent
