import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from app.db.session import Base


class NotificationPreference(Base):
    __tablename__ = "notification_preferences"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)

    # ── Email alerts ─────────────────────────────────────────────────
    # New match alerts: when a new scholarship scores ≥ 70% for the user
    email_new_matches = Column(Boolean, default=True, nullable=False)
    # Match improvement alerts: when an existing match score increases significantly
    email_match_improvements = Column(Boolean, default=True, nullable=False)
    # Deadline reminders: 14/7/2-day reminders for saved scholarships
    email_deadline_reminders = Column(Boolean, default=True, nullable=False)
    # Weekly digest: top 5 matches summary every Sunday
    email_weekly_digest = Column(Boolean, default=True, nullable=False)
    # Marketing / product updates: new features, tips, etc.
    email_marketing = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


async def ensure_notification_preference_columns() -> None:
    """Idempotent runtime migration for the notification_preferences table."""
    from sqlalchemy import text as sa_text
    from app.db.session import engine
    try:
        async with engine.begin() as conn:
            await conn.execute(sa_text("""
                CREATE TABLE IF NOT EXISTS notification_preferences (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
                    email_new_matches BOOLEAN NOT NULL DEFAULT TRUE,
                    email_match_improvements BOOLEAN NOT NULL DEFAULT TRUE,
                    email_deadline_reminders BOOLEAN NOT NULL DEFAULT TRUE,
                    email_weekly_digest BOOLEAN NOT NULL DEFAULT TRUE,
                    email_marketing BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """))
            await conn.execute(sa_text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_notification_preferences_user_id "
                "ON notification_preferences (user_id)"
            ))
    except Exception as e:
        print(f"ensure_notification_preference_columns failed: {e}")


async def get_or_create_preferences(db, user_id):
    """Get existing preferences or create with defaults."""
    from sqlalchemy import select
    from app.models.notification_preference import NotificationPreference

    result = await db.execute(
        select(NotificationPreference).where(NotificationPreference.user_id == user_id)
    )
    prefs = result.scalar_one_or_none()
    if not prefs:
        prefs = NotificationPreference(user_id=user_id)
        db.add(prefs)
        await db.flush()
    return prefs
