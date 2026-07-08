"""Per-degree-level required documents for a scholarship.

When a scholarship targets multiple degree levels (e.g. Bachelor + Master + PhD),
each level can have different required documents. This table stores those
overrides. If no rows exist for a scholarship, the flat fields on the
Scholarship model are used as the fallback (backwards compatible).

A scholarship can have at most one row per degree_level (enforced by
unique constraint on scholarship_id + degree_level).
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Column, String, DateTime, Integer, Boolean, Text, ForeignKey, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID

from app.db.session import Base


class ScholarshipDegreeDocument(Base):
    __tablename__ = "scholarship_degree_documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scholarship_id = Column(
        UUID(as_uuid=True),
        ForeignKey("scholarships.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # 'bachelor' | 'master' | 'phd'
    degree_level = Column(String(16), nullable=False)

    # ── 8 standard boolean toggles ──
    req_transcripts = Column(Boolean, default=True, nullable=False)
    req_cv_resume = Column(Boolean, default=True, nullable=False)
    req_sop_motivation_letter = Column(Boolean, default=True, nullable=False)
    req_recommendation_letters = Column(Boolean, default=True, nullable=False)
    req_english_test = Column(Boolean, default=True, nullable=False)
    req_passport_or_id = Column(Boolean, default=True, nullable=False)
    req_financial_proof = Column(Boolean, default=False, nullable=False)
    req_photo = Column(Boolean, default=False, nullable=False)

    # ── Cement + flexible fields ──
    # previous_degree_required: auto-derived if None (bachelor→high_school,
    # master→bachelor, phd→master). Admin can override.
    previous_degree_required = Column(String(32), nullable=True)
    recommendation_letters_count = Column(Integer, nullable=True)
    research_proposal_required = Column(Boolean, nullable=True)
    writing_sample_required = Column(Boolean, nullable=True)
    standardized_test = Column(String(32), nullable=True)

    # Long-tail free text
    additional_required_documents = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        UniqueConstraint("scholarship_id", "degree_level", name="uq_scholarship_degree_level"),
    )


def auto_derive_for_level(degree_level: str) -> dict:
    """Return sensible defaults for a given degree_level.

    Used when admin creates a per-level doc row without specifying all fields.
    """
    level = (degree_level or "").lower()

    if "direct" in level and "phd" in level:
        # Direct-entry PhD (BSc → PhD, skipping master's)
        return {
            "previous_degree_required": "bachelor_degree",
            "recommendation_letters_count": 3,
            "research_proposal_required": True,
            "writing_sample_required": False,
            "standardized_test": "gre",
        }
    elif "postdoc" in level or "post-doc" in level or "post_doc" in level:
        # Postdoctoral — requires PhD, no standardized test
        return {
            "previous_degree_required": "phd_degree",
            "recommendation_letters_count": 3,
            "research_proposal_required": True,
            "writing_sample_required": True,
            "standardized_test": "none",
        }
    elif "phd" in level or "doctoral" in level or "doctorate" in level:
        return {
            "previous_degree_required": "master_degree",
            "recommendation_letters_count": 3,
            "research_proposal_required": True,
            "writing_sample_required": False,
            "standardized_test": "gre",
        }
    elif "master" in level or "msc" in level or "mba" in level:
        return {
            "previous_degree_required": "bachelor_degree",
            "recommendation_letters_count": 2,
            "research_proposal_required": False,
            "writing_sample_required": False,
            "standardized_test": "gre_gmat",
        }
    else:  # bachelor / undergraduate / fallback
        return {
            "previous_degree_required": "high_school_diploma",
            "recommendation_letters_count": 2,
            "research_proposal_required": False,
            "writing_sample_required": False,
            "standardized_test": "sat_act",
        }


async def ensure_degree_documents_table() -> None:
    """Idempotent runtime migration — create the table if it doesn't exist."""
    from sqlalchemy import text
    from app.db.session import engine
    import logging

    logger = logging.getLogger(__name__)
    try:
        async with engine.begin() as conn:
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS scholarship_degree_documents (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    scholarship_id UUID NOT NULL REFERENCES scholarships(id) ON DELETE CASCADE,
                    degree_level VARCHAR(16) NOT NULL,
                    req_transcripts BOOLEAN NOT NULL DEFAULT TRUE,
                    req_cv_resume BOOLEAN NOT NULL DEFAULT TRUE,
                    req_sop_motivation_letter BOOLEAN NOT NULL DEFAULT TRUE,
                    req_recommendation_letters BOOLEAN NOT NULL DEFAULT TRUE,
                    req_english_test BOOLEAN NOT NULL DEFAULT TRUE,
                    req_passport_or_id BOOLEAN NOT NULL DEFAULT TRUE,
                    req_financial_proof BOOLEAN NOT NULL DEFAULT FALSE,
                    req_photo BOOLEAN NOT NULL DEFAULT FALSE,
                    previous_degree_required VARCHAR(32),
                    recommendation_letters_count INTEGER,
                    research_proposal_required BOOLEAN,
                    writing_sample_required BOOLEAN,
                    standardized_test VARCHAR(32),
                    additional_required_documents TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW(),
                    UNIQUE (scholarship_id, degree_level)
                )
            """))
            # Index for fast lookups by scholarship_id
            await conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_degree_docs_scholarship_id "
                "ON scholarship_degree_documents(scholarship_id)"
            ))
        logger.info("scholarship_degree_documents table ensured")
    except Exception as e:
        logger.exception("ensure_degree_documents_table failed: %s", e)
