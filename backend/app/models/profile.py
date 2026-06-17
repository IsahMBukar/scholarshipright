import uuid
from datetime import datetime, timezone, date
from sqlalchemy import Column, String, DateTime, Date, Integer, Numeric, Boolean, ForeignKey, Float
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from app.db.session import Base


class Profile(Base):
    __tablename__ = "profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Academic background
    degree_level = Column(String, nullable=True)
    cgpa = Column(Numeric(3, 2), nullable=True)
    cgpa_scale = Column(Numeric(3, 1), nullable=True)
    degree_class = Column(String, nullable=True)
    field_of_study = Column(String, nullable=True)
    graduation_year = Column(Integer, nullable=True)
    university = Column(String, nullable=True)
    country_of_origin = Column(String, nullable=True)

    # Research & experience
    research_interests = Column(ARRAY(String), default=[])
    work_experience_years = Column(Integer, nullable=True)

    # Target preferences
    target_degree = Column(String, nullable=True)
    target_fields = Column(ARRAY(String), default=[])
    target_start_date = Column(Date, nullable=True)
    target_countries = Column(ARRAY(String), default=[])
    has_ielts = Column(Boolean, default=False)
    ielts_score = Column(Numeric(3, 1), nullable=True)

    # Embedding (stored as float array — no pgvector needed)
    embedding = Column(ARRAY(Float), nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
