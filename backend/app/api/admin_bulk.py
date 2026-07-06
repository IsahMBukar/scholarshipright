"""
Admin API: Bulk scholarship import.

POST /api/admin/scholarships/bulk-import
  Accepts multiple URLs or JSON payloads.
  Each URL is extracted via Claude API, then submitted to review queue.
  Returns per-item results (success/skip/fail).

Supports two input modes:
  1. URLs: { "urls": ["https://...", "https://..."] }
  2. JSON records: { "records": [{ "name": "...", ... }, ...] }
"""
import asyncio
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.admin import require_admin
from app.db.session import get_db
from app.models.user import User
from app.models.scholarship import Scholarship
from app.models.pending_scholarship import PendingScholarship
from app.services.url_extractor import extract_from_url
from app.services.admin_audit import log_admin_action

import logging

router = APIRouter()
logger = logging.getLogger("scholara.admin.bulk")


class BulkImportUrls(BaseModel):
    urls: List[str] = Field(..., min_length=1, max_length=50, description="List of scholarship URLs to extract and import")


class BulkImportRecords(BaseModel):
    records: List[Dict[str, Any]] = Field(..., min_length=1, max_length=50, description="List of scholarship data records")


class BulkResult(BaseModel):
    index: int
    url: Optional[str] = None
    name: Optional[str] = None
    status: str  # "submitted" | "duplicate" | "error"
    pending_id: Optional[str] = None
    error: Optional[str] = None


class BulkImportResponse(BaseModel):
    total: int
    submitted: int
    duplicates: int
    errors: int
    results: List[BulkResult]


@router.post("/scholarships/bulk-import", response_model=BulkImportResponse)
async def bulk_import_urls(
    body: BulkImportUrls,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Bulk import scholarships from URLs.

    Each URL is extracted via Claude API, checked for duplicates,
    and submitted to the review queue.
    """
    results: List[BulkResult] = []
    submitted = 0
    duplicates = 0
    errors = 0

    for i, url in enumerate(body.urls):
        url = url.strip()
        if not url:
            results.append(BulkResult(index=i, url=url, status="error", error="Empty URL"))
            errors += 1
            continue

        try:
            # Extract scholarship data from URL
            data = await extract_from_url(url)
            name = data.get("name", "Unknown")

            # Check for duplicates
            existing = await db.execute(
                select(Scholarship).where(
                    func.lower(Scholarship.name).ilike(f"%{name.lower().strip()}%")
                ).limit(1)
            )
            if existing.scalar_one_or_none():
                results.append(BulkResult(
                    index=i, url=url, name=name,
                    status="duplicate",
                    error=f"Similar scholarship already exists: {name}"
                ))
                duplicates += 1
                continue

            # Check pending queue too
            pending_check = await db.execute(
                select(PendingScholarship).where(
                    PendingScholarship.status == "pending_review"
                )
            )
            pending_dupes = [
                p for p in pending_check.scalars().all()
                if p.payload.get("name", "").lower() == name.lower()
            ]
            if pending_dupes:
                results.append(BulkResult(
                    index=i, url=url, name=name,
                    status="duplicate",
                    error=f"Already in review queue: {name}"
                ))
                duplicates += 1
                continue

            # Submit to review queue
            pending = PendingScholarship(
                payload=data,
                submitted_by="admin_bulk",
                status="pending_review",
            )
            db.add(pending)
            await db.flush()

            results.append(BulkResult(
                index=i, url=url, name=name,
                status="submitted",
                pending_id=str(pending.id),
            ))
            submitted += 1

        except Exception as e:
            logger.error("Bulk import failed for %s: %s", url, e)
            results.append(BulkResult(
                index=i, url=url,
                status="error",
                error=str(e),
            ))
            errors += 1

    await db.commit()

    await log_admin_action(
        db, admin.id, admin.email, "scholarship.bulk_import", "scholarship",
        payload={"total": len(body.urls), "submitted": submitted, "duplicates": duplicates, "errors": errors}
    )

    return BulkImportResponse(
        total=len(body.urls),
        submitted=submitted,
        duplicates=duplicates,
        errors=errors,
        results=results,
    )


@router.post("/scholarships/bulk-import-records", response_model=BulkImportResponse)
async def bulk_import_records(
    body: BulkImportRecords,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Bulk import scholarships from pre-extracted JSON records.

    Each record should match the AdminScholarshipCreate schema.
    """
    results: List[BulkResult] = []
    submitted = 0
    duplicates = 0
    errors = 0

    for i, record in enumerate(body.records):
        name = record.get("name", "Unknown")
        if not name or name == "Unknown":
            results.append(BulkResult(index=i, name=name, status="error", error="Missing name"))
            errors += 1
            continue

        # Check for duplicates
        existing = await db.execute(
            select(Scholarship).where(
                func.lower(Scholarship.name).ilike(f"%{name.lower().strip()}%")
            ).limit(1)
        )
        if existing.scalar_one_or_none():
            results.append(BulkResult(
                index=i, name=name, status="duplicate",
                error=f"Similar scholarship already exists"
            ))
            duplicates += 1
            continue

        # Submit to review queue
        pending = PendingScholarship(
            payload=record,
            submitted_by="admin_bulk_records",
            status="pending_review",
        )
        db.add(pending)
        await db.flush()

        results.append(BulkResult(
            index=i, name=name, status="submitted",
            pending_id=str(pending.id),
        ))
        submitted += 1

    await db.commit()

    await log_admin_action(
        db, admin.id, admin.email, "scholarship.bulk_import_records", "scholarship",
        payload={"total": len(body.records), "submitted": submitted, "duplicates": duplicates, "errors": errors}
    )

    return BulkImportResponse(
        total=len(body.records),
        submitted=submitted,
        duplicates=duplicates,
        errors=errors,
        results=results,
    )
