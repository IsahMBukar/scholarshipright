import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Boolean
from sqlalchemy.dialects.postgresql import UUID
from app.db.session import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, nullable=False, index=True)
    full_name = Column(String, nullable=True)
    password_hash = Column(String, nullable=True)  # Null for magic-link users
    is_active = Column(Boolean, default=True)
    # Admin access. `is_admin=True` unlocks the /admin/* routes.
    # `admin_role` is one of: "super_admin" (full access), "support_staff"
    # (read all + edit scholarships/users, but no destructive ops).
    # NULL means "not an admin" (normal user).
    is_admin = Column(Boolean, default=False, nullable=False)
    admin_role = Column(String(20), nullable=True, index=True)
    # Auto-recompute signals for match scores. `match_dirty=True` means the next
    # match GET should (re)compute instead of returning the cached table.
    match_dirty = Column(Boolean, default=True, nullable=False)
    match_invalidated_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
