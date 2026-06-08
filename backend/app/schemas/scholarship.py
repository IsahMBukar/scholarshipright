from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime
from uuid import UUID
from decimal import Decimal


class ScholarshipBase(BaseModel):
    name: str
    slug: str
    host_country: str
    host_institution: Optional[str] = None
    provider: Optional[str] = None
    degree_levels: List[str] = []
    fields_of_study: List[str] = []
    eligible_nationalities: List[str] = []
    eligible_regions: List[str] = []
    funding_type: str
    covers_tuition: bool = True
    covers_living: bool = False
    covers_flight: bool = False
    covers_health: bool = False
    monthly_stipend_usd: Optional[int] = None
    requires_ielts: bool = True
    min_ielts_score: Optional[Decimal] = None
    requires_gre: bool = False
    requires_application_fee: bool = False
    min_cgpa: Optional[Decimal] = None
    language_of_instruction: str = "English"
    open_date: Optional[date] = None
    deadline: date
    program_start_date: Optional[date] = None
    duration_months: Optional[int] = None
    description: Optional[str] = None
    benefits_summary: Optional[str] = None
    how_to_apply: Optional[str] = None
    official_url: str
    logo_url: Optional[str] = None
    is_active: bool = True
    is_verified: bool = False
    source: Optional[str] = None


class ScholarshipCreate(ScholarshipBase):
    pass


class ScholarshipResponse(ScholarshipBase):
    id: UUID
    view_count: int = 0
    application_count: int = 0
    created_at: datetime
    updated_at: datetime
    match_score: Optional[float] = None  # Added when user is authenticated
    match_breakdown: Optional[dict] = None

    class Config:
        from_attributes = True


class ScholarshipListResponse(BaseModel):
    items: List[ScholarshipResponse]
    total: int
    page: int
    limit: int
    pages: int
