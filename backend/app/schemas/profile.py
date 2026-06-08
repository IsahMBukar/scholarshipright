from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import date, datetime
from uuid import UUID
from decimal import Decimal


class ProfileBase(BaseModel):
    degree_level: Optional[str] = None
    cgpa: Optional[Decimal] = None
    cgpa_scale: Optional[Decimal] = None
    degree_class: Optional[str] = None
    field_of_study: Optional[str] = None
    graduation_year: Optional[int] = None
    university: Optional[str] = None
    country_of_origin: Optional[str] = None
    publications: Optional[List[str]] = []
    research_interests: Optional[List[str]] = []
    certifications: Optional[List[str]] = []
    work_experience_years: Optional[int] = None
    target_degree: Optional[str] = None
    target_fields: Optional[List[str]] = []
    target_start_date: Optional[date] = None
    target_countries: Optional[List[str]] = []
    has_ielts: bool = False
    ielts_score: Optional[Decimal] = None
    languages: Optional[List[str]] = []

    @field_validator('publications', 'research_interests', 'certifications', 'target_fields', 'target_countries', 'languages', mode='before')
    @classmethod
    def none_to_empty_list(cls, v):
        return v if v is not None else []


class ProfileCreate(ProfileBase):
    pass


class ProfileUpdate(ProfileBase):
    pass


class ProfileResponse(ProfileBase):
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
