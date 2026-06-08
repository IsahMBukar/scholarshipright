from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from typing import List
from uuid import UUID
from datetime import datetime, timezone

from app.db.session import get_db
from app.models.match_score import MatchScore
from app.models.scholarship import Scholarship
from app.models.profile import Profile
from app.schemas.scholarship import ScholarshipResponse
from app.api.users import get_current_user
from app.models.user import User
from app.services.match_engine import compute_match_score

router = APIRouter()


@router.get("", response_model=List[dict])
async def get_matches(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get scholarships sorted by match score for current user."""
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


@router.post("/compute")
async def compute_matches(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Trigger match score computation for user against all active scholarships."""
    # Get user profile
    profile_result = await db.execute(
        select(Profile).where(Profile.user_id == user.id)
    )
    profile = profile_result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=400, detail="Complete your profile before computing matches")

    # Get all active scholarships
    sch_result = await db.execute(
        select(Scholarship).where(Scholarship.is_active == True)
    )
    scholarships = sch_result.scalars().all()

    # Delete old match scores for this user
    await db.execute(
        delete(MatchScore).where(MatchScore.user_id == user.id)
    )

    # Compute and store new scores
    computed = 0
    for sch in scholarships:
        result = compute_match_score(profile, sch)
        if result["score"] > 0:  # Only store non-zero matches
            match = MatchScore(
                user_id=user.id,
                scholarship_id=sch.id,
                score=result["score"],
                breakdown=result["breakdown"],
            )
            db.add(match)
            computed += 1

    await db.commit()

    return {
        "status": "computed",
        "total_scholarships": len(scholarships),
        "matches_found": computed,
    }
