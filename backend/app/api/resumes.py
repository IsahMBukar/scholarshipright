import os
import uuid as uuid_lib
from uuid import UUID
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from typing import Optional, List
import json
import asyncio

from app.db.session import get_db, AsyncSessionLocal
from app.models.resume import Resume
from app.models.user import User
from app.models.profile import Profile
from app.schemas.resume import ResumeOut, ResumeUpdate
from app.services.resume_analyzer import extract_text_from_file, analyze_resume, rewrite_field
from app.services.scoring import calculate_resume_score, calculate_level_aware_completeness
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
    except:
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
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create an empty resume record for manual entry (no file upload).

    Returns the existing manual resume if one already exists.
    """
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
        title="My Profile",
        target_fields=[],
        target_degree=None,
        original_filename=None,
        original_file_url=None,
        original_mime_type=None,
        status="manual",
    )

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
    import traceback
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
                print(f"Background analysis: resume {resume_id} not found")
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
                
                # Calculate deterministic score
                resume_dict = {
                    "email": resume.email, "phone": resume.phone, "location": resume.location,
                    "linkedin_url": resume.linkedin_url, "summary": resume.summary,
                    "education": resume.education or [], "experience": resume.experience or [],
                    "research_projects": resume.research_projects or [], "skills": resume.skills or [],
                    "certifications": resume.certifications or [], "publications": resume.publications or [],
                    "languages": resume.languages or [],
                }
                score_result = calculate_resume_score(resume_dict)
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
            print(f"Background analysis complete for resume {resume_id}: status={resume.status}")
    except asyncio.TimeoutError:
        print(f"Background analysis timed out for resume {resume_id}")
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
        print(f"Background analysis error for resume {resume_id}: {e}")
        traceback.print_exc()
        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(select(Resume).where(Resume.id == resume_id))
                resume = result.scalar_one_or_none()
                if resume:
                    resume.status = "error"
                    resume.issues = [{"field": "general", "severity": "urgent", "message": f"Analysis failed: {str(e)[:100]}", "suggestion": "Try again or paste your CV text."}]
                    await emit_resume_failed(
                        db,
                        user_id=resume.user_id,
                        resume_id=resume.id,
                        reason=f"Analysis failed: {str(e)[:100]}",
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

    # Recalculate score on save (deterministic only)
    resume_dict = {
        "email": resume.email, "phone": resume.phone, "location": resume.location,
        "linkedin_url": resume.linkedin_url, "summary": resume.summary,
        "education": resume.education or [], "experience": resume.experience or [],
        "research_projects": resume.research_projects or [], "skills": resume.skills or [],
        "certifications": resume.certifications or [], "publications": resume.publications or [],
        "languages": resume.languages or [],
    }
    score_result = calculate_resume_score(resume_dict)
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
        raise HTTPException(502, f"AI rewrite failed: {str(e)[:120]}")
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

        # Score with deterministic engine only
        resume_dict = {
            "email": resume.email, "phone": resume.phone, "location": resume.location,
            "linkedin_url": resume.linkedin_url, "summary": resume.summary,
            "education": resume.education or [], "experience": resume.experience or [],
            "research_projects": resume.research_projects or [], "skills": resume.skills or [],
            "certifications": resume.certifications or [], "publications": resume.publications or [],
            "languages": resume.languages or [],
        }
        score_result = calculate_resume_score(resume_dict)
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
        resume.issues = [{"field": "general", "severity": "urgent", "message": f"AI analysis failed: {str(e)[:120]}", "suggestion": "Try again or edit the resume manually."}]

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
    }

    pdf_bytes = generate_resume_pdf(resume_data, mode=mode)
    filename_prefix = "Resume" if mode == "resume" else "CV"
    filename = f"{(resume.full_name or 'resume').replace(' ', '_')}_{filename_prefix}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )
