"""
Admin API: URL-based scholarship extraction.

POST /api/admin/scholarships/extract-url
  Takes a URL, fetches it, uses Claude to extract structured data.
  Returns pre-filled scholarship fields (does NOT create anything).

POST /api/admin/scholarships/extract-url-and-submit
  Same as above but also submits to the review queue.
  Returns the pending_scholarship record.

Both endpoints are lightweight — just HTTP calls, no heavy scraping.
"""
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.admin import require_admin
from app.db.session import get_db
from app.models.user import User
from app.models.pending_scholarship import PendingScholarship
from app.services.url_extractor import extract_from_url
from app.services.admin_audit import log_admin_action

import logging

router = APIRouter()
logger = logging.getLogger("scholara.admin.extract")


class ExtractUrlRequest(BaseModel):
    url: str = Field(..., description="URL to extract scholarship data from")


class ExtractUrlResponse(BaseModel):
    url: str
    data: Dict[str, Any]
    fields_found: int
    fields_missing: list[str]


class ExtractAndSubmitRequest(BaseModel):
    url: str = Field(..., description="URL to extract scholarship data from")
    submitted_by: str = Field("admin_url", description="Source identifier")


# Required fields by the backend
REQUIRED_FIELDS = {"name", "host_country", "funding_type", "deadline", "official_url"}


@router.post("/scholarships/extract-url", response_model=ExtractUrlResponse)
async def extract_url(
    body: ExtractUrlRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Extract scholarship data from a URL using Claude API.

    Returns pre-filled fields. Does NOT create anything.
    """
    try:
        data = await extract_from_url(body.url)
    except ValueError:
        logger.warning("Invalid URL for extraction: %s", body.url)
        raise HTTPException(400, "Invalid URL or unsupported page format.")
    except Exception as e:
        logger.exception("URL extraction failed for %s", body.url)
        raise HTTPException(500, "Extraction failed. Please try again.")

    # Count fields found/missing
    all_fields = {
        "name", "host_country", "funding_type", "deadline", "official_url",
        "host_institution", "provider", "degree_levels", "fields_of_study",
        "eligible_nationalities", "eligible_regions", "covers_tuition",
        "covers_living", "covers_flight", "covers_health", "monthly_stipend_usd",
        "requires_ielts", "min_ielts_score", "requires_gre", "min_cgpa",
        "language_of_instruction", "open_date", "program_start_date",
        "duration_months", "description", "benefits_summary", "how_to_apply",
    }
    found = [f for f in all_fields if data.get(f) is not None and data.get(f) != ""]
    missing = [f for f in all_fields if f not in found]

    await log_admin_action(
        db, admin.id, admin.email, "scholarship.extract_url", "scholarship", body.url,
        payload={"fields_found": len(found), "fields_missing": len(missing)}
    )

    return ExtractUrlResponse(
        url=body.url,
        data=data,
        fields_found=len(found),
        fields_missing=missing,
    )


@router.post("/scholarships/extract-url-and-submit")
async def extract_url_and_submit(
    body: ExtractAndSubmitRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Extract scholarship data from a URL AND submit to review queue.

    Returns the pending_scholarship record.
    """
    try:
        data = await extract_from_url(body.url)
    except ValueError:
        logger.warning("Invalid URL for extraction: %s", body.url)
        raise HTTPException(400, "Invalid URL or unsupported page format.")
    except Exception as e:
        logger.exception("URL extraction failed for %s", body.url)
        raise HTTPException(500, "Extraction failed. Please try again.")

    # Submit to review queue
    pending = PendingScholarship(
        payload=data,
        submitted_by=body.submitted_by,
        status="pending_review",
    )
    db.add(pending)
    await db.commit()
    await db.refresh(pending)

    await log_admin_action(
        db, admin.id, admin.email, "scholarship.extract_and_submit", "pending_scholarship", str(pending.id),
        payload={"url": body.url, "name": data.get("name", "unknown")}
    )

    logger.info("Extracted and submitted %s → pending %s", body.url, pending.id)

    return {
        "pending_id": str(pending.id),
        "status": "pending_review",
        "data": data,
    }
