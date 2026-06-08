import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Boolean, Text, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from app.db.session import Base


class SavedScholarship(Base):
    __tablename__ = "saved_scholarships"
    __table_args__ = (UniqueConstraint("user_id", "scholarship_id"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    scholarship_id = Column(UUID(as_uuid=True), ForeignKey("scholarships.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String, default="saved")  # 'saved', 'applying', 'applied', 'rejected', 'accepted'
    notes = Column(Text, nullable=True)
    reminder_enabled = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
