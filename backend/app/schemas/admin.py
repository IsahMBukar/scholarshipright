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
    is_active: bool = True
    is_verified: bool = False
    source: Optional[str] = None
    view_count: int = 0
    application_count: int = 0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


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

    class Config:
        from_attributes = True
