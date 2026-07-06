"""Tests for scholarship models and schema validation."""
import uuid
from datetime import date

import pytest
from sqlalchemy import select

from app.models.scholarship import Scholarship
from app.models.pending_scholarship import PendingScholarship


class TestScholarshipModel:
    """Tests for the Scholarship SQLAlchemy model."""

    @pytest.mark.asyncio
    async def test_create_scholarship(self, db):
        sch = Scholarship(
            name="Test Scholarship",
            slug="test-scholarship",
            host_country="UK",
            funding_type="fully_funded",
            deadline=date(2026, 12, 1),
            official_url="https://example.com",
        )
        db.add(sch)
        await db.commit()

        result = await db.execute(select(Scholarship).where(Scholarship.slug == "test-scholarship"))
        saved = result.scalar_one()
        assert saved.name == "Test Scholarship"
        assert saved.host_country == "UK"
        assert saved.funding_type == "fully_funded"
        assert saved.is_active is True  # default

    @pytest.mark.asyncio
    async def test_scholarship_defaults(self, db):
        sch = Scholarship(
            name="Defaults Test",
            slug="defaults-test",
            host_country="Germany",
            funding_type="partial",
            deadline=date(2026, 6, 1),
            official_url="https://example.com",
        )
        db.add(sch)
        await db.commit()

        assert sch.is_active is True
        assert sch.is_verified is False
        assert sch.covers_tuition is True
        assert sch.covers_living is False
        assert sch.covers_flight is False
        assert sch.requires_ielts is True
        assert sch.requires_gre is False
        assert sch.view_count == 0
        assert sch.application_count == 0

    @pytest.mark.asyncio
    async def test_scholarship_array_fields(self, db):
        sch = Scholarship(
            name="Array Test",
            slug="array-test",
            host_country="France",
            funding_type="fully_funded",
            deadline=date(2026, 9, 1),
            official_url="https://example.com",
            degree_levels=["master", "phd"],
            fields_of_study=["engineering", "science"],
            eligible_nationalities=["All countries"],
        )
        db.add(sch)
        await db.commit()

        assert sch.degree_levels == ["master", "phd"]
        assert "engineering" in sch.fields_of_study
        assert len(sch.eligible_nationalities) == 1


class TestPendingScholarshipModel:
    """Tests for the PendingScholarship model."""

    @pytest.mark.asyncio
    async def test_create_pending(self, db):
        pending = PendingScholarship(
            payload={"name": "Pending Test", "host_country": "Japan"},
            submitted_by="mcp:agent",
            status="pending_review",
        )
        db.add(pending)
        await db.commit()

        result = await db.execute(
            select(PendingScholarship).where(PendingScholarship.submitted_by == "mcp:agent")
        )
        saved = result.scalar_one()
        assert saved.status == "pending_review"
        assert saved.payload["name"] == "Pending Test"
        assert saved.approved_scholarship_id is None

    @pytest.mark.asyncio
    async def test_pending_status_transitions(self, db):
        pending = PendingScholarship(
            payload={"name": "Status Test"},
            submitted_by="admin",
            status="pending_review",
        )
        db.add(pending)
        await db.commit()

        # Approve
        pending.status = "approved"
        pending.reviewed_at = datetime.now(timezone.utc)
        await db.commit()
        assert pending.status == "approved"

    @pytest.mark.asyncio
    async def test_pending_jsonb_payload(self, db):
        """Payload should store arbitrary JSON."""
        complex_payload = {
            "name": "Complex",
            "degree_levels": ["master", "phd"],
            "covers_tuition": True,
            "monthly_stipend_usd": 1500,
            "nested": {"key": "value"},
        }
        pending = PendingScholarship(
            payload=complex_payload,
            submitted_by="test",
            status="pending_review",
        )
        db.add(pending)
        await db.commit()

        result = await db.execute(select(PendingScholarship).where(PendingScholarship.id == pending.id))
        saved = result.scalar_one()
        assert saved.payload["monthly_stipend_usd"] == 1500
        assert saved.payload["nested"]["key"] == "value"


from datetime import datetime, timezone
