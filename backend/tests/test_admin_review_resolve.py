"""Tests for the admin review re-resolve error path.

When resolve_eligibility raises (e.g. transient DB error), the helper
must flag the scholarship as eligibility_unresolved=True and empty
resolved_countries — never silently leave it as "all countries".
"""
import uuid
from datetime import date, datetime, timezone
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin_review import _re_resolve_scholarship_eligibility
from app.models.scholarship import Scholarship


@pytest_asyncio.fixture
async def sample_scholarship(db: AsyncSession) -> Scholarship:
    sch = Scholarship(
        id=uuid.uuid4(),
        name="Resolve Test",
        slug="resolve-test",
        host_country="Nigeria",
        funding_type="fully_funded",
        deadline=date(2026, 11, 1),
        official_url="https://example.com/resolve-test",
        # Structured eligibility so the resolver actually runs.
        included_groups=["AU"],
        included_countries=["NG"],
        excluded_countries=["PK"],
    )
    db.add(sch)
    await db.commit()
    await db.refresh(sch)
    return sch


class TestReResolveScholarshipEligibility:
    """Direct tests for the helper used by both approve paths."""

    async def test_succeeds_and_persists(self, db, sample_scholarship):
        """Happy path: resolver returns, state is written to the row.

        Uses only included_countries (no groups) so the resolver does
        not depend on group fixtures that may not exist in the test DB.
        """
        sample_scholarship.included_groups = []
        sample_scholarship.included_countries = ["NG", "KE"]
        sample_scholarship.excluded_countries = ["PK"]
        await db.commit()
        await db.refresh(sample_scholarship)

        ok = await _re_resolve_scholarship_eligibility(
            sample_scholarship,
            db,
            failure_log_context="test-happy",
        )
        assert ok is True
        await db.refresh(sample_scholarship)
        # The scholarship should now have resolved_countries populated.
        assert len(sample_scholarship.resolved_countries) > 0
        # Initial state was eligibility_unresolved=False (default).
        assert sample_scholarship.eligibility_unresolved is False
        assert sample_scholarship.groups_resolved_at is not None

    async def test_returns_true_when_no_structured_eligibility(self, db):
        """A scholarship with no included_* or excluded_* is a no-op."""
        sch = Scholarship(
            id=uuid.uuid4(),
            name="No Structured",
            slug="no-structured",
            host_country="UK",
            funding_type="fully_funded",
            deadline=date(2026, 11, 1),
            official_url="https://example.com/no-structured",
            is_active=True,
        )
        db.add(sch)
        await db.commit()
        await db.refresh(sch)

        ok = await _re_resolve_scholarship_eligibility(
            sch, db, failure_log_context="test-noop",
        )
        assert ok is True
        # Nothing should have been written.
        await db.refresh(sch)
        assert sch.resolved_countries == []
        assert sch.eligibility_unresolved is False
        assert sch.groups_resolved_at is None

    async def test_resolver_failure_flags_unresolved(self, db, sample_scholarship):
        """When resolve_eligibility raises, the scholarship is flagged."""
        with patch(
            "app.api.admin_review.resolve_eligibility",
            new_callable=AsyncMock,
            side_effect=RuntimeError("simulated DB failure"),
        ):
            ok = await _re_resolve_scholarship_eligibility(
                sample_scholarship,
                db,
                failure_log_context="test-failure",
            )

        assert ok is False
        await db.refresh(sample_scholarship)
        # Hard fail-open: flagged, not silently "all countries".
        assert sample_scholarship.eligibility_unresolved is True
        assert sample_scholarship.resolved_countries == []
        # Cleared so a retry can re-resolve cleanly.
        assert sample_scholarship.groups_resolved_at is None

    async def test_resolver_failure_persists_even_if_flag_set_also_fails(
        self, db, sample_scholarship
    ):
        """If the resolver AND the flag-set both fail, helper still returns False
        and never raises to the caller."""
        with patch(
            "app.api.admin_review.resolve_eligibility",
            new_callable=AsyncMock,
            side_effect=RuntimeError("first failure"),
        ):
            # Make the second commit fail too. We patch db.commit on the
            # session instance — but the helper uses `db` directly.
            # Easier: raise from commit by patching a second time.
            with patch.object(
                db, "commit", new_callable=AsyncMock,
                side_effect=RuntimeError("second failure"),
            ):
                ok = await _re_resolve_scholarship_eligibility(
                    sample_scholarship,
                    db,
                    failure_log_context="test-double-fail",
                )
        # Helper must not raise even when both paths fail.
        assert ok is False
