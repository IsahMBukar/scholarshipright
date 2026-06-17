"""
Scholara Agent Tools — Database tools the AI agent can call.

Each tool has:
- name: identifier
- description: what it does (shown to LLM)
- parameters: JSON Schema for arguments
- execute: async function that runs the query
"""
import json
from typing import Any, Callable, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func
from uuid import UUID


# ── Tool Registry ────────────────────────────────────────────────

TOOLS: list[dict] = []


def tool(name: str, description: str, parameters: dict):
    """Decorator to register a tool."""
    def decorator(fn: Callable):
        TOOLS.append({
            "name": name,
            "description": description,
            "parameters": parameters,
            "execute": fn,
        })
        return fn
    return decorator


# ── Tool Definitions ─────────────────────────────────────────────

@tool(
    name="get_user_profile",
    description="Get the current user's full academic profile including degree, CGPA, field of study, target preferences, IELTS score, and research interests.",
    parameters={
        "type": "object",
        "properties": {},
        "required": [],
    },
)
async def get_user_profile(db: AsyncSession, user_id: UUID, **kwargs) -> dict:
    from app.models.profile import Profile
    from app.models.user import User

    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        return {"error": "User not found"}

    profile_result = await db.execute(select(Profile).where(Profile.user_id == user_id))
    profile = profile_result.scalar_one_or_none()

    data = {
        "full_name": user.full_name,
        "email": user.email,
    }
    if profile:
        data.update({
            "degree_level": profile.degree_level,
            "cgpa": float(profile.cgpa) if profile.cgpa else None,
            "cgpa_scale": float(profile.cgpa_scale) if profile.cgpa_scale else None,
            "field_of_study": profile.field_of_study,
            "graduation_year": profile.graduation_year,
            "university": profile.university,
            "country_of_origin": profile.country_of_origin,
            "research_interests": profile.research_interests or [],
            "work_experience_years": profile.work_experience_years,
            "target_degree": profile.target_degree,
            "target_fields": profile.target_fields or [],
            "target_countries": profile.target_countries or [],
            "has_ielts": profile.has_ielts,
            "ielts_score": float(profile.ielts_score) if profile.ielts_score else None,
        })
    return data


@tool(
    name="get_user_resume",
    description="Get the user's primary resume/CV data including education, experience, skills, publications, certifications, and AI analysis scores.",
    parameters={
        "type": "object",
        "properties": {},
        "required": [],
    },
)
async def get_user_resume(db: AsyncSession, user_id: UUID, **kwargs) -> dict:
    from app.models.resume import Resume

    result = await db.execute(
        select(Resume).where(Resume.user_id == user_id, Resume.is_primary == True)
    )
    resume = result.scalar_one_or_none()
    if not resume:
        result = await db.execute(
            select(Resume).where(Resume.user_id == user_id).order_by(Resume.updated_at.desc())
        )
        resume = result.scalars().first()
    if not resume:
        return {"ok": False, "error": "No resume found. User needs to upload a resume.", "empty": True}

    return {
        "ok": True,
        "title": resume.title,
        "overall_score": resume.overall_score,
        "section_scores": resume.section_scores or {},
        "summary": resume.summary,
        "education": resume.education or [],
        "experience": resume.experience or [],
        "skills": resume.skills or [],
        "research_projects": resume.research_projects or [],
        "publications": resume.publications or [],
        "certifications": resume.certifications or [],
        "languages": resume.languages or [],
        "awards": resume.awards or [],
        "issues": resume.issues or [],
    }


@tool(
    name="search_scholarships",
    description="Search scholarships by keyword, country, degree level, field of study, or funding type. Returns matching scholarships with details.",
    parameters={
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Search keyword (matches name, description, provider)",
            },
            "country": {
                "type": "string",
                "description": "Filter by host country",
            },
            "degree_level": {
                "type": "string",
                "description": "Filter by degree level (e.g., Masters, PhD, Bachelors)",
            },
            "field_of_study": {
                "type": "string",
                "description": "Filter by field of study",
            },
            "funding_type": {
                "type": "string",
                "description": "Filter by funding type (fully_funded, partial, tuition_only)",
            },
            "limit": {
                "type": "integer",
                "description": "Max results to return (default 10)",
            },
        },
        "required": [],
    },
)
async def search_scholarships(
    db: AsyncSession,
    user_id: UUID,
    query: str = "",
    country: str = "",
    degree_level: str = "",
    field_of_study: str = "",
    funding_type: str = "",
    limit: int = 10,
    **kwargs,
) -> dict:
    from app.models.scholarship import Scholarship

    stmt = select(Scholarship).where(Scholarship.is_active == True, Scholarship.is_verified == True)

    if query:
        search = f"%{query}%"
        stmt = stmt.where(
            or_(
                Scholarship.name.ilike(search),
                Scholarship.description.ilike(search),
                Scholarship.provider.ilike(search),
            )
        )
    if country:
        stmt = stmt.where(Scholarship.host_country.ilike(f"%{country}%"))
    if degree_level:
        stmt = stmt.where(Scholarship.degree_levels.any(degree_level))
    if field_of_study:
        stmt = stmt.where(Scholarship.fields_of_study.any(field_of_study))
    if funding_type:
        stmt = stmt.where(Scholarship.funding_type == funding_type)

    stmt = stmt.order_by(Scholarship.view_count.desc()).limit(limit)
    result = await db.execute(stmt)
    scholarships = result.scalars().all()

    return {
        "count": len(scholarships),
        "scholarships": [
            {
                "id": str(s.id),
                "name": s.name,
                "slug": s.slug,
                "host_country": s.host_country,
                "provider": s.provider,
                "degree_levels": s.degree_levels,
                "fields_of_study": s.fields_of_study,
                "funding_type": s.funding_type,
                "covers_tuition": s.covers_tuition,
                "covers_living": s.covers_living,
                "monthly_stipend_usd": s.monthly_stipend_usd,
                "requires_ielts": s.requires_ielts,
                "min_ielts_score": float(s.min_ielts_score) if s.min_ielts_score else None,
                "min_cgpa": float(s.min_cgpa) if s.min_cgpa else None,
                "deadline": str(s.deadline) if s.deadline else None,
                "description": (s.description[:300] + "...") if s.description and len(s.description) > 300 else s.description,
                "official_url": s.official_url,
            }
            for s in scholarships
        ],
    }


@tool(
    name="get_scholarship_detail",
    description="Get full details of a specific scholarship by its ID or slug.",
    parameters={
        "type": "object",
        "properties": {
            "scholarship_id": {
                "type": "string",
                "description": "Scholarship UUID or slug",
            },
        },
        "required": ["scholarship_id"],
    },
)
async def get_scholarship_detail(db: AsyncSession, user_id: UUID, scholarship_id: str = "", **kwargs) -> dict:
    from app.models.scholarship import Scholarship

    try:
        uid = UUID(scholarship_id)
        result = await db.execute(select(Scholarship).where(Scholarship.id == uid))
    except ValueError:
        result = await db.execute(select(Scholarship).where(Scholarship.slug == scholarship_id))

    sch = result.scalar_one_or_none()
    if not sch:
        return {"error": "Scholarship not found"}

    return {
        "id": str(sch.id),
        "name": sch.name,
        "slug": sch.slug,
        "host_country": sch.host_country,
        "host_institution": sch.host_institution,
        "provider": sch.provider,
        "degree_levels": sch.degree_levels,
        "fields_of_study": sch.fields_of_study,
        "eligible_nationalities": sch.eligible_nationalities,
        "funding_type": sch.funding_type,
        "covers_tuition": sch.covers_tuition,
        "covers_living": sch.covers_living,
        "covers_flight": sch.covers_flight,
        "covers_health": sch.covers_health,
        "monthly_stipend_usd": sch.monthly_stipend_usd,
        "requires_ielts": sch.requires_ielts,
        "min_ielts_score": float(sch.min_ielts_score) if sch.min_ielts_score else None,
        "min_cgpa": float(sch.min_cgpa) if sch.min_cgpa else None,
        "requires_gre": sch.requires_gre,
        "language_of_instruction": sch.language_of_instruction,
        "deadline": str(sch.deadline) if sch.deadline else None,
        "program_start_date": str(sch.program_start_date) if sch.program_start_date else None,
        "duration_months": sch.duration_months,
        "description": sch.description,
        "benefits_summary": sch.benefits_summary,
        "how_to_apply": sch.how_to_apply,
        "official_url": sch.official_url,
    }


@tool(
    name="get_user_matches",
    description="Get the user's top matched scholarships ranked by match score. Returns scores and breakdown of why each scholarship matches.",
    parameters={
        "type": "object",
        "properties": {
            "limit": {
                "type": "integer",
                "description": "Number of top matches to return (default 10)",
            },
        },
        "required": [],
    },
)
async def get_user_matches(db: AsyncSession, user_id: UUID, limit: int = 10, **kwargs) -> dict:
    from app.models.scholarship import Scholarship
    from app.models.match_score import MatchScore

    query = (
        select(Scholarship, MatchScore.score, MatchScore.breakdown)
        .join(MatchScore, MatchScore.scholarship_id == Scholarship.id)
        .where(MatchScore.user_id == user_id)
        .order_by(MatchScore.score.desc())
        .limit(limit)
    )
    result = await db.execute(query)
    rows = result.all()

    if not rows:
        return {"count": 0, "matches": [], "message": "No matches computed yet. Ask the user to compute matches first."}

    return {
        "count": len(rows),
        "matches": [
            {
                "name": sch.name,
                "slug": sch.slug,
                "host_country": sch.host_country,
                "provider": sch.provider,
                "match_score": float(score),
                "breakdown": breakdown,
                "deadline": str(sch.deadline) if sch.deadline else None,
                "funding_type": sch.funding_type,
            }
            for sch, score, breakdown in rows
        ],
    }


@tool(
    name="get_saved_scholarships",
    description="Get the user's saved/bookmarked scholarships and their application status.",
    parameters={
        "type": "object",
        "properties": {},
        "required": [],
    },
)
async def get_saved_scholarships(db: AsyncSession, user_id: UUID, **kwargs) -> dict:
    from app.models.saved_scholarship import SavedScholarship
    from app.models.scholarship import Scholarship

    query = (
        select(Scholarship, SavedScholarship.status, SavedScholarship.notes, SavedScholarship.reminder_enabled)
        .join(SavedScholarship, SavedScholarship.scholarship_id == Scholarship.id)
        .where(SavedScholarship.user_id == user_id)
        .order_by(SavedScholarship.updated_at.desc())
    )
    result = await db.execute(query)
    rows = result.all()

    return {
        "count": len(rows),
        "saved": [
            {
                "name": sch.name,
                "slug": sch.slug,
                "host_country": sch.host_country,
                "status": status,
                "notes": notes,
                "reminder_enabled": reminder_enabled,
                "deadline": str(sch.deadline) if sch.deadline else None,
            }
            for sch, status, notes, reminder_enabled in rows
        ],
    }


# ── Tool Executor ────────────────────────────────────────────────

TOOL_MAP = {t["name"]: t for t in TOOLS}


async def execute_tool(name: str, arguments: dict, db: AsyncSession, user_id: UUID) -> dict:
    """Execute a registered tool by name.

    Success results are returned with an `ok: True` marker so downstream
    consumers (the agent service, the LLM prompt) can tell success from
    structured-empty/failure. Tools that need to surface business errors
    should return `{"ok": False, "error": "..."}`.
    """
    if name not in TOOL_MAP:
        return {"ok": False, "error": f"Unknown tool: {name}. Available: {list(TOOL_MAP.keys())}"}

    tool_def = TOOL_MAP[name]
    try:
        result = await tool_def["execute"](db=db, user_id=user_id, **arguments)
        if isinstance(result, dict) and "ok" not in result:
            result = {**result, "ok": True}
        return result
    except Exception as e:
        return {"ok": False, "error": f"Tool '{name}' failed: {str(e)}"}


def get_tool_definitions() -> list[dict]:
    """Return tool definitions in OpenAI function-calling format."""
    return [
        {
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t["description"],
                "parameters": t["parameters"],
            },
        }
        for t in TOOLS
    ]


def get_tool_names() -> list[str]:
    return [t["name"] for t in TOOLS]
