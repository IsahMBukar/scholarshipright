import uuid
from datetime import datetime, timezone, date
from sqlalchemy import Column, String, DateTime, Date, Integer, Numeric, Boolean, Text, Float
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from app.db.session import Base


class Scholarship(Base):
    __tablename__ = "scholarships"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Identity
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, nullable=False, index=True)
    host_country = Column(String, nullable=False)
    host_institution = Column(String, nullable=True)
    provider = Column(String, nullable=True)

    # Scope
    degree_levels = Column(ARRAY(String), default=[])
    fields_of_study = Column(ARRAY(String), default=[])
    eligible_nationalities = Column(ARRAY(String), default=[])
    eligible_regions = Column(ARRAY(String), default=[])

    # Funding
    funding_type = Column(String, nullable=False)
    covers_tuition = Column(Boolean, default=True)
    covers_living = Column(Boolean, default=False)
    covers_flight = Column(Boolean, default=False)
    covers_health = Column(Boolean, default=False)
    monthly_stipend_usd = Column(Integer, nullable=True)

    # Requirements
    requires_ielts = Column(Boolean, default=True)
    min_ielts_score = Column(Numeric(3, 1), nullable=True)
    requires_gre = Column(Boolean, default=False)
    requires_application_fee = Column(Boolean, default=False)
    min_cgpa = Column(Numeric(3, 2), nullable=True)
    language_of_instruction = Column(String, default="English")

    # Dates
    open_date = Column(Date, nullable=True)
    deadline = Column(Date, nullable=False)
    program_start_date = Column(Date, nullable=True)
    duration_months = Column(Integer, nullable=True)

    # Content
    description = Column(Text, nullable=True)
    benefits_summary = Column(Text, nullable=True)
    how_to_apply = Column(Text, nullable=True)
    official_url = Column(String, nullable=False)
    logo_url = Column(String, nullable=True)

    # Metadata
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    source = Column(String, nullable=True)
    view_count = Column(Integer, default=0)
    application_count = Column(Integer, default=0)

    # Embedding (stored as float array — no pgvector needed)
    embedding = Column(ARRAY(Float), nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
