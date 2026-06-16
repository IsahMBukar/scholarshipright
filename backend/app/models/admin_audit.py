"""
Admin audit log — tracks every admin write for compliance + debugging.

Schema:
    admin_audit_log(
        id uuid pk,
        admin_id uuid fk -> users.id,  -- who did it
        admin_email varchar(255),       -- denormalized for fast display
        action varchar(64),             -- e.g. "scholarship.update"
        target_type varchar(32),        -- e.g. "scholarship", "user"
        target_id varchar(64),          -- e.g. scholarship slug, user id
        payload jsonb,                  -- request body or relevant diff
        created_at timestamptz default now()
    )
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy import text as sa_text

from app.db.session import Base, engine


class AdminAuditLog(Base):
    __tablename__ = "admin_audit_log"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    admin_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    admin_email = Column(String(255), nullable=True)
    action = Column(String(64), nullable=False, index=True)
    target_type = Column(String(32), nullable=False, index=True)
    target_id = Column(String(64), nullable=True, index=True)
    payload = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True)


async def ensure_audit_schema_columns() -> None:
    """Idempotent runtime migration for the admin_audit_log table.

    Pairs with the AdminAuditLog model. Safe to run on every startup.
    """
    from app.db.session import engine
    try:
        async with engine.begin() as conn:
            await conn.execute(sa_text("""
                CREATE TABLE IF NOT EXISTS admin_audit_log (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
                    admin_email VARCHAR(255),
                    action VARCHAR(64) NOT NULL,
                    target_type VARCHAR(32) NOT NULL,
                    target_id VARCHAR(64),
                    payload JSONB,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )
            """))
            # Indexes for the most common query patterns
            await conn.execute(sa_text("CREATE INDEX IF NOT EXISTS ix_admin_audit_log_admin_id ON admin_audit_log (admin_id)"))
            await conn.execute(sa_text("CREATE INDEX IF NOT EXISTS ix_admin_audit_log_action ON admin_audit_log (action)"))
            await conn.execute(sa_text("CREATE INDEX IF NOT EXISTS ix_admin_audit_log_target_type ON admin_audit_log (target_type)"))
            await conn.execute(sa_text("CREATE INDEX IF NOT EXISTS ix_admin_audit_log_target_id ON admin_audit_log (target_id)"))
            await conn.execute(sa_text("CREATE INDEX IF NOT EXISTS ix_admin_audit_log_created_at ON admin_audit_log (created_at DESC)"))
    except Exception as e:  # noqa: BLE001
        # Don't crash startup for a migration problem.
        from app.core.admin import logger  # late import to avoid circular
        logger.exception("ensure_audit_schema_columns failed: %s", e)
