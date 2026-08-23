"""
Weekly digest email service.

Runs as a background task every Sunday at 9 AM UTC. For each user with
active matches, sends a weekly digest email:

- Scores are split into tiers instead of a single >=50% filter:
    strong      — score >= 70%   ("Strong matches")
    worth a look—score 50–69%   ("Worth a look")
    low         — all matches < 50% → separate "closest matches" email
                  showing the top 3 plus profile gap analysis
- A gap-analysis block ("Unlock more matches") is appended when the
  user's profile is missing criteria that block scholarships.

Runs alongside the deadline_checker and daily_match_bundle loops in
main.py lifespan.
"""
import logging
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import AsyncSessionLocal
from app.models.user import User
from app.models.match_score import MatchScore
from app.models.scholarship import Scholarship

logger = logging.getLogger(__name__)


TOP_N = 5          # Number of top matches to include in the digest
CLOSEST_N = 3      # Top matches shown to users whose best score is below WORTH_LOOK_MIN

STRONG_MATCH_MIN_SCORE = 70.0
WORTH_LOOK_MIN_SCORE = 50.0


def _build_match_card(scholarship_name: str, score: float, amount: str, deadline: str, country: str) -> str:
    """Build a single match card HTML for the digest."""
    score_rounded = round(score)
    return f'''    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fdfbf7;border:1px solid #f0ebe0;border-radius:12px;margin-bottom:10px;">
      <tr>
        <td style="padding:16px 20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <p style="margin:0 0 4px;font-family:'Inter',-apple-system,sans-serif;font-size:15px;font-weight:800;color:#1a1a1a;">{scholarship_name}</p>
                <p style="margin:0;font-family:'Inter',-apple-system,sans-serif;font-size:12px;color:#999;">{country} &middot; {amount} &middot; Due {deadline}</p>
              </td>
              <td align="right" valign="middle" style="padding-left:12px;">
                <div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#f5b942 0%,#d4972e 100%);text-align:center;line-height:44px;">
                  <span style="font-family:'Inter',-apple-system,sans-serif;font-size:15px;font-weight:900;color:#1a1a1a;">{score_rounded}%</span>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>'''


def _cards_for_rows(rows) -> list[str]:
    cards = []
    for match, sch in rows:
        deadline_str = sch.deadline.strftime("%b %d, %Y") if sch.deadline else "Open"
        amount = getattr(sch, "amount", None) or "See details"
        country = getattr(sch, "host_country", None) or ""
        cards.append(_build_match_card(
            scholarship_name=sch.name,
            score=float(match.score),
            amount=amount,
            deadline=deadline_str,
            country=country,
        ))
    return cards


async def _fetch_top_matches(db: AsyncSession, user_id, limit: int):
    """Top N matches regardless of threshold, strongest first."""
    result = await db.execute(
        select(MatchScore, Scholarship)
        .join(Scholarship, MatchScore.scholarship_id == Scholarship.id)
        .where(
            MatchScore.user_id == user_id,
            MatchScore.score > 0,
            Scholarship.is_active == True,  # noqa: E712
        )
        .order_by(MatchScore.score.desc())
        .limit(limit)
    )
    return result.all()


def _worth_look_section(rows) -> str:
    """HTML for the 'Worth a look' sub-section."""
    cards = _cards_for_rows(rows)
    return (
        '<p style="margin:20px 0 10px;font-family:\'Inter\',-apple-system,sans-serif;'
        'font-size:13px;font-weight:700;color:#888;text-transform:uppercase;'
        'letter-spacing:1px;">Also worth a look</p>' + "\n".join(cards)
    )


async def _gap_section(db: AsyncSession, user_id) -> str:
    """HTML gap-analysis block, or empty string if no actionable gaps."""
    from app.services.gap_analysis import compute_gaps, build_gap_html
    gaps = await compute_gaps(db, user_id)
    return build_gap_html(gaps)


async def send_weekly_digests():
    """Send weekly digest emails to all users with matches."""
    try:
        async with AsyncSessionLocal() as db:
            # Get all users with email confirmed
            users_result = await db.execute(
                select(User).where(
                    User.is_active == True,  # noqa: E712
                    User.email_confirmed_at.isnot(None),
                )
            )
            users = users_result.scalars().all()

            emails_sent = 0

            for user in users:
                from app.models.notification_preference import get_or_create_preferences
                prefs = await get_or_create_preferences(db, user.id)
                if not prefs.email_weekly_digest:
                    continue

                rows = await _fetch_top_matches(db, user.id, TOP_N)
                if not rows:
                    continue  # No matches at all, skip

                from app.services.email import send_templated_email

                if float(rows[0].MatchScore.score) >= WORTH_LOOK_MIN_SCORE:
                    # Standard digest: split into strong vs worth-a-look
                    strong = [r for r in rows if float(r.MatchScore.score) >= STRONG_MATCH_MIN_SCORE]
                    worth_look = [r for r in rows if WORTH_LOOK_MIN_SCORE <= float(r.MatchScore.score) < STRONG_MATCH_MIN_SCORE]

                    match_cards_html = "\n".join(_cards_for_rows(strong))
                    worth_look_html = _worth_look_section(worth_look) if worth_look else ""
                    gap_html = await _gap_section(db, user.id)

                    await send_templated_email(
                        to=user.email,
                        template="weekly_digest",
                        variables={
                            "RECIPIENT_NAME": user.full_name or "Student",
                            "MATCH_CARDS": match_cards_html,
                            "WORTH_LOOK_SECTION": worth_look_html,
                            "GAP_SECTION": gap_html,
                            "USER_ID": str(user.id),
                            "UNSUBSCRIBE_CATEGORY": "weekly_digest",
                        },
                        subject="Your weekly scholarship matches",
                    )
                else:
                    # Low scorer: honest "closest matches" framing + gaps.
                    closest = rows[:CLOSEST_N]
                    match_cards_html = "\n".join(_cards_for_rows(closest))
                    gap_html = await _gap_section(db, user.id)

                    await send_templated_email(
                        to=user.email,
                        template="closest_matches",
                        variables={
                            "RECIPIENT_NAME": user.full_name or "Student",
                            "MATCH_CARDS": match_cards_html,
                            "GAP_SECTION": gap_html,
                            "USER_ID": str(user.id),
                            "UNSUBSCRIBE_CATEGORY": "weekly_digest",
                        },
                        subject="Scholarships closest to your profile",
                    )

                emails_sent += 1

            if emails_sent > 0:
                logger.info("[WeeklyDigest] Sent %d digest emails", emails_sent)
            else:
                logger.info("[WeeklyDigest] No users with matches to email")

    except Exception:
        logger.exception("[WeeklyDigest] Error")


async def weekly_digest_loop():
    """Run weekly digest every Sunday at 9 AM UTC."""
    import asyncio

    while True:
        now = datetime.now(timezone.utc)
        # Calculate seconds until next Sunday 9 AM UTC
        days_until_sunday = (6 - now.weekday()) % 7  # 6 = Sunday
        if days_until_sunday == 0 and now.hour >= 9:
            days_until_sunday = 7  # Already past 9 AM this Sunday, wait for next

        from datetime import timedelta
        next_run = now.replace(hour=9, minute=0, second=0, microsecond=0) + timedelta(days=days_until_sunday)
        wait_seconds = (next_run - now).total_seconds()

        logger.info("[WeeklyDigest] Next run: %s (in %.1fh)", next_run.isoformat(), wait_seconds / 3600)
        await asyncio.sleep(wait_seconds)
        await send_weekly_digests()
