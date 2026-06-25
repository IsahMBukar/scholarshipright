from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from uuid import UUID

from app.core.rate_limit import matches_rate_limit
from app.db.session import get_db
from app.models.match_score import MatchScore
from app.models.scholarship import Scholarship
from app.schemas.scholarship import ScholarshipResponse
from app.api.users import get_current_user
from app.models.user import User
from app.services.match_engine import compute_match_score
from app.services.document_defaults import apply_auto_defaults
from app.services.match_auto import (
    REASON_MANUAL,
    recompute_matches_for_user,
)

router = APIRouter()


@router.get("", response_model=List[dict], dependencies=[Depends(matches_rate_limit)])
async def get_matches(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get scholarships sorted by match score for current user.

    If the user's data changed since the last compute (resume edited, profile
    updated, etc.) and the recompute job hasn't finished yet, we transparently
    run a synchronous recompute so the response is never stale. Auto-recompute
    fires automatically on every profile/resume write — there is no manual
    "recompute" endpoint by design.
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
            "scholarship": ScholarshipResponse.model_validate(
                apply_auto_defaults(scholarship)
            ).model_dump(),
            "score": float(ms.score),
            "breakdown": ms.breakdown,
        }
        for ms, scholarship in rows
    ]
