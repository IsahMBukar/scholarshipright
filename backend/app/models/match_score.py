import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Numeric, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.db.session import Base


class MatchScore(Base):
    __tablename__ = "match_scores"
    __table_args__ = (UniqueConstraint("user_id", "scholarship_id"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    scholarship_id = Column(UUID(as_uuid=True), ForeignKey("scholarships.id", ondelete="CASCADE"), nullable=False, index=True)
    score = Column(Numeric(5, 2), nullable=True)  # 0.00 to 100.00
    breakdown = Column(JSONB, nullable=True)  # { semantic: 72, field: 10, country: 10, ... }
    computed_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
