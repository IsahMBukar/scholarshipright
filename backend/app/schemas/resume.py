from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime
from uuid import UUID


class ResumeCreate(BaseModel):
    title: str = "My Resume"
    target_fields: List[str] = []
    target_degree: Optional[str] = None


class ResumeUpdate(BaseModel):
    title: Optional[str] = None
    target_fields: Optional[List[str]] = None
    target_degree: Optional[str] = None
    is_primary: Optional[bool] = None
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    linkedin_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    summary: Optional[str] = None
    education: Optional[List[Any]] = None
    experience: Optional[List[Any]] = None
    skills: Optional[List[str]] = None
    certifications: Optional[List[Any]] = None
    publications: Optional[List[Any]] = None
    languages: Optional[List[Any]] = None
    projects: Optional[List[Any]] = None
    awards: Optional[List[Any]] = None
    ref_list: Optional[List[Any]] = None


class IssueOut(BaseModel):
    field: str
    severity: str  # urgent, severe, likely
    message: str
    suggestion: Optional[str] = None


class ResumeOut(BaseModel):
    id: UUID
    user_id: UUID
    title: str
    target_fields: List[str]
    target_degree: Optional[str]
    is_primary: bool
    status: str
    original_filename: Optional[str]
    original_mime_type: Optional[str]
    full_name: Optional[str]
    email: Optional[str]
    phone: Optional[str]
    location: Optional[str]
    linkedin_url: Optional[str]
    portfolio_url: Optional[str]
    summary: Optional[str]
    education: List[Any]
    experience: List[Any]
    skills: List[str]
    certifications: List[Any]
    publications: List[Any]
    languages: List[Any]
    projects: List[Any]
    awards: List[Any]
    ref_list: List[Any]
    analysis: dict
    issues: List[Any]
    ai_suggestions: Optional[str]
    overall_score: Optional[int]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
