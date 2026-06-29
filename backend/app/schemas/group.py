"""Pydantic schemas for the Admin Country Groups endpoints."""
from datetime import date, datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class GroupBase(BaseModel):
    code: str = Field(..., max_length=64, pattern=r"^[A-Z0-9_]+$")
    name: str = Field(..., max_length=255)
    description: Optional[str] = None
    source_url: Optional[str] = None
    source_date: Optional[date] = None


class GroupCreate(GroupBase):
    members: List[str] = Field(default=[], description="ISO 3166-1 alpha-2 country codes")


class GroupUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    source_url: Optional[str] = None
    source_date: Optional[date] = None
    members: Optional[List[str]] = Field(None, description="ISO 3166-1 alpha-2 country codes (replaces current membership)")


class GroupMemberResponse(BaseModel):
    code: str
    name: str


class GroupResponse(BaseModel):
    id: UUID
    code: str
    name: str
    description: Optional[str] = None
    source_url: Optional[str] = None
    source_date: Optional[date] = None
    status: str
    member_count: int = 0
    members: List[GroupMemberResponse] = []
    scholarship_count: int = 0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class GroupListResponse(BaseModel):
    items: List[GroupResponse]
    total: int


class CountryResponse(BaseModel):
    code: str
    name: str
    iso3: Optional[str] = None

    class Config:
        from_attributes = True


class EligibilityPreviewRequest(BaseModel):
    included_groups: List[str] = []
    included_countries: List[str] = []
    excluded_groups: List[str] = []
    excluded_countries: List[str] = []


class EligibilityPreviewResponse(BaseModel):
    resolved_count: int
    unresolved: bool
    countries: List[GroupMemberResponse] = []
