import os
import uuid as uuid_lib
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
from app.schemas.resume import ResumeOut, ResumeUpdate
from app.services.resume_analyzer import extract_text_from_file, analyze_resume, rewrite_field
from app.services.scoring import calculate_resume_score
from app.api.users import get_current_user

router = APIRouter(prefix="/api/resumes", tags=["resumes"])

UPLOAD_DIR = "/home/alaiisah/Desktop/Scholarshipright/backend/uploads/resumes"
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.get("", response_model=List[ResumeOut])
async def list_resumes(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Resume).where(Resume.user_id == user.id).order_by(Resume.is_primary.desc(), Resume.updated_at.desc())
    )
    return result.scalars().all()


@router.get("/{resume_id}", response_model=ResumeOut)
async def get_resume(resume_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Resume).where(Resume.id == resume_id, Resume.user_id == user.id)
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(404, "Resume not found")
    return resume


@router.post("", response_model=ResumeOut)
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
    
    # Read file content
    content = await file.read()
    mime_type = file.content_type or "application/octet-stream"
    filename = file.filename or "resume.pdf"
    
    # Save file
    file_id = str(uuid_lib.uuid4())
    ext = os.path.splitext(filename)[1] or ".pdf"
    saved_path = os.path.join(UPLOAD_DIR, f"{file_id}{ext}")
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
    
    return resume


async def _run_analysis(resume_id: str, content: bytes, mime_type: str, filename: str, fields_list: list, target_degree: str):
    """Background task: extract text, run AI analysis, update resume."""
    import traceback
    try:
        raw_text = await extract_text_from_file(content, mime_type, filename)
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
                analysis = await analyze_resume(raw_text, fields_list, target_degree)
                
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
                resume.overall_score = analysis.get("overall_score", 0)
                resume.issues = analysis.get("issues", [])
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
            else:
                resume.status = "error"
                resume.issues = [{"field": "file", "severity": "urgent", "message": "Could not extract text from file. Try a clearer image or PDF.", "suggestion": "Re-upload or paste text manually."}]
            
            await db.commit()
            print(f"Background analysis complete for resume {resume_id}: status={resume.status}")
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
                    await db.commit()
        except:
            pass


@router.put("/{resume_id}", response_model=ResumeOut)
async def update_resume(resume_id: str, data: ResumeUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Resume).where(Resume.id == resume_id, Resume.user_id == user.id)
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(404, "Resume not found")
    
    update_data = data.model_dump(exclude_unset=True)
    
    # Handle setting primary
    if update_data.get("is_primary") is True:
        # Clear other primaries
        await db.execute(
            update(Resume).where(Resume.user_id == user.id, Resume.id != resume_id).values(is_primary=False)
        )
    
    for key, value in update_data.items():
        setattr(resume, key, value)
    
    # Recalculate score on save
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
    
    await db.commit()
    await db.refresh(resume)
    return resume


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
    return {"status": "deleted"}


@router.post("/{resume_id}/set-primary", response_model=ResumeOut)
async def set_primary(resume_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
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
    return resume


@router.post("/{resume_id}/rewrite")
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
    
    improved = await rewrite_field(field_name, current_value, context)
    return {"field": field_name, "improved_value": improved}


@router.post("/{resume_id}/reanalyze", response_model=ResumeOut)
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
        analysis = await analyze_resume(text, resume.target_fields or [], resume.target_degree or "")
        resume.overall_score = analysis.get("overall_score", resume.overall_score)
        resume.issues = analysis.get("issues", [])
        resume.ai_suggestions = analysis.get("ai_suggestions", "")
        resume.status = "completed"
    except Exception as e:
        resume.status = "error"

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
