"""
Pydantic schemas for the /api/admin/* endpoints.

Conventions:
    - All IDs are UUIDs (validated by Pydantic).
    - All datetime fields are timezone-aware ISO strings.
    - Read schemas use `from_attributes = True` so they can be built
      directly from SQLAlchemy ORM models.
    - Write schemas (create/update/patch) only allow fields the
      corresponding route is allowed to touch.
    - List responses use a consistent { items, total, page, limit, pages }
      shape so the frontend can render any list with the same DataTable.
"""
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


# ── Shared shapes ──────────────────────────────────────────────────


class PaginatedResponse(BaseModel):
    """Generic { items, total, page, limit, pages } envelope.

    Use for every list endpoint so the frontend can swap DataTable sources.
    """
    items: List[Any]
    total: int
    page: int
    limit: int
    pages: int


# ── Overview / analytics ───────────────────────────────────────────


class OverviewKPI(BaseModel):
    """One KPI tile on the admin Overview page.

    `delta` is percent change vs the previous period (positive = up).
    """
    key: str                    # stable id, e.g. "total_users"
    label: str                  # display label, e.g. "Total users"
    value: float                # numeric value
    format: Literal["number", "percent", "currency", "duration"]
    delta: Optional[float] = None
    delta_period: Optional[str] = None  # "vs last 30d"


class OverviewResponse(BaseModel):
    """Top-level admin overview payload (KPI tiles + small chart sparkline)."""
    kpis: List[OverviewKPI]
    recent_signups_7d: List[Dict[str, Any]]   # [{date, count}, ...]
    recent_match_computes_7d: List[Dict[str, Any]]  # [{date, count}, ...]
    generated_at: datetime


class TimeSeriesPoint(BaseModel):
    """One point on a time-series chart."""
    date: str        # ISO date (YYYY-MM-DD) or datetime (YYYY-MM-DDTHH:MM:SSZ)
    value: float
    label: Optional[str] = None   # optional category label for stacked series


class AnalyticsSeries(BaseModel):
    """A single time series for the analytics page."""
    key: str                          # stable id, e.g. "signups"
    label: str                        # display label
    points: List[TimeSeriesPoint]


class AnalyticsResponse(BaseModel):
    """Bulk endpoint for the analytics page — returns all 6 series in one call."""
    range_days: int
    series: List[AnalyticsSeries]
    generated_at: datetime


# ── Users ──────────────────────────────────────────────────────────


class AdminUserResponse(BaseModel):
    """Full user record as visible to an admin."""
    id: UUID
    email: str
    full_name: Optional[str] = None
    is_active: bool
    is_admin: bool
    admin_role: Optional[Literal["super_admin", "support_staff"]] = None
    created_at: datetime
    updated_at: datetime
    # Aggregate counts for the row (cheap to compute, useful for sorting/filter)
    resume_count: int = 0
    saved_count: int = 0
    last_active_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AdminUserPatch(BaseModel):
    """Partial update — all fields optional; only those present are applied.

    `is_active` and `admin_role` changes are sensitive and the route
    will enforce role + self-protection rules before writing.
    """
    full_name: Optional[str] = Field(None, max_length=255)
    is_active: Optional[bool] = None
    admin_role: Optional[Literal["super_admin", "support_staff", "remove"]] = None


# ── Scholarships ───────────────────────────────────────────────────


class AdminScholarshipResponse(BaseModel):
    """Scholarship as visible to an admin (all fields except internal-only)."""
    id: UUID
    name: str
    slug: str
    host_country: str
    host_institution: Optional[str] = None
    provider: Optional[str] = None
    degree_levels: List[str] = []
    fields_of_study: List[str] = []
    eligible_nationalities: List[str] = []
    eligible_regions: List[str] = []
    # ── Structured eligibility ──
    eligibility_display: Optional[str] = None
    eligibility_basis: str = "either"
    included_groups: List[str] = []
    included_countries: List[str] = []
    excluded_groups: List[str] = []
    excluded_countries: List[str] = []
    resolved_countries: List[str] = []
    eligibility_unresolved: bool = False
    groups_resolved_at: Optional[datetime] = None
    # ── end eligibility ──
    funding_type: str
    covers_tuition: bool = True
    covers_living: bool = False
    covers_flight: bool = False
    covers_health: bool = False
    monthly_stipend_usd: Optional[int] = None
    requires_ielts: bool = True
    min_ielts_score: Optional[float] = None
    requires_gre: bool = False
    requires_application_fee: bool = False
    min_cgpa: Optional[float] = None
    language_of_instruction: str = "English"
    open_date: Optional[Any] = None
    deadline: Any
    program_start_date: Optional[Any] = None
    duration_months: Optional[int] = None
    description: Optional[str] = None
    benefits_summary: Optional[str] = None
    how_to_apply: Optional[str] = None
    official_url: str
    logo_url: Optional[str] = None
    # English tests the scholarship accepts (e.g. ["IELTS", "TOEFL", "PTE"]).
    # Mirrors the public detail-page pill list; admins can override the
    # host-country inference by setting this explicitly.
    accepted_english_tests: List[str] = []
    # Required documents — admin override on top of auto-derived defaults.
    # 8 booleans (true/false), then the 5 "cement + flexible" fields
    # (always materialised by apply_auto_defaults on the read side, so
    # they're guaranteed non-null in API responses), then the long-tail.
    req_transcripts: bool = True
    req_cv_resume: bool = True
    req_sop_motivation_letter: bool = True
    req_recommendation_letters: bool = True
    req_english_test: bool = True
    req_passport_or_id: bool = True
    req_financial_proof: bool = False
    req_photo: bool = False
    previous_degree_required: str = "high_school_diploma"
    recommendation_letters_count: int = 2
    research_proposal_required: bool = False
    writing_sample_required: bool = False
    standardized_test: str = "none"
    additional_required_documents: Optional[str] = None
    is_active: bool = True
    is_verified: bool = False
    source: Optional[str] = None
    view_count: int = 0
    application_count: int = 0
    created_at: datetime
    updated_at: datetime
    # Per-degree-level document overrides (loaded separately)
    degree_documents: Optional[List[dict]] = None
    # Custom/flexible document requirements added by admin
    custom_documents: Optional[List[dict]] = None

    class Config:
        from_attributes = True


class AdminScholarshipCreate(BaseModel):
    """Create a new scholarship. Required fields are those the DB model
    marks NOT NULL (name, slug, host_country, funding_type, deadline, official_url).
    Everything else is optional and has the same default the model uses.
    """
    name: str = Field(..., max_length=512)
    slug: str = Field(..., max_length=512)
    host_country: str
    funding_type: str  # 'fully_funded' | 'partial' | 'stipend_only'
    deadline: str       # ISO date string
    official_url: str

    host_institution: Optional[str] = None
    provider: Optional[str] = None
    degree_levels: Optional[List[str]] = None
    fields_of_study: Optional[List[str]] = None
    eligible_nationalities: Optional[List[str]] = None
    eligible_regions: Optional[List[str]] = None
    # ── Structured eligibility ──
    eligibility_display: Optional[str] = None
    eligibility_basis: Optional[str] = None  # 'citizenship' | 'residency' | 'either'
    included_groups: Optional[List[str]] = None
    included_countries: Optional[List[str]] = None
    excluded_groups: Optional[List[str]] = None
    excluded_countries: Optional[List[str]] = None
    # resolved_countries is computed server-side — never set by client
    covers_tuition: Optional[bool] = None
    covers_living: Optional[bool] = None
    covers_flight: Optional[bool] = None
    covers_health: Optional[bool] = None
    monthly_stipend_usd: Optional[int] = None
    requires_ielts: Optional[bool] = None
    min_ielts_score: Optional[Decimal] = None
    requires_gre: Optional[bool] = None
    requires_application_fee: Optional[bool] = None
    min_cgpa: Optional[Decimal] = None
    language_of_instruction: Optional[str] = None
    open_date: Optional[str] = None
    program_start_date: Optional[str] = None
    duration_months: Optional[int] = None
    description: Optional[str] = None
    benefits_summary: Optional[str] = None
    how_to_apply: Optional[str] = None
    logo_url: Optional[str] = None
    # English tests accepted (e.g. ["IELTS", "TOEFL"]). When omitted/empty
    # the runtime migration backfills via _infer_english_tests(host_country).
    accepted_english_tests: Optional[List[str]] = None
    # Required documents. Each nullable: None means "use the auto default
    # derived from degree_levels at read time". On Create the API
    # materialises them via apply_auto_defaults() before persisting, so
    # the saved row holds a real value, not a null.
    req_transcripts: Optional[bool] = None
    req_cv_resume: Optional[bool] = None
    req_sop_motivation_letter: Optional[bool] = None
    req_recommendation_letters: Optional[bool] = None
    req_english_test: Optional[bool] = None
    req_passport_or_id: Optional[bool] = None
    req_financial_proof: Optional[bool] = None
    req_photo: Optional[bool] = None
    previous_degree_required: Optional[str] = None
    recommendation_letters_count: Optional[int] = None
    research_proposal_required: Optional[bool] = None
    writing_sample_required: Optional[bool] = None
    standardized_test: Optional[str] = None
    additional_required_documents: Optional[str] = None
    # Inline degree-level document overrides. When provided, the create
    # endpoint writes ScholarshipDegreeDocument rows alongside the
    # scholarship so admins don't need a separate save step.
    degree_documents: Optional[List['DegreeDocCreate']] = None
    # Inline custom/flexible document requirements.
    custom_documents: Optional[List['CustomDocCreate']] = None
    is_active: Optional[bool] = None
    is_verified: Optional[bool] = None
    source: Optional[str] = None


class AdminScholarshipPatch(BaseModel):
    """Partial scholarship update. Most fields editable from the admin form."""
    name: Optional[str] = Field(None, max_length=512)
    host_country: Optional[str] = None
    host_institution: Optional[str] = None
    provider: Optional[str] = None
    degree_levels: Optional[List[str]] = None
    fields_of_study: Optional[List[str]] = None
    eligible_nationalities: Optional[List[str]] = None
    eligible_regions: Optional[List[str]] = None
    # ── Structured eligibility ──
    eligibility_display: Optional[str] = None
    eligibility_basis: Optional[str] = None
    included_groups: Optional[List[str]] = None
    included_countries: Optional[List[str]] = None
    excluded_groups: Optional[List[str]] = None
    excluded_countries: Optional[List[str]] = None
    funding_type: Optional[str] = None
    covers_tuition: Optional[bool] = None
    covers_living: Optional[bool] = None
    covers_flight: Optional[bool] = None
    covers_health: Optional[bool] = None
    monthly_stipend_usd: Optional[int] = None
    requires_ielts: Optional[bool] = None
    min_ielts_score: Optional[Decimal] = None
    requires_gre: Optional[bool] = None
    requires_application_fee: Optional[bool] = None
    min_cgpa: Optional[Decimal] = None
    language_of_instruction: Optional[str] = None
    open_date: Optional[str] = None           # accept ISO date string
    deadline: Optional[str] = None
    program_start_date: Optional[str] = None
    duration_months: Optional[int] = None
    description: Optional[str] = None
    benefits_summary: Optional[str] = None
    how_to_apply: Optional[str] = None
    official_url: Optional[str] = None
    logo_url: Optional[str] = None
    accepted_english_tests: Optional[List[str]] = None
    # Required documents — admin can override any of these. None means
    # "don't change" on PATCH (and the field stays at whatever the DB
    # has, which itself may be null → auto-defaulted at read time).
    req_transcripts: Optional[bool] = None
    req_cv_resume: Optional[bool] = None
    req_sop_motivation_letter: Optional[bool] = None
    req_recommendation_letters: Optional[bool] = None
    req_english_test: Optional[bool] = None
    req_passport_or_id: Optional[bool] = None
    req_financial_proof: Optional[bool] = None
    req_photo: Optional[bool] = None
    previous_degree_required: Optional[str] = None
    recommendation_letters_count: Optional[int] = None
    research_proposal_required: Optional[bool] = None
    writing_sample_required: Optional[bool] = None
    standardized_test: Optional[str] = None
    additional_required_documents: Optional[str] = None
    is_active: Optional[bool] = None
    is_verified: Optional[bool] = None
    source: Optional[str] = None


# ── Audit log ──────────────────────────────────────────────────────


class AdminAuditEntry(BaseModel):
    id: UUID
    admin_id: Optional[UUID] = None
    admin_email: Optional[str] = None
    action: str
    target_type: str
    target_id: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ── Invites ────────────────────────────────────────────────────────


class AdminInviteCreate(BaseModel):
    """Request body for creating a new admin/support invite."""
    email: EmailStr
    admin_role: Literal["super_admin", "support_staff"]
    # Optional: human-friendly note included in the magic link email.
    note: Optional[str] = Field(None, max_length=500)


class AdminInviteResponse(BaseModel):
    """Response after creating an invite.

    The token is shown ONCE in this response (not stored in plain text)
    and is also embedded in the magic link. After the user accepts,
    the invite row is deleted.
    """
    id: UUID
    email: EmailStr
    admin_role: str
    invite_url: str          # absolute magic-link URL
    expires_at: datetime
    created_at: datetime


class AdminInviteListEntry(BaseModel):
    id: UUID
    email: EmailStr
    admin_role: str
    invited_by_email: Optional[str] = None
    created_at: datetime
    expires_at: datetime
    accepted_at: Optional[datetime] = None
    revoked_at: Optional[datetime] = None


# ── Per-degree-level documents ─────────────────────────────────────


class DegreeDocBase(BaseModel):
    """Shared fields for degree-level document rows."""
    degree_level: str = Field(..., description="'bachelor' | 'master' | 'phd'")
    req_transcripts: bool = True
    req_cv_resume: bool = True
    req_sop_motivation_letter: bool = True
    req_recommendation_letters: bool = True
    req_english_test: bool = True
    req_passport_or_id: bool = True
    req_financial_proof: bool = False
    req_photo: bool = False
    previous_degree_required: Optional[str] = None
    recommendation_letters_count: Optional[int] = None
    research_proposal_required: Optional[bool] = None
    writing_sample_required: Optional[bool] = None
    standardized_test: Optional[str] = None
    additional_required_documents: Optional[str] = None


class DegreeDocCreate(DegreeDocBase):
    """Create a per-degree-level document row for a scholarship."""
    pass


class DegreeDocUpdate(BaseModel):
    """Partial update — only send fields you want to change."""
    req_transcripts: Optional[bool] = None
    req_cv_resume: Optional[bool] = None
    req_sop_motivation_letter: Optional[bool] = None
    req_recommendation_letters: Optional[bool] = None
    req_english_test: Optional[bool] = None
    req_passport_or_id: Optional[bool] = None
    req_financial_proof: Optional[bool] = None
    req_photo: Optional[bool] = None
    previous_degree_required: Optional[str] = None
    recommendation_letters_count: Optional[int] = None
    research_proposal_required: Optional[bool] = None
    writing_sample_required: Optional[bool] = None
    standardized_test: Optional[str] = None
    additional_required_documents: Optional[str] = None


class DegreeDocResponse(DegreeDocBase):
    """Full degree-level document row returned by the API."""
    id: UUID
    scholarship_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Custom/flexible documents ─────────────────────────────────────


class CustomDocCreate(BaseModel):
    """Create a custom document requirement for a scholarship."""
    name: str = Field(..., max_length=256, description="Document name, e.g. 'Portfolio', 'Video essay'")
    description: Optional[str] = Field(None, description="What to submit, e.g. '5-10 pieces of original work'")
    required: bool = True
    degree_level: Optional[str] = Field(None, description="If set, only for this level. Null = all levels.")
    position: int = Field(0, description="Display order (lower = higher)")


class CustomDocUpdate(BaseModel):
    """Partial update for a custom document."""
    name: Optional[str] = Field(None, max_length=256)
    description: Optional[str] = None
    required: Optional[bool] = None
    degree_level: Optional[str] = None
    position: Optional[int] = None


class CustomDocResponse(BaseModel):
    """Custom document returned by the API."""
    id: UUID
    scholarship_id: UUID
    degree_level: Optional[str] = None
    name: str
    description: Optional[str] = None
    required: bool
    position: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Resolve forward references in AdminScholarshipCreate (degree_documents
# and custom_documents reference DegreeDocCreate / CustomDocCreate which
# are defined above).
AdminScholarshipCreate.model_rebuild()
