"""
Weekly digest email service.

Runs as a background task every Sunday at 9 AM UTC. For each user with
active matches, sends a weekly_digest email containing their top 5
scholarship matches.

Runs alongside the deadline_checker loop in main.py lifespan.
"""
from datetime import datetime, timezone
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.models.user import User
from app.models.match_score import MatchScore
from app.models.scholarship import Scholarship


TOP_N = 5  # Number of top matches to include in the digest


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


async def send_weekly_digests():
    """Send weekly digest emails to all users with matches."""
    try:
        async with AsyncSessionLocal() as db:
            # Get all users with email confirmed and matches
            users_result = await db.execute(
                select(User).where(
                    User.is_active == True,
                    User.email_confirmed_at.isnot(None),
                )
            )
            users = users_result.scalars().all()

            emails_sent = 0

            for user in users:
                # Check if user has weekly digest enabled
                from app.models.notification_preference import get_or_create_preferences
                prefs = await get_or_create_preferences(db, user.id)
                if not prefs.email_weekly_digest:
                    continue

                # Get top N matches for this user
                matches_result = await db.execute(
                    select(MatchScore, Scholarship)
                    .join(Scholarship, MatchScore.scholarship_id == Scholarship.id)
                    .where(
                        MatchScore.user_id == user.id,
                        MatchScore.score >= 50.0,
                        Scholarship.is_active == True,
                    )
                    .order_by(MatchScore.score.desc())
                    .limit(TOP_N)
                )
                rows = matches_result.all()

                if not rows:
                    continue  # No matches, skip

                # Build match cards HTML
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

                match_cards_html = "\n".join(cards)

                # Send digest email
                from app.services.email import send_templated_email
                await send_templated_email(
                    to=user.email,
                    template="weekly_digest",
                    variables={
                        "RECIPIENT_NAME": user.full_name or "Student",
                        "MATCH_CARDS": match_cards_html,
                        "USER_ID": str(user.id),
                        "UNSUBSCRIBE_CATEGORY": "weekly_digest",
                    },
                    subject="Your weekly scholarship matches",
                )
                emails_sent += 1

            if emails_sent > 0:
                print(f"[WeeklyDigest] Sent {emails_sent} digest emails")
            else:
                print("[WeeklyDigest] No users with matches to email")

    except Exception as e:
        print(f"[WeeklyDigest] Error: {e}")


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

        print(f"[WeeklyDigest] Next run: {next_run.isoformat()} (in {wait_seconds/3600:.1f}h)")
        await asyncio.sleep(wait_seconds)
        await send_weekly_digests()
