"""
Admin analytics service — read-only aggregations over the existing tables.

All queries are simple, indexed where possible, and capped at a sensible
range (max 365 days) to keep the response fast. Each function returns
plain Python lists/dicts that can be wrapped in a Pydantic schema by
the route layer.
"""
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat_session import ChatSession
from app.models.match_score import MatchScore
from app.models.resume import Resume
from app.models.saved_scholarship import SavedScholarship
from app.models.scholarship import Scholarship
from app.models.user import User


# ── Helpers ────────────────────────────────────────────────────────


def _date_floor(d: date) -> date:
    return d


def _date_range(days: int) -> List[date]:
    """Return [today - days + 1, ..., today] inclusive."""
    today = datetime.now(timezone.utc).date()
    return [today - timedelta(days=days - 1 - i) for i in range(days)]


def _delta_pct(current: float, previous: float) -> Optional[float]:
    """Return (current - previous) / previous * 100, or None if no previous."""
    if not previous:
        return None
    return round((current - previous) / previous * 100, 1)


# ── KPI tiles for /api/admin/overview ──────────────────────────────


async def kpis(db: AsyncSession) -> List[Dict[str, Any]]:
    """Return KPI tiles for the Overview page.

    Each KPI has:
        key, label, value, format, delta (vs previous 30d), delta_period
    """
    now = datetime.now(timezone.utc)
    p30 = now - timedelta(days=30)
    p60 = now - timedelta(days=60)

    # Total users
    total_users = (await db.execute(select(func.count(User.id)))).scalar_one() or 0
    new_users_30 = (await db.execute(
        select(func.count(User.id)).where(User.created_at >= p30)
    )).scalar_one() or 0
    new_users_prev_30 = (await db.execute(
        select(func.count(User.id)).where(and_(User.created_at >= p60, User.created_at < p30))
    )).scalar_one() or 0
    # Delta is computed against the user count 30d ago, not the count of new users.
    users_30d_ago = total_users - new_users_30

    # Total scholarships (active vs all)
    total_scholarships = (await db.execute(select(func.count(Scholarship.id)))).scalar_one() or 0
    active_scholarships = (await db.execute(
        select(func.count(Scholarship.id)).where(Scholarship.is_active == True)
    )).scalar_one() or 0
    new_sch_30 = (await db.execute(
        select(func.count(Scholarship.id)).where(Scholarship.created_at >= p30)
    )).scalar_one() or 0
    new_sch_prev_30 = (await db.execute(
        select(func.count(Scholarship.id)).where(and_(Scholarship.created_at >= p60, Scholarship.created_at < p30))
    )).scalar_one() or 0
    sch_30d_ago = total_scholarships - new_sch_30

    # Resumes
    total_resumes = (await db.execute(select(func.count(Resume.id)))).scalar_one() or 0
    new_resumes_30 = (await db.execute(
        select(func.count(Resume.id)).where(Resume.created_at >= p30)
    )).scalar_one() or 0
    new_resumes_prev_30 = (await db.execute(
        select(func.count(Resume.id)).where(and_(Resume.created_at >= p60, Resume.created_at < p30))
    )).scalar_one() or 0
    resumes_30d_ago = total_resumes - new_resumes_30

    # Match computes (we count created match_score rows in the last 30d as a proxy for "matches computed")
    match_computes_30 = (await db.execute(
        select(func.count(MatchScore.id)).where(MatchScore.computed_at >= p30)
    )).scalar_one() or 0
    match_computes_prev_30 = (await db.execute(
        select(func.count(MatchScore.id)).where(and_(MatchScore.computed_at >= p60, MatchScore.computed_at < p30))
    )).scalar_one() or 0
    total_matches = (await db.execute(select(func.count(MatchScore.id)))).scalar_one() or 0

    return [
        {
            "key": "total_users",
            "label": "Total users",
            "value": float(total_users),
            "format": "number",
            "delta": _delta_pct(total_users, users_30d_ago),
            "delta_period": "vs 30d ago",
        },
        {
            "key": "active_scholarships",
            "label": "Active scholarships",
            "value": float(active_scholarships),
            "format": "number",
            "delta": _delta_pct(total_scholarships, sch_30d_ago),
            "delta_period": "vs 30d ago",
        },
        {
            "key": "resumes_uploaded",
            "label": "Resumes uploaded",
            "value": float(total_resumes),
            "format": "number",
            "delta": _delta_pct(total_resumes, resumes_30d_ago),
            "delta_period": "vs 30d ago",
        },
        {
            "key": "match_computes_30d",
            "label": "Matches computed (30d)",
            "value": float(match_computes_30),
            "format": "number",
            "delta": _delta_pct(match_computes_30, match_computes_prev_30),
            "delta_period": "vs prior 30d",
        },
        {
            "key": "total_matches",
            "label": "Total match scores",
            "value": float(total_matches),
            "format": "number",
            "delta": None,
            "delta_period": None,
        },
        {
            "key": "new_scholarships_30d",
            "label": "New scholarships (30d)",
            "value": float(new_sch_30),
            "format": "number",
            "delta": _delta_pct(new_sch_30, new_sch_prev_30),
            "delta_period": "vs prior 30d",
        },
    ]


async def recent_signups_7d(db: AsyncSession) -> List[Dict[str, Any]]:
    """Return [{date, count}] for the last 7 days, including zero days."""
    days = _date_range(7)
    p7 = datetime.combine(days[0], datetime.min.time()).replace(tzinfo=timezone.utc)
    rows = (await db.execute(
        select(
            func.date(User.created_at).label("d"),
            func.count(User.id).label("c"),
        )
        .where(User.created_at >= p7)
        .group_by(func.date(User.created_at))
    )).all()
    counts = {str(r.d): int(r.c) for r in rows}
    return [{"date": d.isoformat(), "count": counts.get(d.isoformat(), 0)} for d in days]


async def recent_match_computes_7d(db: AsyncSession) -> List[Dict[str, Any]]:
    """Return [{date, count}] of match scores created in the last 7 days."""
    days = _date_range(7)
    p7 = datetime.combine(days[0], datetime.min.time()).replace(tzinfo=timezone.utc)
    rows = (await db.execute(
        select(
            func.date(MatchScore.computed_at).label("d"),
            func.count(MatchScore.id).label("c"),
        )
        .where(MatchScore.computed_at >= p7)
        .group_by(func.date(MatchScore.computed_at))
    )).all()
    counts = {str(r.d): int(r.c) for r in rows}
    return [{"date": d.isoformat(), "count": counts.get(d.isoformat(), 0)} for d in days]


# ── 6 chart series for /api/admin/analytics ────────────────────────


async def signup_series(db: AsyncSession, days: int) -> List[Dict[str, Any]]:
    rng = _date_range(days)
    start = datetime.combine(rng[0], datetime.min.time()).replace(tzinfo=timezone.utc)
    rows = (await db.execute(
        select(func.date(User.created_at).label("d"), func.count(User.id).label("c"))
        .where(User.created_at >= start)
        .group_by(func.date(User.created_at))
    )).all()
    counts = {str(r.d): int(r.c) for r in rows}
    return [{"date": d.isoformat(), "value": float(counts.get(d.isoformat(), 0))} for d in rng]


async def resume_upload_series(db: AsyncSession, days: int) -> List[Dict[str, Any]]:
    rng = _date_range(days)
    start = datetime.combine(rng[0], datetime.min.time()).replace(tzinfo=timezone.utc)
    rows = (await db.execute(
        select(func.date(Resume.created_at).label("d"), func.count(Resume.id).label("c"))
        .where(Resume.created_at >= start)
        .group_by(func.date(Resume.created_at))
    )).all()
    counts = {str(r.d): int(r.c) for r in rows}
    return [{"date": d.isoformat(), "value": float(counts.get(d.isoformat(), 0))} for d in rng]


async def match_compute_series(db: AsyncSession, days: int) -> List[Dict[str, Any]]:
    rng = _date_range(days)
    start = datetime.combine(rng[0], datetime.min.time()).replace(tzinfo=timezone.utc)
    rows = (await db.execute(
        select(func.date(MatchScore.computed_at).label("d"), func.count(MatchScore.id).label("c"))
        .where(MatchScore.computed_at >= start)
        .group_by(func.date(MatchScore.computed_at))
    )).all()
    counts = {str(r.d): int(r.c) for r in rows}
    return [{"date": d.isoformat(), "value": float(counts.get(d.isoformat(), 0))} for d in rng]


async def chat_message_series(db: AsyncSession, days: int) -> List[Dict[str, Any]]:
    """Total chat messages (user + assistant) per day."""
    rng = _date_range(days)
    start = datetime.combine(rng[0], datetime.min.time()).replace(tzinfo=timezone.utc)
    # ChatSession stores the whole conversation; we don't have a message-level
    # table, so we approximate by counting sessions created that day. The
    # chat_session_messages table (if it exists) is preferred.
    rows = (await db.execute(
        select(func.date(ChatSession.created_at).label("d"), func.count(ChatSession.id).label("c"))
        .where(ChatSession.created_at >= start)
        .group_by(func.date(ChatSession.created_at))
    )).all()
    counts = {str(r.d): int(r.c) for r in rows}
    return [{"date": d.isoformat(), "value": float(counts.get(d.isoformat(), 0))} for d in rng]


async def saved_scholarship_series(db: AsyncSession, days: int) -> List[Dict[str, Any]]:
    rng = _date_range(days)
    start = datetime.combine(rng[0], datetime.min.time()).replace(tzinfo=timezone.utc)
    rows = (await db.execute(
        select(func.date(SavedScholarship.created_at).label("d"), func.count(SavedScholarship.id).label("c"))
        .where(SavedScholarship.created_at >= start)
        .group_by(func.date(SavedScholarship.created_at))
    )).all()
    counts = {str(r.d): int(r.c) for r in rows}
    return [{"date": d.isoformat(), "value": float(counts.get(d.isoformat(), 0))} for d in rng]


async def scholarship_by_country(db: AsyncSession, limit: int = 10) -> List[Dict[str, Any]]:
    """Top host countries by scholarship count — static distribution chart."""
    rows = (await db.execute(
        select(Scholarship.host_country, func.count(Scholarship.id).label("c"))
        .where(Scholarship.is_active == True)
        .group_by(Scholarship.host_country)
        .order_by(func.count(Scholarship.id).desc())
        .limit(limit)
    )).all()
    return [{"label": r.host_country, "value": float(r.c)} for r in rows]


async def scholarship_by_funding(db: AsyncSession) -> List[Dict[str, Any]]:
    """Distribution of scholarships by funding type."""
    rows = (await db.execute(
        select(Scholarship.funding_type, func.count(Scholarship.id).label("c"))
        .where(Scholarship.is_active == True)
        .group_by(Scholarship.funding_type)
        .order_by(func.count(Scholarship.id).desc())
    )).all()
    return [{"label": r.funding_type, "value": float(r.c)} for r in rows]
