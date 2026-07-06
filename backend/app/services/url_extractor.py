"""
URL-to-scholarship extractor using Claude API.

Takes a URL, fetches the page content, and asks Claude to extract
structured scholarship data. Returns a dict matching the
AdminScholarshipCreate schema.

This is a LIGHTWEIGHT operation — just one HTTP call to the Claude API.
No BeautifulSoup, no heavy parsing. The AI does the extraction.

Usage:
    from app.services.url_extractor import extract_scholarship_from_url
    data = await extract_scholarship_from_url("https://www.chevening.org/scholarships/")
"""
import logging
import os
from typing import Any, Optional

import httpx

logger = logging.getLogger("scholarshipright.url_extractor")

CLAUDE_API_URL = "https://api.anthropic.com/v1/messages"
CLAUDE_MODEL = "claude-sonnet-4-20250514"

EXTRACT_PROMPT = """You are a scholarship data extractor. Given the content of a scholarship webpage, extract structured data and return ONLY valid JSON matching this schema. Do NOT include any explanation text — just the JSON.

Schema:
{
  "name": "Full scholarship name (required)",
  "host_country": "Country where offered (required)",
  "funding_type": "fully_funded | partially_funded | tuition_only | self_funded | loan (required)",
  "deadline": "YYYY-MM-DD format (required, use latest year if multiple deadlines)",
  "official_url": "The URL provided (required)",
  "host_institution": "University or institution name",
  "provider": "Organization providing the scholarship",
  "degree_levels": ["bachelor", "master", "phd", "doctoral", "postdoc"],
  "fields_of_study": ["field1", "field2"] or ["all_fields"],
  "eligible_nationalities": ["country1", "country2"] or ["All countries"],
  "eligible_regions": ["Africa", "Asia", "Europe", "Latin America", "Middle East", "All regions"],
  "covers_tuition": true/false,
  "covers_living": true/false,
  "covers_flight": true/false,
  "covers_health": true/false,
  "monthly_stipend_usd": number or null,
  "requires_ielts": true/false,
  "min_ielts_score": number or null,
  "requires_gre": true/false,
  "min_cgpa": number or null,
  "language_of_instruction": "English" or other,
  "open_date": "YYYY-MM-DD" or null,
  "program_start_date": "YYYY-MM-DD" or null,
  "duration_months": number or null,
  "description": "Brief description of the scholarship",
  "benefits_summary": "Summary of what the scholarship covers",
  "how_to_apply": "Brief application instructions",
  "source": "domain name of the URL"
}

Rules:
- If a field cannot be determined, omit it (don't guess)
- For deadline, use the NEXT upcoming deadline
- For degree_levels, infer from context
- For funding_type, use "fully_funded" only if it covers tuition + living + flight
- Return ONLY the JSON object, no markdown code fences
"""


async def extract_from_url(url: str) -> dict[str, Any]:
    """Fetch a URL and extract scholarship data using Claude API.

    Returns a dict matching AdminScholarshipCreate schema.
    Raises ValueError if extraction fails.
    """
    api_key = os.environ.get("CLAUDE_API_KEY") or os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("CLAUDE_API_KEY or ANTHROPIC_API_KEY environment variable not set")

    # Step 1: Fetch the page content (lightweight HTTP request)
    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
        try:
            resp = await client.get(url, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            })
            resp.raise_for_status()
        except httpx.HTTPError as e:
            raise ValueError(f"Failed to fetch URL: {e}")

    # Step 2: Truncate content to avoid token limits
    html = resp.text[:15000]  # ~4K tokens

    # Step 3: Call Claude API
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            claude_resp = await client.post(
                CLAUDE_API_URL,
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": CLAUDE_MODEL,
                    "max_tokens": 2000,
                    "messages": [
                        {
                            "role": "user",
                            "content": f"{EXTRACT_PROMPT}\n\nURL: {url}\n\nPage content:\n{html}"
                        }
                    ],
                },
            )
            claude_resp.raise_for_status()
        except httpx.HTTPError as e:
            raise ValueError(f"Claude API error: {e}")

    # Step 4: Parse response
    result = claude_resp.json()
    content = result.get("content", [{}])[0].get("text", "")

    # Strip markdown code fences if present
    content = content.strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[1] if "\n" in content else content[3:]
    if content.endswith("```"):
        content = content[:-3]
    content = content.strip()

    import json
    try:
        data = json.loads(content)
    except json.JSONDecodeError as e:
        raise ValueError(f"Claude returned invalid JSON: {e}\nContent: {content[:500]}")

    # Ensure required fields
    if not data.get("name"):
        raise ValueError("Could not extract scholarship name from URL")
    if not data.get("host_country"):
        raise ValueError("Could not extract host country from URL")

    # Set defaults
    data.setdefault("official_url", url)
    data.setdefault("funding_type", "partially_funded")
    data.setdefault("deadline", "2026-12-31")

    return data


async def extract_from_content(content: str, source_url: str = "") -> dict[str, Any]:
    """Extract scholarship data from pre-fetched content (for MCP agents
    that already scraped the page).

    Same as extract_from_url but skips the HTTP fetch step.
    """
    api_key = os.environ.get("CLAUDE_API_KEY") or os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("CLAUDE_API_KEY or ANTHROPIC_API_KEY environment variable not set")

    truncated = content[:15000]

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            claude_resp = await client.post(
                CLAUDE_API_URL,
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": CLAUDE_MODEL,
                    "max_tokens": 2000,
                    "messages": [
                        {
                            "role": "user",
                            "content": f"{EXTRACT_PROMPT}\n\nURL: {source_url}\n\nPage content:\n{truncated}"
                        }
                    ],
                },
            )
            claude_resp.raise_for_status()
        except httpx.HTTPError as e:
            raise ValueError(f"Claude API error: {e}")

    result = claude_resp.json()
    text = result.get("content", [{}])[0].get("text", "").strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
    if text.endswith("```"):
        text = text[:-3]

    import json
    data = json.loads(text.strip())
    data.setdefault("official_url", source_url)
    return data
