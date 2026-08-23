"""
Gap analysis for low-scoring users.

Figures out which profile criteria are missing and how many active
scholarships each missing criterion likely blocks, so we can nudge users
with actionable copy like:

    "6 scholarships could score above 70% once you add your GPA."
"""
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.profile import Profile
from app.models.scholarship import Scholarship
from app.models.resume import Resume

logger = logging.getLogger(__name__)


async def compute_gaps(db: AsyncSession, user_id: str) -> list[dict]:
    """Return a list of gaps for this user's profile.

    Each gap: {field, label, cta_path, blocked_count}
    sorted by blocked_count desc. Only returns gaps that actually block
    at least one scholarship (or are always-worth-filling core fields).
    """
    profile = (await db.execute(
        select(Profile).where(Profile.user_id == user_id)
    )).scalar_one_or_none()
    if not profile:
        return []

    resume = (await db.execute(
        select(Resume.id).where(Resume.user_id == user_id, Resume.is_primary == True)  # noqa: E712
    )).scalar_one_or_none()

    # Count active scholarships per relevant attribute (single query,
    # aggregated in Python — scholarship table is small).
    sch_result = await db.execute(
        select(
            Scholarship.min_cgpa,
            Scholarship.degree_levels,
            Scholarship.field_of_study,
            Scholarship.eligibility_basis,
        ).where(Scholarship.is_active == True)  # noqa: E712
    )
    rows = sch_result.all()

    def _count(pred) -> int:
        return sum(1 for r in rows if pred(r))

    gaps: list[dict] = []

    has_cgpa = profile.cgpa is not None
    if not has_cgpa:
        gaps.append({
            "field": "cgpa",
            "label": "your GPA",
            "cta_path": "/onboarding",
            "blocked_count": _count(lambda r: r.min_cgpa is not None),
        })

    if not profile.nationality_code:
        gaps.append({
            "field": "nationality",
            "label": "your nationality",
            "cta_path": "/onboarding",
            "blocked_count": _count(lambda r: (r.eligibility_basis or "either") != "either"),
        })

    if not profile.field_of_study:
        gaps.append({
            "field": "field_of_study",
            "label": "your field of study",
            "cta_path": "/onboarding",
            "blocked_count": _count(lambda r: bool(r.field_of_study)),
        })

    if not profile.degree_level:
        gaps.append({
            "field": "degree_level",
            "label": "your degree level",
            "cta_path": "/onboarding",
            "blocked_count": _count(lambda r: bool(r.degree_levels)),
        })

    if resume is None:
        gaps.append({
            "field": "resume",
            "label": "your resume",
            "cta_path": "/resume",
            # Uploading a resume can improve every match, so use total count.
            "blocked_count": len(rows),
        })

    gaps = [g for g in gaps if g["blocked_count"] > 0]
    gaps.sort(key=lambda g: g["blocked_count"], reverse=True)
    return gaps


def build_gap_html(gaps: list[dict]) -> str:
    """Render gap rows as HTML for email templates."""
    if not gaps:
        return ""
    items = []
    for g in gaps[:3]:
        items.append(
            f"<li style=\"margin:0 0 6px;\">Add <strong>{g['label']}</strong> — "
            f"{g['blocked_count']} scholarship"
            f"{'s' if g['blocked_count'] != 1 else ''} could score higher.</li>"
        )
    return (
        "<div style=\"background:#f5f9ff;border:1px solid #dbe8fb;"
        "border-radius:12px;padding:16px 20px;margin-bottom:16px;\">"
        "<p style=\"margin:0 0 8px;font-weight:800;color:#1a3d7c;"
        "font-family:'Inter',-apple-system,sans-serif;font-size:15px;\">"
        "Unlock more matches</p>"
        "<ul style=\"margin:0;padding-left:18px;font-size:14px;"
        "font-family:'Inter',-apple-system,sans-serif;color:#333;\">"
        + "".join(items)
        + "</ul></div>"
    )
