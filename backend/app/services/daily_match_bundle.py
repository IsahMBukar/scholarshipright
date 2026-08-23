"""
Daily match bundle email service.

Runs once per day (default 18:00 UTC). Collects all rows from
pending_match_emails, groups them per user, and sends ONE bundled
"new matches" email per user (top 10 by score), then clears the queue.

Runs alongside the deadline_checker and weekly_digest loops in main.py
lifespan.
"""
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select

from app.core.config import get_settings
from app.db.session import AsyncSessionLocal
from app.models.pending_match_email import PendingMatchEmail
from app.models.scholarship import Scholarship
from app.models.user import User

logger = logging.getLogger(__name__)


MAX_MATCHES_PER_EMAIL = 10


async def send_daily_bundles() -> int:
    """Send one bundle email per user with queued matches. Returns count sent."""
    from app.models.notification_preference import get_or_create_preferences
    from app.services.email import send_templated_email
    from app.services.weekly_digest import _build_match_card

    async with AsyncSessionLocal() as db:
        # Group queued rows by user
        queued_result = await db.execute(
            select(
                PendingMatchEmail.user_id,
                PendingMatchEmail.scholarship_id,
                PendingMatchEmail.score,
                PendingMatchEmail.kind,
            ).order_by(PendingMatchEmail.score.desc())
        )
        rows = queued_result.all()
        if not rows:
            logger.info("[DailyBundle] No queued matches")
            return 0

        by_user: dict = {}
        for user_id, scholarship_id, score, kind in rows:
            by_user.setdefault(user_id, []).append((scholarship_id, float(score), kind))

        emails_sent = 0

        for user_id, matches in by_user.items():
            user_row = (await db.execute(
                select(User).where(User.id == user_id)
            )).scalar_one_or_none()

            # Delete this user's queue rows regardless of whether we send,
            # so stale entries don't pile up for inactive/unsubscribed users.
            await db.execute(
                delete(PendingMatchEmail).where(PendingMatchEmail.user_id == user_id)
            )

            if not user_row or not user_row.is_active or user_row.email_confirmed_at is None:
                continue

            prefs = await get_or_create_preferences(db, user_id)
            if not prefs.email_new_matches and not prefs.email_match_improvements:
                continue

            # Sort by score, cap at MAX_MATCHES_PER_EMAIL
            matches.sort(key=lambda x: x[1], reverse=True)
            new_matches = [m for m in matches if m[2] == "new"][:MAX_MATCHES_PER_EMAIL]
            improved_matches = [m for m in matches if m[2] == "improved"][:MAX_MATCHES_PER_EMAIL]

            async def _cards(items):
                cards = []
                for scholarship_id, score, _kind in items:
                    sch = (await db.execute(
                        select(Scholarship).where(Scholarship.id == scholarship_id)
                    )).scalar_one_or_none()
                    if not sch or not sch.is_active:
                        continue
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
                return cards

            new_cards = await _cards(new_matches)
            improved_cards = await _cards(improved_matches)

            if not new_cards and not improved_cards:
                continue

            match_cards_html = "\n".join(new_cards)
            improved_html = ""
            if improved_cards:
                improved_html = (
                    '<p style="margin:20px 0 10px;font-family:\'Inter\',-apple-system,sans-serif;'
                    'font-size:13px;font-weight:700;color:#888;text-transform:uppercase;'
                    'letter-spacing:1px;">Your existing matches improved</p>'
                    + "\n".join(improved_cards)
                )

            count_new = len(new_cards)
            total = count_new + len(improved_cards)
            top_score = max(
                (m[1] for m in new_matches + improved_matches),
                default=0,
            )
            if count_new == 1 and not improved_cards:
                heading = "New scholarship match!"
                subtext = f"a new scholarship just scored {round(top_score)}% against your profile."
            elif count_new > 0:
                heading = f"{count_new} new scholarship matches!"
                subtext = f"you have {count_new} new scholarships that scored 70%+ against your profile."
            else:
                heading = "Your matches just got better"
                subtext = f"{total} of your existing matches improved significantly today."

            try:
                await send_templated_email(
                    to=user_row.email,
                    template="new_matches_bundle",
                    variables={
                        "RECIPIENT_NAME": user_row.full_name or "Student",
                        "HEADING": heading,
                        "SUBTEXT": subtext,
                        "MATCH_CARDS": match_cards_html,
                        "IMPROVED_SECTION": improved_html,
                        "USER_ID": str(user_id),
                        "UNSUBSCRIBE_CATEGORY": "new_matches",
                    },
                    subject=f"{heading.replace('!', '')} — top: {round(top_score)}%",
                )
                emails_sent += 1
            except Exception:  # noqa: BLE001 — one bad email must not stop the loop
                logger.exception("[DailyBundle] Failed to email user=%s", user_id)

        await db.commit()

        if emails_sent:
            logger.info("[DailyBundle] Sent %d bundle emails for %d users", emails_sent, len(by_user))
        else:
            logger.info("[DailyBundle] Queued %d users but no emails sent", len(by_user))
        return emails_sent


async def daily_match_bundle_loop() -> None:
    """Run the daily bundle send at a fixed hour (UTC), every day."""
    import asyncio

    hour = get_settings().daily_bundle_hour_utc
    while True:
        now = datetime.now(timezone.utc)
        next_run = now.replace(hour=hour, minute=0, second=0, microsecond=0)
        if next_run <= now:
            next_run += timedelta(days=1)

        wait_seconds = (next_run - now).total_seconds()
        logger.info("[DailyBundle] Next run: %s (in %.1fh)", next_run.isoformat(), wait_seconds / 3600)
        await asyncio.sleep(wait_seconds)
        try:
            await send_daily_bundles()
        except Exception:  # noqa: BLE001
            logger.exception("[DailyBundle] Run failed")
