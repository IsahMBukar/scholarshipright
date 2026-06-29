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
    nationality_code: Optional[str] = None   # ISO 3166-1 alpha-2
    residency_code: Optional[str] = None     # ISO 3166-1 alpha-2
    research_interests: Optional[List[str]] = []
    work_experience_years: Optional[int] = None
    target_degree: Optional[str] = None
    target_fields: Optional[List[str]] = []
    target_start_date: Optional[date] = None
    target_countries: Optional[List[str]] = []
    has_ielts: bool = False
    ielts_score: Optional[Decimal] = None
    # English-language study waiver signal. When True, the matching
    # engine treats the user as having satisfied (or partially satisfied)
    # any English-test requirement, because their prior degree was taught
    # in English. See backend/app/services/match_engine.english_test_score.
    prior_studies_in_english: bool = False

    @field_validator('research_interests', 'target_fields', 'target_countries', mode='before')
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
