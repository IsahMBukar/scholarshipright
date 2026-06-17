from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from uuid import UUID


class SavedScholarshipCreate(BaseModel):
    scholarship_id: UUID


class SavedScholarshipUpdate(BaseModel):
    status: Optional[str] = None  # 'saved', 'applying', 'applied', 'reviewing', 'rejected', 'accepted'
    notes: Optional[str] = None
    reminder_enabled: Optional[bool] = None


class SavedScholarshipResponse(BaseModel):
    id: UUID
    user_id: UUID
    scholarship_id: UUID
    status: str
    notes: Optional[str] = None
    reminder_enabled: bool
    created_at: datetime
    # Joined scholarship data
    scholarship_name: Optional[str] = None
    scholarship_deadline: Optional[Optional[str]] = None
    scholarship_host_country: Optional[str] = None
    scholarship_funding_type: Optional[str] = None

    class Config:
        from_attributes = True
