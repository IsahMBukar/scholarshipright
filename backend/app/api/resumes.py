import os
import uuid as uuid_lib
from uuid import UUID
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks, Body
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from typing import Optional, List
import json
import asyncio
import logging

from app.db.session import get_db, AsyncSessionLocal
from app.models.resume import Resume
from app.models.user import User
from app.models.profile import Profile
from app.schemas.resume import ResumeOut, ResumeUpdate
from app.services.resume_analyzer import extract_text_from_file, analyze_resume, rewrite_field
from app.services.resume_builder import SECTION_QUESTIONS, SECTION_ORDER, generate_section, generate_summary, suggest_content, polish_resume
from app.services.scoring import calculate_level_aware_completeness
from app.services.notifications import emit_resume_failed
from app.api.users import get_current_user
from app.core.rate_limit import resume_analysis_rate_limit, resume_rewrite_rate_limit, resume_upload_rate_limit
from app.core.upload_validation import validate_resume_upload
from app.services.match_auto import (
    REASON_RESUME_CREATED,
    REASON_RESUME_DELETED,
    REASON_RESUME_PRIMARY_CHANGED,
    REASON_RESUME_UPDATED,
    clear_user_matches,
    trigger_recompute,
)

router = APIRouter(prefix="/api/resumes", tags=["resumes"])

# Module logger for the backend "resume" subsystem. Background-analysis
# progress, errors, and timing diagnostics route here instead of stdout
# so that resume IDs and status transitions never appear in process
# stdout (which is often captured to log aggregators and shipped to
# observability backends).
logger = logging.getLogger(__name__)

UPLOAD_DIR = "/home/alaiisah/Desktop/Scholarshipright/backend/uploads/resumes"
os.makedirs(UPLOAD_DIR, exist_ok=True)


# ─── Level-aware completeness helpers ──────────────────────────────────────
#
# `level_aware_completeness` is NOT a column on the Resume model — it's
# computed at response time from the resume's section data combined with
# the user's profile.degree_level (which lives in the Profile table).
# These two helpers keep the wiring out of every endpoint body.

async def _get_user_degree_level(db: AsyncSession, user_id: Any) -> str | None:
    """Fetch the user's profile.degree_level (or None if no profile yet)."""
    result = await db.execute(
        select(Profile.degree_level).where(Profile.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def _user_degree_level(db: AsyncSession, user: User) -> str | None:
    """Convenience wrapper for the common `user.id` case."""
    return await _get_user_degree_level(db, user.id)


def _resume_to_dict(resume: Resume) -> dict:
    """Flatten the Resume ORM's columns into a dict for the scorer."""
    return {c.name: getattr(resume, c.name, None) for c in Resume.__table__.columns}


def _score_resume_level_aware(resume_dict: dict, degree_level: str | None) -> dict:
    """Score a resume using the level-aware engine and return the legacy
    shape callers expect: {overall_score, section_scores, issues, grade}.
    """
    result = calculate_level_aware_completeness(resume_dict, degree_level)
    overall = int(result["display_score"])

    # Build per-section scores from the level-aware result.
    section_scores: dict[str, dict] = {}
    for s in result["present_required"]:
        section_scores[s] = {"score": 1, "max": 1, "percentage": 100}
    for s in result["missing_required"]:
        section_scores[s] = {"score": 0, "max": 1, "percentage": 0}
    for s in result["present_bonus"]:
        section_scores[s] = {"score": 1, "max": 1, "percentage": 100}

    # Derive issues from missing required sections.
    issues = [f"Missing {s.replace('_', ' ')}" for s in result["missing_required"]]

    return {
        "overall_score": overall,
        "section_scores": section_scores,
        "issues": issues,
        "grade": result["grade"],
    }


async def _get_degree_level_by_user_id(db: AsyncSession, user_id) -> str | None:
    """Get degree_level from profile by user_id (for background tasks)."""
    from uuid import UUID as _UUID
    uid = user_id if isinstance(user_id, _UUID) else _UUID(str(user_id))
    prof_result = await db.execute(select(Profile.degree_level).where(Profile.user_id == uid))
    row = prof_result.first()
    return row[0] if row else None


def _attach_level_aware_completeness(
    out: ResumeOut, resume: Resume, degree_level: str | None
) -> ResumeOut:
    """Mutate `out` to include the level_aware_completeness payload."""
    out.level_aware_completeness = calculate_level_aware_completeness(
        _resume_to_dict(resume), degree_level
    )
    return out


async def _serialize_resume(resume: Resume, user: Any, db: AsyncSession) -> ResumeOut:
    """Build a `ResumeOut` from an ORM model, attaching the
    level-aware completeness computed from the user's profile.degree_level.

    Use this in every endpoint that returns a single ResumeOut.
    """
    out = ResumeOut.model_validate(resume)
    degree_level = await _user_degree_level(db, user)
    return _attach_level_aware_completeness(out, resume, degree_level)


@router.get("", response_model=List[ResumeOut])
async def list_resumes(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Resume).where(Resume.user_id == user.id).order_by(Resume.is_primary.desc(), Resume.updated_at.desc())
    )
    resumes = result.scalars().all()
    degree_level = await _user_degree_level(db, user)
    return [
        _attach_level_aware_completeness(ResumeOut.model_validate(r), r, degree_level)
        for r in resumes
    ]


@router.get("/{resume_id}", response_model=ResumeOut)
async def get_resume(resume_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Resume).where(Resume.id == resume_id, Resume.user_id == user.id)
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(404, "Resume not found")
    return await _serialize_resume(resume, user, db)


@router.post("", response_model=ResumeOut, dependencies=[Depends(resume_upload_rate_limit)])
async def create_resume(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: str = Form("My Resume"),
    target_fields: str = Form("[]"),
    target_degree: str = Form(""),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Upload a CV file, create resume, and trigger AI analysis in background."""
    
    # Read and validate file content before saving anything to disk/DB.
    content = await file.read()
    validated = validate_resume_upload(file, content)
    mime_type = validated.mime_type
    filename = validated.filename
    
    # Save file using a generated name and validated extension only.
    file_id = str(uuid_lib.uuid4())
    saved_path = os.path.join(UPLOAD_DIR, f"{file_id}{validated.extension}")
    with open(saved_path, "wb") as f:
        f.write(content)
    
    # Parse target_fields
    try:
        fields_list = json.loads(target_fields) if target_fields else []
    except (json.JSONDecodeError, TypeError):
        fields_list = [f.strip() for f in target_fields.split(",") if f.strip()]
    
    # Create resume record
    resume = Resume(
        user_id=user.id,
        title=title,
        target_fields=fields_list,
        target_degree=target_degree or None,
        original_filename=filename,
        original_file_url=saved_path,
        original_mime_type=mime_type,
        status="analyzing",
    )
    
    # If first resume, make it primary
    existing = await db.execute(select(Resume).where(Resume.user_id == user.id))
    if not existing.scalars().first():
        resume.is_primary = True
    
    db.add(resume)
    await db.commit()
    await db.refresh(resume)
    
    resume_id = str(resume.id)

    # Schedule AI analysis in background — returns immediately
    background_tasks.add_task(
        _run_analysis, resume_id, content, mime_type, filename, fields_list, target_degree
    )

    # Resume creation adds a primary-source-of-truth for the match engine.
    # Recompute in the background; the next /api/matches call will wait if needed.
    trigger_recompute(user.id, REASON_RESUME_CREATED, background_tasks)

    return await _serialize_resume(resume, user, db)


# ── Manual path: create a stub resume with no file ──────────────
#
# Users who don't have a resume to upload need a resume record anyway,
# because the profile page's edit modals (Education, Work Experience,
# Skills, etc.) all read/write through the resumes table via PATCH
# /api/resumes/{id}. This endpoint creates a "manual" stub so the
# existing UI works for users filling in details by hand.
#
# Idempotent: if the user already has a manual resume, return it instead
# of creating a duplicate.
@router.post("/manual", response_model=ResumeOut)
async def create_manual_resume(
    body: dict = Body(default={}),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create an empty resume record for manual entry (no file upload).

    Returns the existing manual resume if one already exists,
    unless body contains { "force_new": true } which always creates
    a brand-new record (optionally prefilling from the primary resume).
    """
    force_new = body.get("force_new", False)
    prefill = body.get("prefill_from_primary", True)

    if not force_new:
        # Look for an existing manual resume
        existing_q = await db.execute(
            select(Resume).where(
                Resume.user_id == user.id,
                Resume.status == "manual",
            )
        )
        existing = existing_q.scalars().first()
        if existing:
            return existing

    resume = Resume(
        user_id=user.id,
        title="Untitled Resume" if force_new else "My Profile",
        target_fields=[],
        target_degree=None,
        original_filename=None,
        original_file_url=None,
        original_mime_type=None,
        status="manual",
    )
    if force_new:
        resume.is_primary = False

    # Prefill section data from the user's primary resume (force_new mode).
    if force_new and prefill:
        primary_q = await db.execute(
            select(Resume).where(
                Resume.user_id == user.id,
                Resume.is_primary == True,
            )
        )
        primary = primary_q.scalars().first()
        if primary:
            resume.full_name = primary.full_name
            resume.email = primary.email
            resume.phone = primary.phone
            resume.location = primary.location
            resume.linkedin_url = primary.linkedin_url
            resume.portfolio_url = primary.portfolio_url
            resume.summary = primary.summary
            resume.education = primary.education
            resume.experience = primary.experience
            resume.projects = primary.projects
            resume.research_projects = primary.research_projects
            resume.skills = primary.skills
            resume.certifications = primary.certifications
            resume.publications = primary.publications
            resume.awards = primary.awards
            resume.languages = primary.languages
            resume.ref_list = primary.ref_list
            resume.style = primary.style
            resume.title = f"{primary.title} (copy)" if primary.title else "Untitled Resume"

    # If first resume, make it primary so the profile page uses it.
    any_existing = (await db.execute(
        select(Resume).where(Resume.user_id == user.id)
    )).scalars().first()
    if not any_existing:
        resume.is_primary = True

    db.add(resume)
    await db.commit()
    await db.refresh(resume)

    # New primary source → recompute (the profile fields the user fills
    # in by hand will be the source of truth until they upload a real CV).
    trigger_recompute(user.id, REASON_RESUME_CREATED, BackgroundTasks())

    return await _serialize_resume(resume, user, db)



async def _run_analysis(resume_id: str, content: bytes, mime_type: str, filename: str, fields_list: list, target_degree: str):
    """Background task: extract text, run AI analysis, update resume."""
    try:
        raw_text = await asyncio.wait_for(
            extract_text_from_file(content, mime_type, filename),
            timeout=180,
        )
        # Sanitize
        if raw_text:
            raw_text = raw_text.replace('\x00', '').encode('utf-8', errors='ignore').decode('utf-8')
        
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Resume).where(Resume.id == resume_id))
            resume = result.scalar_one_or_none()
            if not resume:
                logger.warning("Background analysis: resume %s not found", resume_id)
                return
            
            resume.raw_text = raw_text[:20000] if raw_text else None
            
            if raw_text and len(raw_text.strip()) > 20:
                analysis = await asyncio.wait_for(
                    analyze_resume(raw_text, fields_list, target_degree),
                    timeout=120,
                )
                
                resume.full_name = analysis.get("full_name", "")
                resume.email = analysis.get("email", "")
                resume.phone = analysis.get("phone", "")
                resume.location = analysis.get("location", "")
                resume.linkedin_url = analysis.get("linkedin_url", "")
                resume.portfolio_url = analysis.get("portfolio_url", "")
                resume.summary = analysis.get("summary", "")
                resume.education = analysis.get("education", [])
                resume.experience = analysis.get("experience", [])
                resume.skills = analysis.get("skills", [])
                resume.certifications = analysis.get("certifications", [])
                resume.publications = analysis.get("publications", [])
                resume.languages = analysis.get("languages", [])
                resume.research_projects = analysis.get("research_projects", [])
                resume.awards = analysis.get("awards", [])
                resume.ref_list = analysis.get("ref_list", [])
                # Issues will come from deterministic scorer below
                resume.ai_suggestions = analysis.get("ai_suggestions", "")
                resume.status = "completed"
                
                # Calculate level-aware score
                resume_dict = {
                    "email": resume.email, "phone": resume.phone, "location": resume.location,
                    "linkedin_url": resume.linkedin_url, "summary": resume.summary,
                    "education": resume.education or [], "experience": resume.experience or [],
                    "research_projects": resume.research_projects or [], "skills": resume.skills or [],
                    "certifications": resume.certifications or [], "publications": resume.publications or [],
                    "languages": resume.languages or [],
                }
                degree_level = await _get_degree_level_by_user_id(db, resume.user_id)
                score_result = _score_resume_level_aware(resume_dict, degree_level)
                resume.overall_score = score_result["overall_score"]
                resume.section_scores = score_result["section_scores"]
                # Convert flat issues list to structured format with severity
                resume.issues = [
                    {"field": "general", "severity": "likely", "message": issue}
                    for issue in score_result["issues"]
                ]
            else:
                resume.status = "error"
                resume.issues = [{"field": "file", "severity": "urgent", "message": "Could not extract text from file. Try a clearer image or PDF.", "suggestion": "Re-upload or paste text manually."}]
                # No text extracted — the AI is unlikely to recover, so notify the user.
                await emit_resume_failed(
                    db,
                    user_id=resume.user_id,
                    resume_id=resume.id,
                    reason="We couldn't read the file.",
                )

            await db.commit()
            logger.info(
                "Background analysis complete for resume %s: status=%s",
                resume_id,
                resume.status,
            )
    except asyncio.TimeoutError:
        logger.warning("Background analysis timed out for resume %s", resume_id)
        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(select(Resume).where(Resume.id == resume_id))
                resume = result.scalar_one_or_none()
                if resume:
                    resume.status = "error"
                    resume.issues = [{"field": "general", "severity": "urgent", "message": "AI analysis timed out before completion.", "suggestion": "Try a smaller/clearer file or re-run analysis later."}]
                    await emit_resume_failed(
                        db,
                        user_id=resume.user_id,
                        resume_id=resume.id,
                        reason="AI analysis timed out.",
                    )
                    await db.commit()
        except Exception:
            pass
    except Exception as e:
        logger.exception("Background analysis error for resume %s: %s", resume_id, e)
        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(select(Resume).where(Resume.id == resume_id))
                resume = result.scalar_one_or_none()
                if resume:
                    resume.status = "error"
                    resume.issues = [{"field": "general", "severity": "urgent", "message": "Analysis failed. Please try again or paste your CV text.", "suggestion": "Try again or paste your CV text."}]
                    await emit_resume_failed(
                        db,
                        user_id=resume.user_id,
                        resume_id=resume.id,
                        reason="Analysis failed",
                    )
                    await db.commit()
        except:
            pass


@router.put("/{resume_id}", response_model=ResumeOut)
async def update_resume(resume_id: str, data: ResumeUpdate, background_tasks: BackgroundTasks, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Resume).where(Resume.id == resume_id, Resume.user_id == user.id)
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(404, "Resume not found")

    update_data = data.model_dump(exclude_unset=True)

    # Handle setting primary
    is_becoming_primary = update_data.get("is_primary") is True

    # Handle setting primary
    if is_becoming_primary:
        # Clear other primaries
        await db.execute(
            update(Resume).where(Resume.user_id == user.id, Resume.id != resume_id).values(is_primary=False)
        )

    for key, value in update_data.items():
        setattr(resume, key, value)

    # Recalculate score on save (level-aware)
    resume_dict = {
        "email": resume.email, "phone": resume.phone, "location": resume.location,
        "linkedin_url": resume.linkedin_url, "summary": resume.summary,
        "education": resume.education or [], "experience": resume.experience or [],
        "research_projects": resume.research_projects or [], "skills": resume.skills or [],
        "certifications": resume.certifications or [], "publications": resume.publications or [],
        "languages": resume.languages or [],
    }
    degree_level = await _user_degree_level(db, user)
    score_result = _score_resume_level_aware(resume_dict, degree_level)
    resume.overall_score = score_result["overall_score"]
    resume.section_scores = score_result["section_scores"]
    resume.issues = [
        {"field": "general", "severity": "likely", "message": issue}
        for issue in score_result["issues"]
    ]

    await db.commit()
    await db.refresh(resume)

    # Resume fields feed the match engine — but only recompute if the user
    # actually changed something the engine reads, or if they switched which
    # resume is primary. The `is_becoming_primary` change is the most
    # important trigger here.
    reason = REASON_RESUME_PRIMARY_CHANGED if is_becoming_primary else REASON_RESUME_UPDATED
    trigger_recompute(user.id, reason, background_tasks)

    return await _serialize_resume(resume, user, db)


@router.delete("/{resume_id}")
async def delete_resume(resume_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Resume).where(Resume.id == resume_id, Resume.user_id == user.id)
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(404, "Resume not found")

    await db.delete(resume)
    await db.commit()

    # If the deleted resume was primary, the next /api/matches will pick the
    # most recent remaining resume (or no resume). Hard-clear the cache so
    # stale scores don't leak, and mark dirty so the next read recomputes.
    await clear_user_matches(user.id)

    return {"status": "deleted"}


@router.post("/{resume_id}/set-primary", response_model=ResumeOut)
async def set_primary(resume_id: str, background_tasks: BackgroundTasks, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Resume).where(Resume.id == resume_id, Resume.user_id == user.id)
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(404, "Resume not found")

    # Clear all primaries
    await db.execute(
        update(Resume).where(Resume.user_id == user.id).values(is_primary=False)
    )
    resume.is_primary = True
    await db.commit()
    await db.refresh(resume)

    # The primary resume is the one used by the match engine, so a change
    # here must trigger a recompute.
    trigger_recompute(user.id, REASON_RESUME_PRIMARY_CHANGED, background_tasks)

    return await _serialize_resume(resume, user, db)


@router.post("/{resume_id}/rewrite", dependencies=[Depends(resume_rewrite_rate_limit)])
async def rewrite_resume_field(resume_id: str, body: dict, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """AI rewrite a specific field."""
    result = await db.execute(
        select(Resume).where(Resume.id == resume_id, Resume.user_id == user.id)
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(404, "Resume not found")
    
    field_name = body.get("field", "")
    current_value = body.get("value", "")
    context = body.get("context", f"Resume for {resume.title}, targeting {resume.target_degree or 'any degree'}")
    
    try:
        improved = await asyncio.wait_for(
            rewrite_field(field_name, current_value, context),
            timeout=60,
        )
    except asyncio.TimeoutError:
        raise HTTPException(504, "AI rewrite timed out. Please try again.")
    except Exception as e:
        logger.exception("AI rewrite failed for field %s", field_name)
        raise HTTPException(502, "AI rewrite failed. Please try again.")
    return {"field": field_name, "improved_value": improved}


@router.post("/{resume_id}/reanalyze", response_model=ResumeOut, dependencies=[Depends(resume_analysis_rate_limit)])
async def reanalyze_resume(resume_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Re-run AI analysis on the resume."""
    result = await db.execute(
        select(Resume).where(Resume.id == resume_id, Resume.user_id == user.id)
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(404, "Resume not found")
    
    resume.status = "analyzing"
    await db.commit()
    
    # Reconstruct text from structured data if no raw text
    text = resume.raw_text or ""
    if not text:
        parts = []
        if resume.full_name: parts.append(f"Name: {resume.full_name}")
        if resume.email: parts.append(f"Email: {resume.email}")
        if resume.summary: parts.append(f"Summary: {resume.summary}")
        for edu in (resume.education or []):
            parts.append(f"Education: {edu.get('institution', '')} - {edu.get('degree', '')} in {edu.get('field', '')}")
        for exp in (resume.experience or []):
            parts.append(f"Experience: {exp.get('position', '')} at {exp.get('company', '')} - {exp.get('description', '')}")
        text = "\n".join(parts)
    
    try:
        analysis = await asyncio.wait_for(
            analyze_resume(text, resume.target_fields or [], resume.target_degree or ""),
            timeout=120,
        )
        # Apply AI-parsed structured data
        resume.full_name = analysis.get("full_name", resume.full_name)
        resume.email = analysis.get("email", resume.email)
        resume.phone = analysis.get("phone", resume.phone)
        resume.location = analysis.get("location", resume.location)
        resume.linkedin_url = analysis.get("linkedin_url", resume.linkedin_url)
        resume.portfolio_url = analysis.get("portfolio_url", resume.portfolio_url)
        resume.summary = analysis.get("summary", resume.summary)
        resume.education = analysis.get("education", resume.education)
        resume.experience = analysis.get("experience", resume.experience)
        resume.skills = analysis.get("skills", resume.skills)
        resume.certifications = analysis.get("certifications", resume.certifications)
        resume.publications = analysis.get("publications", resume.publications)
        resume.languages = analysis.get("languages", resume.languages)
        resume.research_projects = analysis.get("research_projects", resume.research_projects)
        resume.awards = analysis.get("awards", resume.awards)
        resume.ref_list = analysis.get("ref_list", resume.ref_list)
        resume.ai_suggestions = analysis.get("ai_suggestions", "")
        resume.status = "completed"

        # Score with level-aware engine
        resume_dict = {
            "email": resume.email, "phone": resume.phone, "location": resume.location,
            "linkedin_url": resume.linkedin_url, "summary": resume.summary,
            "education": resume.education or [], "experience": resume.experience or [],
            "research_projects": resume.research_projects or [], "skills": resume.skills or [],
            "certifications": resume.certifications or [], "publications": resume.publications or [],
            "languages": resume.languages or [],
        }
        degree_level = await _user_degree_level(db, user)
        score_result = _score_resume_level_aware(resume_dict, degree_level)
        resume.overall_score = score_result["overall_score"]
        resume.section_scores = score_result["section_scores"]
        resume.issues = [
            {"field": "general", "severity": "likely", "message": issue}
            for issue in score_result["issues"]
        ]
    except asyncio.TimeoutError:
        resume.status = "error"
        resume.issues = [{"field": "general", "severity": "urgent", "message": "AI analysis timed out before completion.", "suggestion": "Try again later or reduce the resume text size."}]
    except Exception as e:
        resume.status = "error"
        logger.exception("AI analysis failed for resume %s", resume.id)
        resume.issues = [{"field": "general", "severity": "urgent", "message": "AI analysis failed. Please try again or edit the resume manually.", "suggestion": "Try again or edit the resume manually."}]

    await db.commit()
    await db.refresh(resume)
    return resume


@router.get("/{resume_id}/export-pdf")
async def export_resume_pdf(resume_id: str, mode: str = "cv", user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Generate and download a professional PDF of the resume.
    mode: "resume" (single page) or "cv" (full, 1-2 pages)
    """
    from app.services.pdf_generator import generate_resume_pdf

    result = await db.execute(
        select(Resume).where(Resume.id == resume_id, Resume.user_id == user.id)
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(404, "Resume not found")

    resume_data = {
        "full_name": resume.full_name or "",
        "email": resume.email or "",
        "phone": resume.phone or "",
        "location": resume.location or "",
        "linkedin_url": resume.linkedin_url or "",
        "portfolio_url": resume.portfolio_url or "",
        "summary": resume.summary or "",
        "education": resume.education or [],
        "experience": resume.experience or [],
        "skills": resume.skills or [],
        "certifications": resume.certifications or [],
        "publications": resume.publications or [],
        "languages": resume.languages or [],
        "research_projects": resume.research_projects or [],
        "awards": resume.awards or [],
        "ref_list": resume.ref_list or [],
        "style": resume.style or {},
    }

    pdf_bytes = generate_resume_pdf(resume_data, mode=mode)
    filename_prefix = "Resume" if mode == "resume" else "CV"
    filename = f"{(resume.full_name or 'resume').replace(' ', '_')}_{filename_prefix}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


# ── Smart Builder Endpoints ─────────────────────────────────────────────────

@router.get("/builder/questions")
async def get_builder_questions():
    """Return all section questions for the guided builder wizard.

    Frontend uses this to render the step-by-step question flow.
    """
    return {
        "sections": SECTION_ORDER,
        "questions": SECTION_QUESTIONS,
    }


@router.get("/builder/questions/{section}")
async def get_section_questions(section: str):
    """Return questions for a specific section."""
    if section not in SECTION_QUESTIONS:
        raise HTTPException(404, f"Unknown section: {section}. Valid: {', '.join(SECTION_ORDER)}")
    return {
        "section": section,
        "questions": SECTION_QUESTIONS[section],
    }


@router.post("/{resume_id}/ai-generate-section", dependencies=[Depends(resume_rewrite_rate_limit)])
async def ai_generate_section(
    resume_id: str,
    body: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate polished resume content for a section from guided question answers.

    Body: { "section": "education", "answers": { "institution": "...", ... } }

    Returns AI-generated content ready to be saved to the resume.
    """
    section = body.get("section", "")
    answers = body.get("answers", {})

    if not section:
        raise HTTPException(400, "section is required")
    if section not in SECTION_QUESTIONS:
        raise HTTPException(400, f"Unknown section: {section}")
    if not answers:
        raise HTTPException(400, "answers dict is required")

    # Fetch resume for context
    result = await db.execute(
        select(Resume).where(Resume.id == resume_id, Resume.user_id == user.id)
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(404, "Resume not found")

    resume_data = {
        "summary": resume.summary,
        "education": resume.education or [],
        "experience": resume.experience or [],
        "skills": resume.skills or [],
        "research_projects": resume.research_projects or [],
    }

    try:
        generated = await asyncio.wait_for(
            generate_section(section, answers, resume_data),
            timeout=60,
        )
    except asyncio.TimeoutError:
        raise HTTPException(504, "AI generation timed out. Please try again.")
    except Exception as e:
        logger.exception("AI generate-section failed for %s", section)
        raise HTTPException(502, "AI generation failed. Please try again.")

    return {"section": section, "generated": generated}


@router.post("/{resume_id}/ai-save-section", response_model=ResumeOut)
async def ai_save_section(
    resume_id: str,
    body: dict,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save an AI-generated (or user-edited) section entry to the resume.

    Body: { "section": "education", "entry": { ... } }  — for single-entry sections
    Body: { "section": "skills", "data": ["Python", ...] }  — for array sections
    Body: { "section": "summary", "data": "text..." }  — for text fields

    For list sections (education, experience, etc.), `entry` is appended to the existing list.
    For text fields (summary), `data` replaces the current value.
    """
    section = body.get("section", "")
    entry = body.get("entry")
    data = body.get("data")

    if not section:
        raise HTTPException(400, "section is required")

    result = await db.execute(
        select(Resume).where(Resume.id == resume_id, Resume.user_id == user.id)
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(404, "Resume not found")

    # Text fields
    if section == "summary":
        resume.summary = data or entry or ""
    # Array-of-strings fields
    elif section == "skills":
        resume.skills = data or []
    # JSONB list fields — append or replace
    # Note: section keys from the wizard ("projects", "research", "references")
    # differ from DB column names ("research_projects", "ref_list").
    elif section in ("education", "experience", "projects", "research",
                     "certifications", "publications", "awards", "languages",
                     "references", "research_projects", "ref_list"):
        field_map = {
            "education": "education",
            "experience": "experience",
            "projects": "projects",
            "research": "research_projects",
            "research_projects": "research_projects",
            "certifications": "certifications",
            "publications": "publications",
            "awards": "awards",
            "languages": "languages",
            "references": "ref_list",
            "ref_list": "ref_list",
        }
        db_field = field_map[section]
        current = list(getattr(resume, db_field) or [])
        if entry:
            current.append(entry)
        elif data:
            current = data
        setattr(resume, db_field, current)
    else:
        raise HTTPException(400, f"Cannot save section: {section}")

    # Recalculate score
    resume_dict = {
        "email": resume.email, "phone": resume.phone, "location": resume.location,
        "linkedin_url": resume.linkedin_url, "summary": resume.summary,
        "education": resume.education or [], "experience": resume.experience or [],
        "research_projects": resume.research_projects or [], "skills": resume.skills or [],
        "certifications": resume.certifications or [], "publications": resume.publications or [],
        "languages": resume.languages or [],
    }
    degree_level = await _user_degree_level(db, user)
    score_result = _score_resume_level_aware(resume_dict, degree_level)
    resume.overall_score = score_result["overall_score"]
    resume.section_scores = score_result["section_scores"]
    resume.issues = [
        {"field": "general", "severity": "likely", "message": issue}
        for issue in score_result["issues"]
    ]

    await db.commit()
    await db.refresh(resume)

    trigger_recompute(user.id, REASON_RESUME_UPDATED, background_tasks)
    return await _serialize_resume(resume, user, db)


@router.post("/{resume_id}/ai-generate-summary", dependencies=[Depends(resume_rewrite_rate_limit)])
async def ai_generate_summary(
    resume_id: str,
    body: dict = Body(default={}),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate a professional summary from the resume's existing data.

    Body (optional): { "tone": "professional" | "academic" | "concise" }
    """
    result = await db.execute(
        select(Resume).where(Resume.id == resume_id, Resume.user_id == user.id)
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(404, "Resume not found")

    resume_data = {
        "full_name": resume.full_name,
        "education": resume.education or [],
        "experience": resume.experience or [],
        "skills": resume.skills or [],
        "research_projects": resume.research_projects or [],
    }

    tone = body.get("tone", "professional")

    try:
        summary = await asyncio.wait_for(
            generate_summary(resume_data, tone),
            timeout=60,
        )
    except asyncio.TimeoutError:
        raise HTTPException(504, "AI generation timed out.")
    except Exception as e:
        logger.exception("AI summary generation failed")
        raise HTTPException(502, "AI summary generation failed. Please try again.")

    return {"summary": summary}


@router.post("/{resume_id}/ai-suggest", dependencies=[Depends(resume_rewrite_rate_limit)])
async def ai_suggest(
    resume_id: str,
    body: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get AI suggestions for any section of the resume.

    Body: { "section": "summary", "instruction": "make it more impactful" }

    Returns AI-generated suggestion for the requested section.
    """
    section = body.get("section", "")
    instruction = body.get("instruction", "")

    if not section:
        raise HTTPException(400, "section is required")

    result = await db.execute(
        select(Resume).where(Resume.id == resume_id, Resume.user_id == user.id)
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(404, "Resume not found")

    resume_data = {
        "full_name": resume.full_name,
        "summary": resume.summary,
        "education": resume.education or [],
        "experience": resume.experience or [],
        "skills": resume.skills or [],
        "research_projects": resume.research_projects or [],
        "certifications": resume.certifications or [],
        "publications": resume.publications or [],
        "awards": resume.awards or [],
    }

    try:
        suggestion = await asyncio.wait_for(
            suggest_content(section, resume_data, instruction),
            timeout=60,
        )
    except asyncio.TimeoutError:
        raise HTTPException(504, "AI suggestion timed out.")
    except Exception as e:
        logger.exception("AI suggest failed for %s", section)
        raise HTTPException(502, "AI suggestion failed. Please try again.")

    return {"section": section, "suggestion": suggestion}

@router.post("/{resume_id}/polish", dependencies=[Depends(resume_rewrite_rate_limit)])
async def polish_endpoint(
    resume_id: str,
    body: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Polish a resume to the requested level.

    Body: { "level": "simple" | "medium" | "high" } (default: "simple")

    Applies the polish, recomputes the score, and returns the updated ResumeOut.
    """
    level = body.get("level", "simple")
    if level not in ("simple", "medium", "high"):
        raise HTTPException(400, "level must be one of: simple, medium, high")

    result = await db.execute(
        select(Resume).where(Resume.id == resume_id, Resume.user_id == user.id)
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(404, "Resume not found")

    resume_data = {
        "full_name": resume.full_name,
        "email": resume.email,
        "phone": resume.phone,
        "location": resume.location,
        "linkedin_url": resume.linkedin_url,
        "portfolio_url": resume.portfolio_url,
        "summary": resume.summary,
        "education": resume.education or [],
        "experience": resume.experience or [],
        "projects": resume.projects or [],
        "research_projects": resume.research_projects or [],
        "skills": resume.skills or [],
        "certifications": resume.certifications or [],
        "publications": resume.publications or [],
        "awards": resume.awards or [],
        "languages": resume.languages or [],
        "ref_list": resume.ref_list or [],
    }

    try:
        polished = await asyncio.wait_for(polish_resume(resume_data, level), timeout=120)
    except asyncio.TimeoutError:
        raise HTTPException(504, "AI polish timed out.")
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.exception("AI polish failed")
        raise HTTPException(502, "AI polish failed. Please try again.")

    # Apply the polished content.
    resume.full_name = polished.get("full_name", resume.full_name)
    resume.email = polished.get("email", resume.email)
    resume.phone = polished.get("phone", resume.phone)
    resume.location = polished.get("location", resume.location)
    resume.linkedin_url = polished.get("linkedin_url", resume.linkedin_url)
    resume.portfolio_url = polished.get("portfolio_url", resume.portfolio_url)
    resume.summary = polished.get("summary", resume.summary)
    resume.education = polished.get("education", resume.education)
    resume.experience = polished.get("experience", resume.experience)
    resume.projects = polished.get("projects", resume.projects)
    resume.research_projects = polished.get("research_projects", resume.research_projects)
    resume.skills = polished.get("skills", resume.skills)
    resume.certifications = polished.get("certifications", resume.certifications)
    resume.publications = polished.get("publications", resume.publications)
    resume.awards = polished.get("awards", resume.awards)
    resume.languages = polished.get("languages", resume.languages)
    resume.ref_list = polished.get("ref_list", resume.ref_list)

    # Recalculate score.
    resume_dict = {
        "email": resume.email, "phone": resume.phone, "location": resume.location,
        "linkedin_url": resume.linkedin_url, "summary": resume.summary,
        "education": resume.education or [], "experience": resume.experience or [],
        "research_projects": resume.research_projects or [], "skills": resume.skills or [],
        "certifications": resume.certifications or [], "publications": resume.publications or [],
        "languages": resume.languages or [],
    }
    degree_level = await _user_degree_level(db, user)
    score_result = _score_resume_level_aware(resume_dict, degree_level)
    resume.overall_score = score_result["overall_score"]
    resume.section_scores = score_result["section_scores"]
    resume.issues = [
        {"field": "general", "severity": "likely", "message": issue}
        for issue in score_result["issues"]
    ]

    await db.commit()
    await db.refresh(resume)

    trigger_recompute(user.id, REASON_RESUME_UPDATED, BackgroundTasks())
    return await _serialize_resume(resume, user, db)

