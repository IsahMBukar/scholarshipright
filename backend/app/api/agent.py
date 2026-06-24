"""Agent API endpoints for Scholara AI advisor with streaming and tool calling."""
import json
import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified
from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime, timezone

from app.db.session import get_db
from app.models.profile import Profile
from app.models.resume import Resume
from app.models.scholarship import Scholarship
from app.models.match_score import MatchScore
from app.models.saved_scholarship import SavedScholarship
from app.models.chat_session import ChatSession
from app.api.users import get_current_user
from app.models.user import User
from app.services.agent import (
    check_eligibility,
    assess_readiness,
    generate_roadmap,
    discover_opportunities,
    generate_document,
    general_chat,
    stream_agent_response,
    call_agent_structured,
)
from app.services.scoring import calculate_level_aware_completeness
from app.core.rate_limit import agent_rate_limit
from app.core.config import get_settings
from app.services.agent_errors import (
    INTERNAL_ERROR,
    MATCHES_NOT_COMPUTED,
    PROFILE_MISSING,
    RESUME_MISSING,
    SCHOLARSHIP_NOT_FOUND,
    make as make_agent_error,
    user_message,
)

router = APIRouter()


# ── Request schemas ──────────────────────────────────────────────

class EligibilityRequest(BaseModel):
    scholarship_id: str


class ReadinessRequest(BaseModel):
    scholarship_id: Optional[str] = None


class RoadmapRequest(BaseModel):
    scholarship_id: str


class DiscoverRequest(BaseModel):
    query: str


class DocumentRequest(BaseModel):
    scholarship_id: str
    document_type: str
    additional_context: Optional[str] = ""


class AgentChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    action: Optional[str] = None
    scholarship_id: Optional[str] = None
    document_type: Optional[str] = None


# ── Helpers ──────────────────────────────────────────────────────

async def _get_user_context(db: AsyncSession, user: User) -> tuple[str, dict]:
    """Build user context JSON from profile + resume."""
    profile_result = await db.execute(select(Profile).where(Profile.user_id == user.id))
    profile = profile_result.scalar_one_or_none()

    resume_result = await db.execute(
        select(Resume).where(Resume.user_id == user.id, Resume.is_primary == True)
    )
    resume = resume_result.scalar_one_or_none()
    if not resume:
        resume_result = await db.execute(
            select(Resume).where(Resume.user_id == user.id).order_by(Resume.updated_at.desc())
        )
        resume = resume_result.scalars().first()

    profile_data = {
        "full_name": user.full_name,
        "email": user.email,
        "degree_level": profile.degree_level if profile else None,
        "field_of_study": profile.field_of_study if profile else None,
        "cgpa": float(profile.cgpa) if profile and profile.cgpa else None,
        "cgpa_scale": float(profile.cgpa_scale) if profile and profile.cgpa_scale else None,
        "country_of_origin": profile.country_of_origin if profile else None,
        "target_degree": profile.target_degree if profile else None,
        "target_fields": profile.target_fields if profile else [],
        "target_countries": profile.target_countries if profile else [],
        "has_ielts": profile.has_ielts if profile else False,
        "ielts_score": float(profile.ielts_score) if profile and profile.ielts_score else None,
        "work_experience_years": profile.work_experience_years if profile else 0,
        "research_interests": profile.research_interests if profile else [],
        "graduation_year": profile.graduation_year if profile else None,
        "university": profile.university if profile else None,
    } if profile else {"full_name": user.full_name, "email": user.email}

    resume_data = {}
    if resume:
        resume_dict = {
            "email": resume.email,
            "phone": resume.phone,
            "location": resume.location,
            "linkedin_url": resume.linkedin_url,
            "summary": resume.summary,
            "education": resume.education or [],
            "experience": resume.experience or [],
            "research_projects": resume.research_projects or [],
            "skills": resume.skills or [],
            "certifications": resume.certifications or [],
            "publications": resume.publications or [],
            "languages": resume.languages or [],
        }
        degree_level = profile.degree_level if profile else None
        la_result = calculate_level_aware_completeness(resume_dict, degree_level)
        overall = int(la_result["display_score"])
        section_scores: dict = {}
        for s in la_result["present_required"]:
            section_scores[s] = {"score": 1, "max": 1, "percentage": 100}
        for s in la_result["missing_required"]:
            section_scores[s] = {"score": 0, "max": 1, "percentage": 0}
        for s in la_result["present_bonus"]:
            section_scores[s] = {"score": 1, "max": 1, "percentage": 100}
        issues = [f"Missing {s.replace('_', ' ')}" for s in la_result["missing_required"]]

        resume_data = {
            "title": resume.title,
            "overall_score": resume.overall_score or overall,
            "grade": la_result["grade"],
            "section_scores": section_scores,
            "issues": issues,
            "summary": resume.summary,
            "education": resume.education or [],
            "experience": resume.experience or [],
            "research_projects": resume.research_projects or [],
            "skills": resume.skills or [],
            "certifications": resume.certifications or [],
            "publications": resume.publications or [],
            "languages": resume.languages or [],
            "awards": resume.awards or [],
            "ref_list": resume.ref_list or [],
        }

    profile_json = json.dumps(profile_data, indent=2, default=str)
    resume_json = json.dumps(resume_data, indent=2, default=str)
    return profile_json, resume_json, profile, resume


async def _get_scholarships_json(db: AsyncSession, user_id, limit: int = 50) -> str:
    """Get matched scholarships as JSON."""
    match_query = (
        select(Scholarship, MatchScore.score, MatchScore.breakdown)
        .join(MatchScore, MatchScore.scholarship_id == Scholarship.id)
        .where(MatchScore.user_id == user_id)
        .order_by(MatchScore.score.desc())
        .limit(limit)
    )
    result = await db.execute(match_query)
    rows = result.all()

    if not rows:
        fallback = select(Scholarship).where(
            Scholarship.is_active == True, Scholarship.is_verified == True
        ).order_by(Scholarship.view_count.desc()).limit(limit)
        fb_result = await db.execute(fallback)
        scholarships = fb_result.scalars().all()
        return json.dumps([_sch_to_dict(s) for s in scholarships], indent=2, default=str)

    return json.dumps([
        {**_sch_to_dict(sch), "match_score": float(score), "match_breakdown": breakdown}
        for sch, score, breakdown in rows
    ], indent=2, default=str)


def _sch_to_dict(s) -> dict:
    return {
        "id": str(s.id),
        "name": s.name,
        "slug": s.slug,
        "host_country": s.host_country,
        "host_institution": s.host_institution,
        "provider": s.provider,
        "degree_levels": s.degree_levels,
        "fields_of_study": s.fields_of_study,
        "eligible_nationalities": s.eligible_nationalities,
        "funding_type": s.funding_type,
        "covers_tuition": s.covers_tuition,
        "covers_living": s.covers_living,
        "monthly_stipend_usd": float(s.monthly_stipend_usd) if s.monthly_stipend_usd else None,
        "requires_ielts": s.requires_ielts,
        "min_ielts_score": float(s.min_ielts_score) if s.min_ielts_score else None,
        "min_cgpa": float(s.min_cgpa) if s.min_cgpa else None,
        "deadline": str(s.deadline) if s.deadline else None,
        "program_start_date": str(s.program_start_date) if s.program_start_date else None,
        "duration_months": s.duration_months,
        "description": s.description,
        "how_to_apply": s.how_to_apply,
        "official_url": s.official_url,
    }


async def _get_scholarship_by_id(db: AsyncSession, scholarship_id: str) -> str:
    """Get a single scholarship as JSON."""
    try:
        uid = UUID(scholarship_id)
        result = await db.execute(select(Scholarship).where(Scholarship.id == uid))
    except ValueError:
        result = await db.execute(select(Scholarship).where(Scholarship.slug == scholarship_id))
    sch = result.scalar_one_or_none()
    if not sch:
        raise HTTPException(status_code=404, detail="Scholarship not found")
    return json.dumps(_sch_to_dict(sch), indent=2, default=str)


async def _get_conversation_history(db: AsyncSession, session_id: UUID, user_id: UUID, limit: int = 20) -> list[dict]:
    """Load conversation history from chat session."""
    result = await db.execute(
        select(ChatSession).where(
            ChatSession.id == session_id,
            ChatSession.user_id == user_id,
        )
    )
    session = result.scalar_one_or_none()
    if not session or not session.messages:
        return []

    # Return last N messages (excluding timestamps for LLM)
    history = []
    for msg in session.messages[-limit:]:
        history.append({
            "role": msg["role"],
            "content": msg["content"],
        })
    return history


async def _save_to_session(db: AsyncSession, session_id: UUID, user_id: UUID, user_msg: str, assistant_msg: str):
    """Save user and assistant messages to chat session."""
    result = await db.execute(
        select(ChatSession).where(
            ChatSession.id == session_id,
            ChatSession.user_id == user_id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        return

    messages = list(session.messages or [])
    now = datetime.now(timezone.utc).isoformat()
    messages.append({"role": "user", "content": user_msg, "timestamp": now})
    messages.append({"role": "assistant", "content": assistant_msg, "timestamp": now})
    session.messages = messages
    flag_modified(session, "messages")
    await db.commit()


# ── Streaming endpoint ───────────────────────────────────────────

@router.post("/chat/stream", dependencies=[Depends(agent_rate_limit)])
async def api_agent_chat_stream(
    req: AgentChatRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Streaming agent chat with tool calling and reasoning chain."""
    # Load or create session
    session_id = None
    conversation_history = []

    if req.session_id:
        try:
            session_id = UUID(req.session_id)
            conversation_history = await _get_conversation_history(db, session_id, user.id)
        except ValueError:
            pass

    if not session_id:
        # Create a new session for this conversation
        session = ChatSession(user_id=user.id, messages=[])
        db.add(session)
        await db.commit()
        await db.refresh(session)
        session_id = session.id  # type: ignore[assignment]

    final_session_id = str(session_id)
    full_response = ""

    async def event_generator():
        nonlocal full_response
        try:
            async for event in stream_agent_response(
                message=req.message,
                conversation_history=conversation_history,
                db=db,
                user_id=user.id,
                action=req.action or "chat",
                scholarship_id=req.scholarship_id,
                document_type=req.document_type,
            ):
                if event["event"] == "token":
                    full_response += str(event["data"])
                elif event["event"] == "done" and not full_response:
                    full_response = json.dumps(event["data"], default=str)
                elif event["event"] == "error":
                    # Make sure an error always closes the stream cleanly.
                    if not full_response:
                        # Surface a friendly assistant message so the UI isn't blank.
                        err_payload = event["data"] if isinstance(event["data"], dict) else {"user_message": "Something went wrong."}
                        full_response = err_payload.get("user_message") or "I'm having trouble right now. Please try again."
                yield f"event: {event['event']}\ndata: {json.dumps(event['data'], default=str)}\n\n"
        except Exception as e:  # noqa: BLE001
            err = make_agent_error("stream_interrupted", technical=f"stream crashed: {str(e)[:160]}", log=False)
            yield f"event: error\ndata: {json.dumps(err.to_dict())}\n\n"
        finally:
            # Save conversation to session (if we have any assistant text).
            if full_response and session_id is not None:
                try:
                    await _save_to_session(db, session_id, user.id, req.message, full_response)
                except Exception as e:  # noqa: BLE001
                    # Never fail the stream just because session persistence failed.
                    print(f"chat session save failed: {e}")
            yield f"event: session\ndata: {json.dumps({'session_id': final_session_id})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
        },
    )


# ── Non-streaming endpoints (backward compat) ───────────────────

@router.post("/chat", dependencies=[Depends(agent_rate_limit)])
async def api_agent_chat(
    req: AgentChatRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Single-call agent chat/action endpoint with session memory."""
    session_id = None
    conversation_history = []
    if req.session_id:
        try:
            session_id = UUID(req.session_id)
            conversation_history = await _get_conversation_history(db, session_id, user.id)
        except ValueError:
            pass
    if not session_id:
        session = ChatSession(user_id=user.id, messages=[])
        db.add(session)
        await db.commit()
        await db.refresh(session)
        session_id = session.id  # type: ignore[assignment]

    try:
        result = await call_agent_structured(
            prompt=req.message,
            db=db,
            user_id=user.id,
            conversation_history=conversation_history,
            action=req.action or "chat",
            scholarship_id=req.scholarship_id,
            document_type=req.document_type,
        )
    except Exception as e:  # noqa: BLE001
        err = make_agent_error("internal_error", technical=str(e)[:200])
        return {"type": req.action or "chat", "error": True, **err.to_dict()}

    if session_id is not None:
        try:
            await _save_to_session(db, session_id, user.id, req.message, json.dumps(result, default=str))
        except Exception as e:  # noqa: BLE001
            print(f"chat session save failed: {e}")
        result["_session_id"] = str(session_id)

    return result


def _error_envelope(action: str, code: str, technical: str | None = None) -> dict:
    err = make_agent_error(code, technical=technical, log=False)
    return {"type": action, "error": True, **err.to_dict()}


@router.post("/eligibility", dependencies=[Depends(agent_rate_limit)])
async def api_eligibility(
    req: EligibilityRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Check eligibility for a specific scholarship."""
    try:
        profile_json, resume_json, profile, _ = await _get_user_context(db, user)
        if not profile:
            return _error_envelope("eligibility", PROFILE_MISSING)
        try:
            scholarship_json = await _get_scholarship_by_id(db, req.scholarship_id)
        except HTTPException as e:
            if e.status_code == 404:
                return _error_envelope("eligibility", SCHOLARSHIP_NOT_FOUND)
            raise
        scholarships_list = await _get_scholarships_json(db, user.id, limit=20)
        result = await check_eligibility(profile_json, resume_json, scholarship_json, scholarships_list)
        if isinstance(result, dict) and result.get("error"):
            return _error_envelope("eligibility", INTERNAL_ERROR, technical=str(result.get("user_message")))
        return result
    except Exception as e:  # noqa: BLE001
        return _error_envelope("eligibility", INTERNAL_ERROR, technical=str(e)[:200])


@router.post("/readiness", dependencies=[Depends(agent_rate_limit)])
async def api_readiness(
    req: ReadinessRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Assess application readiness."""
    try:
        profile_json, resume_json, profile, _ = await _get_user_context(db, user)
        if not profile:
            return _error_envelope("readiness", PROFILE_MISSING)
        scholarship_json = "{}"
        if req.scholarship_id:
            try:
                scholarship_json = await _get_scholarship_by_id(db, req.scholarship_id)
            except HTTPException as e:
                if e.status_code == 404:
                    return _error_envelope("readiness", SCHOLARSHIP_NOT_FOUND)
                raise
        scholarships_list = await _get_scholarships_json(db, user.id, limit=20)
        result = await assess_readiness(profile_json, resume_json, scholarship_json, scholarships_list)
        if isinstance(result, dict) and result.get("error"):
            return _error_envelope("readiness", INTERNAL_ERROR, technical=str(result.get("user_message")))
        return result
    except Exception as e:  # noqa: BLE001
        return _error_envelope("readiness", INTERNAL_ERROR, technical=str(e)[:200])


@router.post("/roadmap", dependencies=[Depends(agent_rate_limit)])
async def api_roadmap(
    req: RoadmapRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate career roadmap for eligibility."""
    try:
        profile_json, resume_json, profile, _ = await _get_user_context(db, user)
        if not profile:
            return _error_envelope("roadmap", PROFILE_MISSING)
        try:
            scholarship_json = await _get_scholarship_by_id(db, req.scholarship_id)
        except HTTPException as e:
            if e.status_code == 404:
                return _error_envelope("roadmap", SCHOLARSHIP_NOT_FOUND)
            raise
        scholarships_list = await _get_scholarships_json(db, user.id, limit=20)
        result = await generate_roadmap(profile_json, resume_json, scholarship_json, scholarships_list)
        if isinstance(result, dict) and result.get("error"):
            return _error_envelope("roadmap", INTERNAL_ERROR, technical=str(result.get("user_message")))
        return result
    except Exception as e:  # noqa: BLE001
        return _error_envelope("roadmap", INTERNAL_ERROR, technical=str(e)[:200])


@router.post("/discover", dependencies=[Depends(agent_rate_limit)])
async def api_discover(
    req: DiscoverRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Smart opportunity discovery."""
    try:
        profile_json, resume_json, profile, _ = await _get_user_context(db, user)
        if not profile:
            return _error_envelope("discover", PROFILE_MISSING)
        scholarships_list = await _get_scholarships_json(db, user.id, limit=50)
        result = await discover_opportunities(profile_json, resume_json, req.query, scholarships_list)
        if isinstance(result, dict) and result.get("error"):
            return _error_envelope("discover", INTERNAL_ERROR, technical=str(result.get("user_message")))
        return result
    except Exception as e:  # noqa: BLE001
        return _error_envelope("discover", INTERNAL_ERROR, technical=str(e)[:200])


@router.post("/generate", dependencies=[Depends(agent_rate_limit)])
async def api_generate(
    req: DocumentRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate application documents."""
    try:
        profile_json, resume_json, profile, _ = await _get_user_context(db, user)
        if not profile:
            return _error_envelope("document", PROFILE_MISSING)
        try:
            scholarship_json = await _get_scholarship_by_id(db, req.scholarship_id)
        except HTTPException as e:
            if e.status_code == 404:
                return _error_envelope("document", SCHOLARSHIP_NOT_FOUND)
            raise
        result = await generate_document(profile_json, resume_json, scholarship_json, req.document_type, req.additional_context)
        if isinstance(result, dict) and result.get("error"):
            return _error_envelope("document", INTERNAL_ERROR, technical=str(result.get("user_message")))
        return result
    except Exception as e:  # noqa: BLE001
        return _error_envelope("document", INTERNAL_ERROR, technical=str(e)[:200])


@router.get("/context")
async def api_agent_context(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get user context for the agent sidebar."""
    profile_json, resume_json, profile, resume = await _get_user_context(db, user)
    scholarships_list = await _get_scholarships_json(db, user.id, limit=10)

    saved_result = await db.execute(
        select(SavedScholarship).where(SavedScholarship.user_id == user.id)
    )
    saved = saved_result.scalars().all()
    saved_map = {}
    for s in saved:
        saved_map[str(s.scholarship_id)] = s.status

    top_matches = json.loads(scholarships_list)[:10]

    resume_score = 0
    if resume:
        score_data = calculate_level_aware_completeness({
            "email": resume.email, "phone": resume.phone, "location": resume.location,
            "linkedin_url": resume.linkedin_url, "summary": resume.summary,
            "education": resume.education or [], "experience": resume.experience or [],
            "research_projects": resume.research_projects or [], "skills": resume.skills or [],
            "certifications": resume.certifications or [], "publications": resume.publications or [],
            "languages": resume.languages or [],
        }, profile.degree_level if profile else None)
        resume_score = int(score_data["display_score"])

    return {
        "profile": {
            "name": user.full_name,
            "degree": profile.degree_level if profile else None,
            "field": profile.field_of_study if profile else None,
            "country": profile.country_of_origin if profile else None,
            "target_degree": profile.target_degree if profile else None,
            "has_ielts": profile.has_ielts if profile else False,
            "ielts_score": float(profile.ielts_score) if profile and profile.ielts_score else None,
        },
        "resume": {
            "has_resume": resume is not None,
            "score": resume_score,
            "title": resume.title if resume else None,
        },
        "top_matches": top_matches,
        "saved_statuses": saved_map,
    }


# ── Session management ───────────────────────────────────────────

@router.get("/sessions")
async def list_agent_sessions(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List chat sessions for the agent."""
    result = await db.execute(
        select(ChatSession)
        .where(ChatSession.user_id == user.id)
        .order_by(ChatSession.updated_at.desc())
        .limit(20)
    )
    sessions = result.scalars().all()
    return [
        {
            "id": str(s.id),
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "updated_at": s.updated_at.isoformat() if s.updated_at else None,
            "message_count": len(s.messages) if s.messages else 0,
            "last_message": s.messages[-1]["content"][:100] if s.messages else None,
        }
        for s in sessions
    ]


@router.get("/health")
async def agent_health(
    user: User = Depends(get_current_user),
):
    """Ping the configured LLM provider and report whether it responds.

    Does not expose the API key. Returns HTTP 200 with a diagnostic payload
    so operators can verify their LLM_BASE_URL / LLM_API_KEY / LLM_MODEL
    configuration by hitting one endpoint.
    """
    from app.services.agent import _is_llm_configured

    if not _is_llm_configured():
        return {
            "configured": False,
            "reachable": False,
            "error": "LLM_API_KEY not configured",
        }

    settings = get_settings()
    base_url = settings.resolved_llm_base_url.rstrip("/")
    model = settings.resolved_llm_model

    payload = {
        "configured": True,
        "base_url": base_url,
        "model": model,
        "reachable": False,
        "provider_status": None,
        "error": None,
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                f"{base_url}/chat/completions",
                headers={"Authorization": f"Bearer {settings.resolved_llm_api_key}"},
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": "You are a health-check bot."},
                        {"role": "user", "content": "Reply with exactly: ok"},
                    ],
                    "max_tokens": 10,
                    "temperature": 0.0,
                },
            )
            payload["provider_status"] = resp.status_code
            if resp.status_code == 200:
                payload["reachable"] = True
            else:
                body = resp.text[:200]
                payload["error"] = f"HTTP {resp.status_code}: {body}"
    except Exception as e:  # noqa: BLE001
        payload["error"] = f"{type(e).__name__}: {str(e)[:200]}"

    return payload
