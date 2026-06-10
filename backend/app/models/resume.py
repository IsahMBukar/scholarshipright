import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Boolean, Integer, Text
from sqlalchemy.dialects.postgresql import UUID, ARRAY, JSONB
from app.db.session import Base


class Resume(Base):
    __tablename__ = "resumes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)

    # Metadata
    title = Column(String, nullable=False, default="My Resume")
    target_fields = Column(ARRAY(String), default=[])
    target_degree = Column(String, nullable=True)
    is_primary = Column(Boolean, default=False)
    status = Column(String, default="uploading")  # uploading, analyzing, completed, error

    # Original file
    original_filename = Column(String, nullable=True)
    original_file_url = Column(Text, nullable=True)
    original_mime_type = Column(String, nullable=True)

    # Structured resume data
    full_name = Column(Text, nullable=True)
    email = Column(Text, nullable=True)
    phone = Column(Text, nullable=True)
    location = Column(Text, nullable=True)
    linkedin_url = Column(Text, nullable=True)
    portfolio_url = Column(Text, nullable=True)
    summary = Column(Text, nullable=True)
    education = Column(JSONB, default=[])
    experience = Column(JSONB, default=[])
    skills = Column(ARRAY(String), default=[])
    certifications = Column(JSONB, default=[])
    publications = Column(JSONB, default=[])
    languages = Column(JSONB, default=[])
    projects = Column(JSONB, default=[])
    research_projects = Column(JSONB, default=[])
    awards = Column(JSONB, default=[])
    ref_list = Column(JSONB, default=[])

    # AI analysis
    analysis = Column(JSONB, default={})
    issues = Column(JSONB, default=[])
    ai_suggestions = Column(Text, nullable=True)
    overall_score = Column(Integer, nullable=True)
    section_scores = Column(JSONB, default={})
    raw_text = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
