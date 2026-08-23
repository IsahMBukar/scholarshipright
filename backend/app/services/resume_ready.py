"""
"Resume ready" email service.

Fired right after a successful resume analysis — this is the single
highest-emotion activation moment (upload → first match scores), so it
is intentionally EXEMPT from the daily batching: the user just took an
explicit action and expects immediate feedback.

Contains the user's top 3 match scores. If no scores are cached yet,
runs one synchronous recompute first.
"""
import logging

from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.match_score import MatchScore
from app.models.scholarship import Scholarship
from app.models.user import User

logger = logging.getLogger(__name__)


TOP_N = 3


async def send_resume_ready_email(user_id) -> bool:
    """Send the 'your resume is analysed' email with top matches.

    Returns True if an email was sent.
    """
    from app.services.email import send_templated_email
    from app.services.weekly_digest import _build_match_card

    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
        if not user or not user.is_active or user.email_confirmed_at is None:
            return False

        rows = (await db.execute(
            select(MatchScore, Scholarship)
            .join(Scholarship, MatchScore.scholarship_id == Scholarship.id)
            .where(
                MatchScore.user_id == user_id,
                MatchScore.score > 0,
                Scholarship.is_active == True,  # noqa: E712
            )
            .order_by(MatchScore.score.desc())
            .limit(TOP_N)
        )).all()

        # No cached scores yet (analysis finished before the recompute
        # task ran) — compute once synchronously, then re-query.
        if not rows:
            from app.services.match_auto import recompute_matches_for_user
            await recompute_matches_for_user(user_id, reason="resume_ready_email")
            rows = (await db.execute(
                select(MatchScore, Scholarship)
                .join(Scholarship, MatchScore.scholarship_id == Scholarship.id)
                .where(
                    MatchScore.user_id == user_id,
                    MatchScore.score > 0,
                    Scholarship.is_active == True,  # noqa: E712
                )
                .order_by(MatchScore.score.desc())
                .limit(TOP_N)
            )).all()

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

        if cards:
            subtext = (
                f"We analysed your resume and scored every scholarship against it. "
                f"Here {'is' if len(cards) == 1 else 'are'} your top {len(cards)} — "
                "of many more waiting."
            )
        else:
            subtext = (
                "We analysed your resume successfully. You don't have strong "
                "matches yet — complete your profile so we can score you "
                "against every scholarship."
            )

        cards_html = "\n".join(cards)

        try:
            result = await send_templated_email(
                to=user.email,
                template="resume_ready",
                variables={
                    "RECIPIENT_NAME": user.full_name or "Student",
                    "SUBTEXT": subtext,
                    "MATCH_CARDS": cards_html,
                    "USER_ID": str(user_id),
                    "UNSUBSCRIBE_CATEGORY": "new_matches",
                },
                subject="Your resume is ready — here's your first match score",
            )
            sent = bool(result.get("success"))
            if sent:
                logger.info("[ResumeReady] Email sent user=%s", user_id)
            return sent
        except Exception:  # noqa: BLE001
            logger.exception("[ResumeReady] Failed to email user=%s", user_id)
            return False
