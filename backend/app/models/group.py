"""Reusable country groups for scholarship eligibility.

A group is a named set of ISO 3166-1 alpha-2 country codes. Scholarships
reference groups by code in their included_groups / excluded_groups arrays.
When a group's membership changes, all referencing scholarships must be
re-resolved.
"""
import uuid
from datetime import datetime, timezone, date as date_type
from sqlalchemy import Column, String, DateTime, Date, Text, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from app.db.session import Base


class Group(Base):
    __tablename__ = "groups"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code = Column(String, unique=True, nullable=False, index=True)       # slug: "NIIED", "EU"
    name = Column(String, nullable=False)                                 # display name
    description = Column(Text, nullable=True)
    source_url = Column(String, nullable=True)
    source_date = Column(Date, nullable=True)
    status = Column(String, nullable=False, default="active")            # 'active' | 'deprecated'
    created_by = Column(UUID(as_uuid=True), nullable=True)               # admin user id
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))


class GroupMember(Base):
    __tablename__ = "group_members"

    group_id = Column(UUID(as_uuid=True), ForeignKey("groups.id", ondelete="CASCADE"), primary_key=True)
    country_code = Column(String(2), ForeignKey("countries.code"), primary_key=True)
