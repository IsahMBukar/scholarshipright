"""
Pending scholarship review queue.

MCP agents and the URL scraper submit scholarships here with
status='pending_review'. Admins approve (→ creates real scholarship)
or reject (→ stays here with rejection_reason for audit).

Schema:
    pending_scholarships(
        id uuid pk,
        -- The scholarship data as submitted (full JSON blob matching
        -- AdminScholarshipCreate shape, minus slug which is generated
        -- on approve).
        payload jsonb NOT NULL,
        -- Where it came from: 'mcp:<key_name>' | 'admin_url' | 'admin_bulk' | 'scraper'
        submitted_by varchar(128) NOT NULL,
        -- If submitted via MCP, the agent's API key id for traceability
        agent_key_id uuid NULL,
        -- Review status
        status varchar(32) NOT NULL DEFAULT 'pending_review',
        -- 'pending_review' | 'approved' | 'rejected'
        -- Review metadata
        reviewed_by uuid NULL REFERENCES users(id),
        reviewed_at timestamptz NULL,
        rejection_reason text NULL,
        -- If approved, the created scholarship id
        approved_scholarship_id uuid NULL REFERENCES scholarships(id),
        -- Duplicate detection: if admin flagged as duplicate
        duplicate_of uuid NULL REFERENCES scholarships(id),
        -- Timestamps
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    )
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy import text as sa_text

from app.db.session import Base, engine


class PendingScholarship(Base):
    __tablename__ = "pending_scholarships"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    payload = Column(JSONB, nullable=False)
    submitted_by = Column(String(128), nullable=False, index=True)
    agent_key_id = Column(UUID(as_uuid=True), nullable=True)
    status = Column(String(32), nullable=False, default="pending_review", index=True)
    reviewed_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    rejection_reason = Column(Text, nullable=True)
    approved_scholarship_id = Column(UUID(as_uuid=True), ForeignKey("scholarships.id", ondelete="SET NULL"), nullable=True)
    duplicate_of = Column(UUID(as_uuid=True), ForeignKey("scholarships.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)


async def ensure_pending_scholarships_table() -> None:
    """Idempotent runtime migration for the pending_scholarships table.

    Called from the FastAPI lifespan handler on every startup.
    """
    try:
        async with engine.begin() as conn:
            await conn.execute(sa_text("""
                CREATE TABLE IF NOT EXISTS pending_scholarships (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    payload JSONB NOT NULL,
                    submitted_by VARCHAR(128) NOT NULL,
                    agent_key_id UUID,
                    status VARCHAR(32) NOT NULL DEFAULT 'pending_review',
                    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
                    reviewed_at TIMESTAMPTZ,
                    rejection_reason TEXT,
                    approved_scholarship_id UUID REFERENCES scholarships(id) ON DELETE SET NULL,
                    duplicate_of UUID REFERENCES scholarships(id) ON DELETE SET NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )
            """))
            await conn.execute(sa_text("CREATE INDEX IF NOT EXISTS ix_pending_scholarships_status ON pending_scholarships (status)"))
            await conn.execute(sa_text("CREATE INDEX IF NOT EXISTS ix_pending_scholarships_submitted_by ON pending_scholarships (submitted_by)"))
            await conn.execute(sa_text("CREATE INDEX IF NOT EXISTS ix_pending_scholarships_created_at ON pending_scholarships (created_at)"))
    except Exception:
        import logging
        logging.getLogger("scholarshipright.startup").exception("ensure_pending_scholarships_table failed")
