"""
Admin API: Overview KPIs + Analytics series.

All routes require `require_admin` — a 403 with a structured
`{ code, user_message, retryable }` envelope is returned for
non-admin users (handled by the dependency).
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.admin import require_admin
from app.db.session import get_db
from app.models.user import User
from app.schemas.admin import (
    AnalyticsResponse,
    AnalyticsSeries,
    OverviewKPI,
    OverviewResponse,
    TimeSeriesPoint,
)
from app.services import admin_analytics

router = APIRouter()


@router.get("/overview", response_model=OverviewResponse)
async def admin_overview(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Top-level overview: 6 KPI tiles + 2 short time series."""
    kpis_raw = await admin_analytics.kpis(db)
    signups = await admin_analytics.recent_signups_7d(db)
    matches = await admin_analytics.recent_match_computes_7d(db)
    return OverviewResponse(
        kpis=[OverviewKPI(**k) for k in kpis_raw],
        recent_signups_7d=signups,
        recent_match_computes_7d=matches,
        generated_at=datetime.now(timezone.utc),
    )


@router.get("/analytics", response_model=AnalyticsResponse)
async def admin_analytics_endpoint(
    range_days: int = Query(30, ge=7, le=365, description="Number of days to include (7-365)"),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """6 series for the analytics dashboard.

    Series:
        signups              — new user sign-ups per day
        resume_uploads       — resumes uploaded per day
        match_computes       — match scores computed per day
        chat_sessions        — chat sessions created per day
        saved_scholarships   — scholarships saved per day
        scholarship_by_country — top host countries (static distribution)
        scholarship_by_funding — funding-type distribution
    """
    signups_pts = await admin_analytics.signup_series(db, range_days)
    resume_pts = await admin_analytics.resume_upload_series(db, range_days)
    match_pts = await admin_analytics.match_compute_series(db, range_days)
    chat_pts = await admin_analytics.chat_message_series(db, range_days)
    saved_pts = await admin_analytics.saved_scholarship_series(db, range_days)
    country_dist = await admin_analytics.scholarship_by_country(db, 10)
    funding_dist = await admin_analytics.scholarship_by_funding(db)

    series = [
        AnalyticsSeries(
            key="signups",
            label="New sign-ups",
            points=[TimeSeriesPoint(**p) for p in signups_pts],
        ),
        AnalyticsSeries(
            key="resume_uploads",
            label="Resumes uploaded",
            points=[TimeSeriesPoint(**p) for p in resume_pts],
        ),
        AnalyticsSeries(
            key="match_computes",
            label="Matches computed",
            points=[TimeSeriesPoint(**p) for p in match_pts],
        ),
        AnalyticsSeries(
            key="chat_sessions",
            label="Chat sessions",
            points=[TimeSeriesPoint(**p) for p in chat_pts],
        ),
        AnalyticsSeries(
            key="saved_scholarships",
            label="Scholarships saved",
            points=[TimeSeriesPoint(**p) for p in saved_pts],
        ),
        AnalyticsSeries(
            key="scholarship_by_country",
            label="Scholarships by country",
            points=[TimeSeriesPoint(date=r["label"], value=r["value"]) for r in country_dist],
        ),
        AnalyticsSeries(
            key="scholarship_by_funding",
            label="Scholarships by funding type",
            points=[TimeSeriesPoint(date=r["label"], value=r["value"]) for r in funding_dist],
        ),
    ]

    return AnalyticsResponse(
        range_days=range_days,
        series=series,
        generated_at=datetime.now(timezone.utc),
    )
