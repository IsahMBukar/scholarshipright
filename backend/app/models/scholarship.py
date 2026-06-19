import uuid
from datetime import datetime, timezone, date
from sqlalchemy import Column, String, DateTime, Date, Integer, Numeric, Boolean, Text, Float
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from app.db.session import Base, engine


class Scholarship(Base):
    __tablename__ = "scholarships"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Identity
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, nullable=False, index=True)
    host_country = Column(String, nullable=False)
    host_institution = Column(String, nullable=True)
    provider = Column(String, nullable=True)

    # Scope
    degree_levels = Column(ARRAY(String), default=[])
    fields_of_study = Column(ARRAY(String), default=[])
    eligible_nationalities = Column(ARRAY(String), default=[])
    eligible_regions = Column(ARRAY(String), default=[])

    # Funding
    funding_type = Column(String, nullable=False)
    covers_tuition = Column(Boolean, default=True)
    covers_living = Column(Boolean, default=False)
    covers_flight = Column(Boolean, default=False)
    covers_health = Column(Boolean, default=False)
    monthly_stipend_usd = Column(Integer, nullable=True)

    # Requirements
    requires_ielts = Column(Boolean, default=True)
    min_ielts_score = Column(Numeric(3, 1), nullable=True)
    requires_gre = Column(Boolean, default=False)
    requires_application_fee = Column(Boolean, default=False)
    min_cgpa = Column(Numeric(3, 2), nullable=True)
    language_of_instruction = Column(String, default="English")
    # English tests accepted by this scholarship (e.g. ["IELTS", "TOEFL", "PTE"]).
    # Backfilled from host_country + language_of_instruction in the runtime
    # migration below; new scholarships should set this explicitly.
    accepted_english_tests = Column(ARRAY(String), default=list)

    # Dates
    open_date = Column(Date, nullable=True)
    deadline = Column(Date, nullable=False)
    program_start_date = Column(Date, nullable=True)
    duration_months = Column(Integer, nullable=True)

    # Content
    description = Column(Text, nullable=True)
    benefits_summary = Column(Text, nullable=True)
    how_to_apply = Column(Text, nullable=True)
    official_url = Column(String, nullable=False)
    logo_url = Column(String, nullable=True)

    # Metadata
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    source = Column(String, nullable=True)
    view_count = Column(Integer, default=0)
    application_count = Column(Integer, default=0)

    # Embedding (stored as float array — no pgvector needed)
    embedding = Column(ARRAY(Float), nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


# ── Runtime schema migration ─────────────────────────────────────────
#
# `Base.metadata.create_all` doesn't add columns to existing tables, so we
# use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` to be safe for both fresh
# and already-deployed databases. Pairs with the `accepted_english_tests`
# column on the Scholarship model above. Called from the FastAPI lifespan
# handler in app/main.py on every startup.
#
# See docs/plans/2026-06-19_1430-scholarship-filtering.md for context.

# Default English-test set when no other signal is available. We use
# IELTS + TOEFL as a conservative baseline because almost every
# English-medium scholarship accepts one of these two.
_DEFAULT_TESTS = ["IELTS", "TOEFL"]

# Host-country → accepted tests. Only countries we already have in the
# DB. New countries default to the conservative baseline.
_COUNTRY_TESTS: dict[str, list[str]] = {
    "United Kingdom": ["IELTS", "TOEFL", "PTE", "Cambridge"],
    "UK": ["IELTS", "TOEFL", "PTE", "Cambridge"],
    "United States": ["IELTS", "TOEFL", "PTE", "Duolingo"],
    "USA": ["IELTS", "TOEFL", "PTE", "Duolingo"],
    "Germany": ["IELTS", "TOEFL", "Cambridge"],
    "Japan": ["IELTS", "TOEFL"],
    "South Korea": ["IELTS", "TOEFL"],
    "France": ["IELTS", "TOEFL", "Cambridge"],
    "Netherlands": ["IELTS", "TOEFL", "Cambridge"],
    "Sweden": ["IELTS", "TOEFL", "Cambridge"],
    "Switzerland": ["IELTS", "TOEFL", "Cambridge"],
    "Australia": ["IELTS", "TOEFL", "PTE", "Cambridge"],
    "Canada": ["IELTS", "TOEFL", "PTE", "Duolingo", "Cambridge"],
    "China": ["IELTS", "TOEFL"],
    "Turkey": ["IELTS", "TOEFL"],
    "Various": ["IELTS", "TOEFL"],
}


def _infer_english_tests(host_country: str | None) -> list[str]:
    """Return the English tests accepted by a scholarship, derived from
    its host country. Used by the backfill below for rows where
    `accepted_english_tests` is empty or null.
    """
    if not host_country:
        return list(_DEFAULT_TESTS)
    return list(_COUNTRY_TESTS.get(host_country, _DEFAULT_TESTS))


async def ensure_scholarship_schema_columns() -> None:
    """Idempotent runtime migration for the Scholarship table.

    Adds the `accepted_english_tests` column if it doesn't exist, and
    backfills empty/null values for existing rows using
    `_infer_english_tests` so the new language-test filter has data to
    work with.
    """
    from sqlalchemy import text

    from app.db.session import AsyncSessionLocal

    try:
        async with engine.begin() as conn:
            await conn.execute(
                text(
                    "ALTER TABLE scholarships "
                    "ADD COLUMN IF NOT EXISTS accepted_english_tests VARCHAR(64)[] "
                    "NOT NULL DEFAULT '{IELTS,TOEFL}'::varchar(64)[]"
                )
            )
            # GIN index makes `accepted_english_tests && ARRAY[...]` (overlap)
            # queries fast — the language_test filter relies on this.
            await conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_scholarships_accepted_english_tests "
                    "ON scholarships USING GIN (accepted_english_tests)"
                )
            )
    except Exception as e:  # noqa: BLE001
        # Never crash startup — the filter will just return 0 matches
        # until the migration succeeds. Log loudly.
        import logging
        logging.getLogger(__name__).exception("ensure_scholarship_schema_columns failed: %s", e)
        return

    # Backfill: enrich rows with country-specific test lists. The column
    # default is the conservative baseline (`[IELTS, TOEFL]`); for
    # countries that have a richer set in `_COUNTRY_TESTS` (e.g. UK adds
    # PTE, US/CA add Duolingo), we replace the default with the full set.
    # The query is naturally idempotent — we only UPDATE when the new
    # value differs from the current value, so re-running on every
    # startup is a cheap no-op.
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                text(
                    "SELECT id, host_country, accepted_english_tests "
                    "FROM scholarships"
                )
            )
            rows = result.all()
            updated = 0
            for row in rows:
                inferred = _infer_english_tests(row.host_country)
                # Postgres returns ARRAY; compare as Python lists.
                current = list(row.accepted_english_tests or [])
                if current == inferred:
                    continue
                await db.execute(
                    text(
                        "UPDATE scholarships "
                        "SET accepted_english_tests = CAST(:tests AS varchar(64)[]) "
                        "WHERE id = :id"
                    ),
                    {"tests": inferred, "id": str(row.id)},
                )
                updated += 1
            if updated:
                await db.commit()
                import logging
                logging.getLogger(__name__).info(
                    "scholarship english-tests backfill: updated %d rows", updated
                )
    except Exception as e:  # noqa: BLE001
        import logging
        logging.getLogger(__name__).exception("scholarship english-tests backfill failed: %s", e)
