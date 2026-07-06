"""Tests for the admin review queue — DB-level only."""
import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import select

from app.models.pending_scholarship import PendingScholarship
from app.models.scholarship import Scholarship


class TestReviewApprove:
    @pytest.mark.asyncio
    async def test_approve_creates_scholarship(self, db, sample_pending):
        pending = sample_pending
        assert pending.status == "pending_review"

        payload = dict(pending.payload)
        payload.setdefault("slug", "approved-test")
        from datetime import date as date_type
        for field in ("deadline", "open_date", "program_start_date"):
            if field in payload and isinstance(payload[field], str):
                try:
                    payload[field] = date_type.fromisoformat(payload[field])
                except (ValueError, TypeError):
                    payload.pop(field, None)

        safe_fields = {c.name for c in Scholarship.__table__.columns}
        filtered = {k: v for k, v in payload.items() if k in safe_fields}
        filtered["slug"] = "approved-test-slug"
        sch = Scholarship(**filtered)
        db.add(sch)
        await db.flush()

        pending.status = "approved"
        pending.approved_scholarship_id = sch.id
        await db.commit()

        assert pending.status == "approved"
        result = await db.execute(select(Scholarship).where(Scholarship.id == sch.id))
        assert result.scalar_one().name == "Pending Scholarship"


class TestReviewReject:
    @pytest.mark.asyncio
    async def test_reject_sets_reason(self, db, sample_pending):
        pending = sample_pending
        pending.status = "rejected"
        pending.rejection_reason = "Duplicate entry"
        pending.reviewed_at = datetime.now(timezone.utc)
        await db.commit()

        result = await db.execute(
            select(PendingScholarship).where(PendingScholarship.id == pending.id)
        )
        updated = result.scalar_one()
        assert updated.status == "rejected"
        assert updated.rejection_reason == "Duplicate entry"


class TestReviewSubmit:
    @pytest.mark.asyncio
    async def test_submit_to_queue(self, db):
        pending = PendingScholarship(
            payload={"name": "Submitted via API", "host_country": "Canada"},
            submitted_by="admin_url",
            status="pending_review",
        )
        db.add(pending)
        await db.commit()

        result = await db.execute(
            select(PendingScholarship).where(PendingScholarship.submitted_by == "admin_url")
        )
        saved = result.scalar_one()
        assert saved.payload["name"] == "Submitted via API"
