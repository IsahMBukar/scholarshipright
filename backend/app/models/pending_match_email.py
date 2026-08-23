import logging
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Float, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from app.db.session import Base

logger = logging.getLogger(__name__)


class PendingMatchEmail(Base):
    """Queue row for the daily match bundle email.

    Instead of emailing users instantly every time a scholarship crosses
    their 70% threshold, we write a row here and a daily loop
    (services/daily_match_bundle.py) bundles them into ONE email per user.
    """

    __tablename__ = "pending_match_emails"
    __table_args__ = (
        UniqueConstraint("user_id", "scholarship_id", name="uq_pending_match_user_scholarship"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    scholarship_id = Column(UUID(as_uuid=True), ForeignKey("scholarships.id", ondelete="CASCADE"), nullable=False, index=True)
    score = Column(Float, nullable=False)
    # "new" — first time this scholarship scored ≥70% for the user
    # "improved" — an existing match jumped ≥10 pts or crossed the 80 tier
    kind = Column(String(16), nullable=False, default="new", server_default="new")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


async def ensure_pending_match_emails_table() -> None:
    """Idempotent runtime migration for the pending_match_emails table."""
    from sqlalchemy import text as sa_text
    from app.db.session import engine
    try:
        async with engine.begin() as conn:
            await conn.execute(sa_text("""
                CREATE TABLE IF NOT EXISTS pending_match_emails (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    scholarship_id UUID NOT NULL REFERENCES scholarships(id) ON DELETE CASCADE,
                    score DOUBLE PRECISION NOT NULL,
                    kind VARCHAR(16) NOT NULL DEFAULT 'new',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    CONSTRAINT uq_pending_match_user_scholarship UNIQUE (user_id, scholarship_id)
                )
            """))
            await conn.execute(sa_text(
                "ALTER TABLE pending_match_emails ADD COLUMN IF NOT EXISTS kind VARCHAR(16) NOT NULL DEFAULT 'new'"
            ))
            await conn.execute(sa_text(
                "CREATE INDEX IF NOT EXISTS ix_pending_match_emails_user_id "
                "ON pending_match_emails (user_id)"
            ))
            await conn.execute(sa_text(
                "CREATE INDEX IF NOT EXISTS ix_pending_match_emails_scholarship_id "
                "ON pending_match_emails (scholarship_id)"
            ))
    except Exception:
        logger.exception("ensure_pending_match_emails_table failed")
