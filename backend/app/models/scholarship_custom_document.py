"""Custom/flexible required documents for a scholarship.

The existing fixed boolean fields (req_transcripts, req_cv_resume, etc.)
cover standard academic documents. This table lets admins add any
additional document requirement per scholarship — portfolio, video essay,
workshop certificate, event registration, etc.

Documents can be global (degree_level=NULL, applies to all levels) or
per-level (degree_level set, only shown for that level).
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Column, String, DateTime, Integer, Boolean, Text, ForeignKey,
)
from sqlalchemy.dialects.postgresql import UUID

from app.db.session import Base


class ScholarshipCustomDocument(Base):
    __tablename__ = "scholarship_custom_documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scholarship_id = Column(
        UUID(as_uuid=True),
        ForeignKey("scholarships.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # If set, this document only applies to that degree level.
    # If NULL, it applies to all levels (global).
    degree_level = Column(String(32), nullable=True)

    # Document details
    name = Column(String(256), nullable=False)
    description = Column(Text, nullable=True)  # e.g., "5-10 pieces of original work"
    required = Column(Boolean, default=True, nullable=False)

    # Display ordering (lower = higher priority)
    position = Column(Integer, default=0, nullable=False)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


async def ensure_custom_documents_table() -> None:
    """Idempotent runtime migration — create the table if it doesn't exist."""
    from sqlalchemy import text
    from app.db.session import engine
    import logging

    logger = logging.getLogger(__name__)
    try:
        async with engine.begin() as conn:
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS scholarship_custom_documents (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    scholarship_id UUID NOT NULL REFERENCES scholarships(id) ON DELETE CASCADE,
                    degree_level VARCHAR(32),
                    name VARCHAR(256) NOT NULL,
                    description TEXT,
                    required BOOLEAN NOT NULL DEFAULT TRUE,
                    position INTEGER NOT NULL DEFAULT 0,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                )
            """))
            await conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_custom_docs_scholarship_id "
                "ON scholarship_custom_documents(scholarship_id)"
            ))
        logger.info("scholarship_custom_documents table ensured")
    except Exception as e:
        logger.exception("ensure_custom_documents_table failed: %s", e)
