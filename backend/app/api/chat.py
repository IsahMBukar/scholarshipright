from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from uuid import UUID
from datetime import datetime, timezone
import json

from app.db.session import get_db
from app.models.chat_session import ChatSession
from app.models.profile import Profile
from app.models.scholarship import Scholarship
from app.models.match_score import MatchScore
from app.schemas.chat import ChatSessionResponse, ChatMessageRequest, ChatMessage
from app.api.users import get_current_user
from app.models.user import User
from app.services.scholarbot import get_scholarbot_response
from app.core.config import get_settings

router = APIRouter()


@router.get("/sessions", response_model=List[ChatSessionResponse])
async def list_sessions(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(ChatSession)
        .where(ChatSession.user_id == user.id)
        .order_by(ChatSession.updated_at.desc())
    )
    result = await db.execute(query)
    sessions = result.scalars().all()
    return [ChatSessionResponse.model_validate(s) for s in sessions]


@router.post("/sessions", response_model=ChatSessionResponse)
async def create_session(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = ChatSession(user_id=user.id, messages=[])
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return ChatSessionResponse.model_validate(session)


@router.post("/sessions/{session_id}/message")
async def send_message(
    session_id: UUID,
    msg: ChatMessageRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(ChatSession).where(
        ChatSession.id == session_id,
        ChatSession.user_id == user.id,
    )
    result = await db.execute(query)
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")

    # Add user message
    messages = session.messages or []
    messages.append({
        "role": "user",
        "content": msg.message,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    # Build context for ScholarBot
    settings = get_settings()

    # Get user profile
    profile_result = await db.execute(select(Profile).where(Profile.user_id == user.id))
    profile = profile_result.scalar_one_or_none()
    profile_json = json.dumps({
        "degree_level": profile.degree_level,
        "field_of_study": profile.field_of_study,
        "country_of_origin": profile.country_of_origin,
        "target_degree": profile.target_degree,
        "target_fields": profile.target_fields,
        "target_countries": profile.target_countries,
        "has_ielts": profile.has_ielts,
        "ielts_score": float(profile.ielts_score) if profile.ielts_score else None,
        "languages": profile.languages,
        "cgpa": float(profile.cgpa) if profile.cgpa else None,
    } if profile else {}, indent=2)

    # Get top 20 matched scholarships
    match_query = (
        select(Scholarship)
        .join(MatchScore, MatchScore.scholarship_id == Scholarship.id)
        .where(MatchScore.user_id == user.id)
        .order_by(MatchScore.score.desc())
        .limit(20)
    )
    match_result = await db.execute(match_query)
    scholarships = match_result.scalars().all()

    if not scholarships:
        # Fallback: get featured scholarships
        fallback_query = (
            select(Scholarship)
            .where(Scholarship.is_active == True, Scholarship.is_verified == True)
            .order_by(Scholarship.view_count.desc())
            .limit(20)
        )
        fallback_result = await db.execute(fallback_query)
        scholarships = fallback_result.scalars().all()

    scholarships_json = json.dumps([
        {
            "name": s.name,
            "slug": s.slug,
            "host_country": s.host_country,
            "provider": s.provider,
            "degree_levels": s.degree_levels,
            "fields_of_study": s.fields_of_study,
            "funding_type": s.funding_type,
            "deadline": str(s.deadline),
            "requires_ielts": s.requires_ielts,
            "official_url": s.official_url,
        }
        for s in scholarships
    ], indent=2)

    # Call ScholarBot
    try:
        assistant_reply = await get_scholarbot_response(
            message=msg.message,
            conversation_history=messages[:-1],  # Exclude the just-added user message
            profile_json=profile_json,
            scholarships_json=scholarships_json,
            anthropic_api_key=settings.anthropic_api_key,
        )
    except Exception as e:
        assistant_reply = f"I encountered an error: {str(e)}. Please try again."

    messages.append({
        "role": "assistant",
        "content": assistant_reply,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    session.messages = messages
    await db.commit()

    return {"reply": assistant_reply, "session_id": str(session_id)}
