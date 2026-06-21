"""
Web scraper for scholarship listings.

Pulls a curated list of source URLs, attempts to extract structured
scholarship data (JSON-LD → schema.org/Scholarship → OpenGraph → heuristic
fallback), and writes a normalized JSON file that the existing
`seed_scholarships.py` loader picks up automatically.

Architecture
------------
1.  `sources.json`  — list of {url, name, slug_hint, fallback} entries.
    The `fallback` is a fully-formed scholarship record we use if the
    scrape yields no usable data (e.g. anti-bot block, JS-only page).
2.  The scraper tries each source in order, with a 5s timeout, real
    browser User-Agent, and follow-redirects.
3.  For each source, the parser runs four extractors in priority order;
    the first non-empty result wins.
4.  Whichever extractor's output is used (or the fallback) gets
    normalized into the canonical scholarship schema, then written to
    `seeds/scraped_<provider>.json`.
5.  The existing loader skips by slug, so the scraper is idempotent —
    re-running will only add net-new slugs.

Usage
-----
    cd backend && source venv/bin/activate
    python seeds/scrape.py                # full run
    python seeds/scrape.py --dry-run      # parse & report, don't write
    python seeds/scrape.py --only chevening  # restrict to one slug_hint
"""
import argparse
import asyncio
import json
import os
import re
import sys
from datetime import date, datetime
from typing import Any
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

SEEDS_DIR = os.path.dirname(os.path.abspath(__file__))
SOURCES_PATH = os.path.join(SEEDS_DIR, "sources.json")

# A real browser User-Agent — most anti-bot UAs block curl/python defaults
USER_AGENT = (
    "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36"
)

HTTP_TIMEOUT = 5.0


# ─── Extractors ────────────────────────────────────────────────────────────


def _extract_jsonld(soup: BeautifulSoup, base_url: str) -> dict | None:
    """Extract from JSON-LD blocks. Looks for `schema.org/Scholarship` or
    any node with `name + description + url`."""
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(tag.string or "{}")
        except (json.JSONDecodeError, TypeError):
            continue
        # JSON-LD can be a single object, a list, or wrapped in @graph
        candidates = []
        if isinstance(data, dict):
            if "@graph" in data and isinstance(data["@graph"], list):
                candidates.extend(data["@graph"])
            else:
                candidates.append(data)
        elif isinstance(data, list):
            candidates.extend(data)
        for node in candidates:
            if not isinstance(node, dict):
                continue
            t = node.get("@type", "")
            if t == "Scholarship" or (
                isinstance(t, list) and "Scholarship" in t
            ) or all(k in node for k in ("name", "description", "url")):
                return _normalize_jsonld(node, base_url)
    return None


def _normalize_jsonld(node: dict, base_url: str) -> dict:
    """Map a JSON-LD node into the canonical scholarship record."""
    name = (node.get("name") or "").strip()
    description = (node.get("description") or "").strip()
    url = node.get("url") or base_url
    # Deadline can appear as a date string, ISO datetime, or in a "validThrough" field
    deadline = (
        node.get("deadline")
        or node.get("validThrough")
        or node.get("applicationDeadline")
        or ""
    )
    # Eligibility sometimes carries nationality hints
    eligible = []
    elig = node.get("eligibleRegion") or node.get("eligibleNationality")
    if isinstance(elig, str):
        eligible = [elig]
    elif isinstance(elig, list):
        eligible = [str(e) for e in elig]
    return {
        "name": name,
        "description": description,
        "official_url": url,
        "deadline": _iso_date(deadline) or "",
        "eligible_nationalities": eligible,
        "host_country": _guess_country(url, name),
        "source": urlparse(url).netloc,
    }


def _extract_opengraph(soup: BeautifulSoup, base_url: str) -> dict | None:
    """OpenGraph + Twitter card fallback."""
    meta: dict[str, str] = {}
    for tag in soup.find_all("meta"):
        for attr in ("property", "name"):
            raw_key = tag.get(attr) or ""
            if not isinstance(raw_key, str):
                continue
            if not raw_key.startswith("og:") and not raw_key.startswith("twitter:"):
                continue
            raw_value = tag.get("content") or ""
            meta[raw_key] = raw_value if isinstance(raw_value, str) else " ".join(raw_value)
    if not (meta.get("og:title") or meta.get("twitter:title")):
        return None
    return {
        "name": (meta.get("og:title") or meta.get("twitter:title") or "").strip(),
        "description": (meta.get("og:description") or meta.get("twitter:description") or "").strip(),
        "official_url": meta.get("og:url") or base_url,
        "source": urlparse(base_url).netloc,
        "host_country": _guess_country(base_url, meta.get("og:title", "")),
    }


def _extract_heuristic(soup: BeautifulSoup, base_url: str) -> dict | None:
    """Last-resort heuristic: grab h1 as name, first <p> as description."""
    h1 = soup.find("h1")
    if not h1 or not h1.get_text(strip=True):
        return None
    name = h1.get_text(strip=True)
    first_p = soup.find("p")
    description = first_p.get_text(strip=True) if first_p else ""
    # Look for a date pattern in the text
    text = soup.get_text(" ", strip=True)[:5000]
    deadline = _find_date_in_text(text)
    return {
        "name": name,
        "description": description[:500],
        "official_url": base_url,
        "deadline": deadline or "",
        "source": urlparse(base_url).netloc,
        "host_country": _guess_country(base_url, name),
    }


def _merge_with_fallback(extracted: dict | None, fallback: dict) -> dict:
    """Merge extracted fields onto the fallback so missing fields are
    filled with the curated value."""
    merged = dict(fallback)
    if extracted:
        for k, v in extracted.items():
            if v and (k not in merged or not merged.get(k)):
                merged[k] = v
    return merged


def _normalize_record(record: dict) -> dict:
    """Coerce a possibly-partial dict into the canonical scholarship schema
    by ensuring all required columns are present (or use empty defaults)."""
    today = date.today().isoformat()
    defaults: dict[str, Any] = {
        "name": "Unknown scholarship",
        "slug": "unknown",
        "host_country": "Unknown",
        "host_institution": "Unknown",
        "provider": "Unknown",
        "degree_levels": ["master"],
        "fields_of_study": ["all_fields"],
        "eligible_nationalities": ["All countries"],
        "eligible_regions": ["All regions"],
        "funding_type": "fully_funded",
        "covers_tuition": True,
        "covers_living": False,
        "covers_flight": False,
        "covers_health": False,
        "monthly_stipend_usd": 0,
        "requires_ielts": False,
        "min_ielts_score": None,
        "requires_gre": False,
        "requires_application_fee": False,
        "min_cgpa": 0.0,
        "language_of_instruction": "English",
        "deadline": today,
        "program_start_date": today,
        "duration_months": 12,
        "description": "",
        "official_url": "",
        "is_verified": False,
        "source": "",
    }
    for k, v in defaults.items():
        record.setdefault(k, v)
    return record


# ─── Helpers ───────────────────────────────────────────────────────────────


def _iso_date(value: Any) -> str | None:
    """Coerce common date formats into ISO 8601 (YYYY-MM-DD)."""
    if not value:
        return None
    if isinstance(value, date):
        return value.isoformat()
    s = str(value).strip()
    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%Y/%m/%d", "%d %B %Y", "%B %d, %Y"):
        try:
            return datetime.strptime(s[: len(fmt) + 6], fmt).date().isoformat()
        except (ValueError, TypeError):
            continue
    return None


def _find_date_in_text(text: str) -> str | None:
    """Find the first plausible deadline date in plain text."""
    m = re.search(r"\b(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b", text)
    if m:
        return _iso_date(m.group(0))
    return None


_COUNTRY_HINTS = {
    "United Kingdom": ["uk", "united kingdom", "britain", "british", "england", "scotland", "wales", "oxford", "cambridge", "london"],
    "United States": ["us", "united states", "usa", "america", "american"],
    "Germany": ["germany", "german", "daad", "munich", "berlin", "humboldt"],
    "France": ["france", "french", "paris", "campusfrance"],
    "Canada": ["canada", "canadian", "toronto", "vancouver"],
    "Australia": ["australia", "australian", "dfat"],
    "Netherlands": ["netherlands", "dutch", "holland", "amsterdam", "utrecht"],
    "Japan": ["japan", "japanese", "mext", "tokyo", "kyoto"],
    "South Korea": ["korea", "korean", "seoul", "niied", "gks"],
    "China": ["china", "chinese", "beijing", "csc", "campuschina"],
    "Hungary": ["hungary", "hungarian", "stipendium"],
    "Türkiye": ["türkiye", "turkey", "turkish"],
    "Singapore": ["singapore", "asean"],
}


def _guess_country(url: str, hint: str = "") -> str:
    """Best-effort country inference from URL and text."""
    blob = f"{url} {hint}".lower()
    for country, keywords in _COUNTRY_HINTS.items():
        for kw in keywords:
            if kw in blob:
                return country
    return "Unknown"


# ─── Main scrape loop ──────────────────────────────────────────────────────


async def scrape_source(client: httpx.AsyncClient, source: dict, *, dry_run: bool = False) -> dict | None:
    """Try to extract a record from one source URL. Returns the final
    merged record (extracted + fallback) or None if completely unusable."""
    url = source["url"]
    fallback = source.get("fallback", {})
    print(f"  → Fetching {url[:80]}...", flush=True)
    resp: httpx.Response | None = None
    status: int | None = None
    try:
        resp = await client.get(url, headers={"User-Agent": USER_AGENT}, timeout=HTTP_TIMEOUT)
        status = resp.status_code
    except Exception as e:  # noqa: BLE001
        print(f"    ⚠️  Network error: {type(e).__name__}: {e}")

    extracted: dict | None = None
    if status and 200 <= status < 300 and resp is not None:
        soup = BeautifulSoup(resp.text, "html.parser")
        for extractor in (_extract_jsonld, _extract_opengraph, _extract_heuristic):
            try:
                extracted = extractor(soup, url)
            except Exception as e:  # noqa: BLE001
                print(f"    ⚠️  {extractor.__name__} failed: {e}")
                continue
            if extracted:
                print(f"    ✅ Extracted via {extractor.__name__}")
                break
    else:
        print(f"    ⚠️  HTTP {status} — using fallback only")

    record = _merge_with_fallback(extracted, fallback)
    record = _normalize_record(record)
    return record


async def run(dry_run: bool = False, only: str | None = None) -> list[dict]:
    with open(SOURCES_PATH) as f:
        sources = json.load(f)
    if only:
        sources = [s for s in sources if s.get("slug_hint") == only or s.get("name", "").lower() == only.lower()]
        if not sources:
            print(f"❌ No source matched '{only}'")
            return []
    print(f"🔍 Scraping {len(sources)} source(s)...\n")
    records: list[dict] = []
    async with httpx.AsyncClient(follow_redirects=True) as client:
        for source in sources:
            rec = await scrape_source(client, source, dry_run=dry_run)
            if rec:
                records.append(rec)
            print()
    # Group by source domain so the loader ingests them as separate files
    by_domain: dict[str, list[dict]] = {}
    for r in records:
        domain = r.get("source") or "unknown"
        # sanitize filename
        safe = re.sub(r"[^a-z0-9.-]", "_", domain.lower())
        by_domain.setdefault(safe, []).append(r)
    for domain, recs in by_domain.items():
        out_path = os.path.join(SEEDS_DIR, f"scraped_{domain}.json")
        if dry_run:
            print(f"[dry-run] Would write {len(recs)} records to {os.path.basename(out_path)}")
        else:
            with open(out_path, "w") as f:
                json.dump(recs, f, indent=2, ensure_ascii=False)
            print(f"📝 Wrote {len(recs)} records → {os.path.basename(out_path)}")
    print(f"\n🎉 Scraped {len(records)} record(s) from {len(sources)} source(s)")
    return records


def main() -> int:
    parser = argparse.ArgumentParser(description="Scrape scholarship listings into the seeds/ directory.")
    parser.add_argument("--dry-run", action="store_true", help="Parse and report without writing files.")
    parser.add_argument("--only", type=str, default=None, help="Restrict to one source by slug_hint or name.")
    args = parser.parse_args()
    asyncio.run(run(dry_run=args.dry_run, only=args.only))
    return 0


if __name__ == "__main__":
    sys.exit(main())
