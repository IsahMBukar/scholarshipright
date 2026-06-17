from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from uuid import UUID

from app.db.session import get_db
from app.models.match_score import MatchScore
from app.models.scholarship import Scholarship
from app.schemas.scholarship import ScholarshipResponse
from app.api.users import get_current_user
from app.models.user import User
from app.services.match_engine import compute_match_score
from app.core.rate_limit import match_compute_rate_limit
from app.services.match_auto import (
    REASON_MANUAL,
    recompute_matches_for_user,
)

router = APIRouter()


@router.get("", response_model=List[dict])
async def get_matches(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get scholarships sorted by match score for current user.

    If the user's data changed since the last compute (resume edited, profile
    updated, etc.) and the recompute job hasn't finished yet, we transparently
    run a synchronous recompute so the response is never stale.
    """
    user_row = await db.get(User, user.id)
    if user_row is not None and getattr(user_row, "match_dirty", False):
        # Reuse the same logic the background task runs.
        from app.services.match_auto import REASON_MANUAL
        await recompute_matches_for_user(user.id, reason=REASON_MANUAL)
        # Refresh the row so we don't re-enter on the next call.
        await db.refresh(user_row)

    query = (
        select(MatchScore, Scholarship)
        .join(Scholarship, MatchScore.scholarship_id == Scholarship.id)
        .where(MatchScore.user_id == user.id)
        .order_by(MatchScore.score.desc())
        .limit(50)
    )
    result = await db.execute(query)
    rows = result.all()

    return [
        {
            "scholarship": ScholarshipResponse.model_validate(scholarship).model_dump(),
            "score": float(ms.score),
            "breakdown": ms.breakdown,
        }
        for ms, scholarship in rows
    ]


@router.post("/compute", dependencies=[Depends(match_compute_rate_limit)])
async def compute_matches(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Trigger match score computation for user against all active scholarships."""
    # Delegate to the shared auto-recompute so behaviour matches the background
    # path: if the user has no profile yet, we report it cleanly.
    from app.models.profile import Profile

    profile_result = await db.execute(select(Profile).where(Profile.user_id == user.id))
    if not profile_result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Complete your profile before computing matches")

    result = await recompute_matches_for_user(user.id, reason=REASON_MANUAL)
    if result.get("status") == "error":
        raise HTTPException(status_code=500, detail=f"Match recompute failed: {result.get('error')}")

    return {
        "status": result.get("status", "computed"),
        "total_scholarships": result.get("total_scholarships", 0),
        "matches_found": result.get("matches", 0),
        "resume_used": result.get("resume_used", False),
        "scoring_version": "smart_resume_requirement_v2",
    }
