import re
from sqlalchemy import select, text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.blog import BlogScholarshipTag, extract_scholarship_slugs
from app.models.scholarship import Scholarship
from app.utils.db import escape_like

_SCHOLARSHIP_TAG_RE = re.compile(r"@\[scholarship:([a-z0-9\-]+)\]")


async def validate_scholarship_slugs(db: AsyncSession, slugs: list[str]) -> dict:
    slugs = list(dict.fromkeys(s.strip().lower() for s in slugs if s and s.strip()))
    if not slugs:
        return {"valid": [], "valid_map": {}, "invalid": [], "suggestions": {}}
    rows = await db.execute(
        select(Scholarship.id, Scholarship.slug, Scholarship.name, Scholarship.host_country)
        .where(Scholarship.slug.in_(slugs), Scholarship.is_active == True)  # noqa: E712
    )
    found = {r.slug: {"id": r.id, "slug": r.slug, "name": r.name, "host_country": r.host_country} for r in rows.all()}
    valid = [s for s in slugs if s in found]
    invalid = [s for s in slugs if s not in found]
    suggestions: dict[str, list[dict]] = {}
    for slug in invalid:
        safe = escape_like(slug)
        sug_rows = await db.execute(
            select(Scholarship.slug, Scholarship.name, Scholarship.host_country)
            .where(Scholarship.is_active == True, Scholarship.slug.ilike(f"%{safe}%"))  # noqa: E712
            .order_by(Scholarship.slug)
            .limit(3)
        )
        sug = [{"slug": r.slug, "name": r.name, "host_country": r.host_country} for r in sug_rows.all()]
        if not sug:
            safe2 = escape_like(slug.replace("-", " "))
            sug_rows2 = await db.execute(
                select(Scholarship.slug, Scholarship.name, Scholarship.host_country)
                .where(Scholarship.is_active == True, Scholarship.name.ilike(f"%{safe2}%"))  # noqa: E712
                .limit(3)
            )
            sug = [{"slug": r.slug, "name": r.name, "host_country": r.host_country} for r in sug_rows2.all()]
        suggestions[slug] = sug
    return {"valid": valid, "valid_map": found, "invalid": invalid, "suggestions": suggestions}


async def sync_scholarship_tags(db: AsyncSession, post_id, body: str, start_offset: int = 0) -> None:
    slugs = extract_scholarship_slugs(body)
    if not slugs:
        await db.execute(sa_text("DELETE FROM blog_scholarship_tags WHERE blog_post_id = :pid"), {"pid": str(post_id)})
        return
    rows = await db.execute(
        select(Scholarship.id, Scholarship.slug).where(Scholarship.slug.in_(slugs), Scholarship.is_active == True)  # noqa: E712
    )
    slug_to_id = {r.slug: r.id for r in rows.all()}
    await db.execute(sa_text("DELETE FROM blog_scholarship_tags WHERE blog_post_id = :pid"), {"pid": str(post_id)})
    for i, slug in enumerate(slugs):
        sch_id = slug_to_id.get(slug)
        if sch_id:
            db.add(BlogScholarshipTag(blog_post_id=post_id, scholarship_id=sch_id, position_hint=start_offset + i))
