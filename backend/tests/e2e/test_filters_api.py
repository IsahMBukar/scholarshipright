#!/usr/bin/env python3
"""
E2E test: new filter params on /api/scholarships and /filters/metadata.

Verifies the Phase 1 changes work end-to-end:
  1. /api/scholarships?language_test=IELTS returns rows whose
     accepted_english_tests array contains IELTS.
  2. /api/scholarships?language_test=IELTS,PTE returns rows with
     EITHER test (overlap, not intersection).
  3. /api/scholarships?verified=true returns is_verified=true rows.
  4. /api/scholarships?min_stipend=1500 returns only rows with
     monthly_stipend_usd >= 1500 (NULL excluded).
  5. /api/scholarships?funding=partial returns 0 rows when the data
     is all fully_funded (filter is honest, not silent about the gap).
  6. /api/scholarships/filters/metadata returns the canonical shape
     with the expected label maps.

Run:
    python3 tests/e2e/test_filters_api.py
"""
import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.getenv("API_URL", "http://localhost:8000")
tests_passed = 0
tests_failed = 0


def fetch(path: str) -> dict:
    req = urllib.request.Request(f"{BASE}{path}")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def expect(label: str, cond: bool, detail: str = "") -> None:
    global tests_passed, tests_failed
    if cond:
        tests_passed += 1
        print(f"  PASS  {label}")
    else:
        tests_failed += 1
        print(f"  FAIL  {label}  {detail}")


# 1. language_test=IELTS — every returned row must accept IELTS
data = fetch("/api/scholarships?language_test=IELTS&limit=100")
items = data.get("items", [])
expect(
    "language_test=IELTS returns rows",
    len(items) > 0,
    f"got 0 rows",
)
all_have_ielts = all("IELTS" in (s.get("accepted_english_tests") or []) for s in items)
expect(
    "every returned row has IELTS in accepted_english_tests",
    all_have_ielts,
    f"one or more rows lack IELTS: {[s['name'] for s in items if 'IELTS' not in (s.get('accepted_english_tests') or [])]}",
)

# 2. language_test overlap — IELTS + PTE must include Chevening (accepts both)
data = fetch("/api/scholarships?language_test=IELTS,PTE&limit=100")
names = [s["name"] for s in data.get("items", [])]
expect(
    "language_test=IELTS,PTE includes Chevening (overlap, not intersection)",
    "Chevening Scholarship" in names,
    f"Chevening not in {names}",
)

# 3. verified=true
data = fetch("/api/scholarships?verified=true&limit=100")
items = data.get("items", [])
all_verified = all(s.get("is_verified") is True for s in items)
expect(
    "verified=true returns only is_verified=true rows",
    all_verified,
    f"some rows have is_verified=false",
)

# 4. min_stipend — rows must have monthly_stipend_usd >= 1500
data = fetch("/api/scholarships?min_stipend=1500&limit=100")
items = data.get("items", [])
all_above = all((s.get("monthly_stipend_usd") or 0) >= 1500 for s in items)
expect(
    "min_stipend=1500 returns only rows with stipend >= 1500",
    all_above,
    f"some rows below 1500: {[(s['name'], s['monthly_stipend_usd']) for s in items if (s.get('monthly_stipend_usd') or 0) < 1500]}",
)
expect(
    "min_stipend=1500 returns at least 1 row (sample data has Gates/ETH/Fulbright/Australia)",
    len(items) > 0,
    f"got 0 rows",
)

# 5. funding=partial — current data is all fully_funded, so should be 0
data = fetch("/api/scholarships?funding=partial&limit=100")
expect(
    "funding=partial returns 0 rows (data is all fully_funded — filter is honest)",
    data.get("total") == 0,
    f"got total={data.get('total')}",
)

# 6. /filters/metadata
meta = fetch("/api/scholarships/filters/metadata")
expect(
    "/filters/metadata returns countries array",
    isinstance(meta.get("countries"), list) and len(meta["countries"]) > 0,
    f"got {meta.get('countries')}",
)
expect(
    "/filters/metadata returns fields array",
    isinstance(meta.get("fields"), list) and len(meta["fields"]) > 0,
    f"got {meta.get('fields')}",
)
expect(
    "/filters/metadata returns english_tests (5 known tests)",
    meta.get("english_tests") == ["IELTS", "TOEFL", "PTE", "Duolingo", "Cambridge"],
    f"got {meta.get('english_tests')}",
)
expect(
    "/filters/metadata returns funding_labels map",
    "fully_funded" in (meta.get("funding_labels") or {}),
    f"got {meta.get('funding_labels')}",
)

# 7. combined filters — IELTS + min_stipend=1500
#    Originally this returned 4 rows (Gates Cambridge / ETH Zurich
#    / Fulbright / Australia Awards). With the seed expansion
#    (17 → 46 scholarships across 6 transition paths), the result
#    set now contains all high-stipend IELTS-accepting scholarships.
#    Lock in that the original 4 are STILL present (regression check)
#    AND that the count has grown (≥4, the original baseline).
data = fetch("/api/scholarships?language_test=IELTS&min_stipend=1500&limit=100")
items = data.get("items", [])
names = [s.get("name", "") for s in items]
# All returned rows must satisfy both filter conditions
all_match = all(
    "IELTS" in (s.get("accepted_english_tests") or [])
    and (s.get("monthly_stipend_usd") or 0) >= 1500
    for s in items
)
expect(
    "combined language_test=IELTS & min_stipend=1500 returns only rows matching both",
    all_match,
    f"one or more rows violate filter: {[(s.get('name'), s.get('accepted_english_tests'), s.get('monthly_stipend_usd')) for s in items if not ('IELTS' in (s.get('accepted_english_tests') or []) and (s.get('monthly_stipend_usd') or 0) >= 1500)]}",
)
expect(
    "combined filter still includes the 4 original scholarships (Gates, ETH, Fulbright, Australia Awards)",
    # The 4 original are still in the set; we check substrings since naming
    # varies slightly across the seed (e.g. "Gates Cambridge" / "Gates").
    any("Gates" in n for n in names)
    and any("ETH" in n or "Zurich" in n for n in names)
    and any("Fulbright" in n for n in names)
    and any("Australia" in n or "Australia Awards" in n for n in names),
    f"missing original: gates={any('Gates' in n for n in names)}, eth={any('ETH' in n or 'Zurich' in n for n in names)}, fulbright={any('Fulbright' in n for n in names)}, australia={any('Australia' in n for n in names)}, total={data.get('total')}",
)
expect(
    "combined filter has ≥4 rows (original baseline — seed expansion should only grow this)",
    data.get("total", 0) >= 4,
    f"got total={data.get('total')}",
)

print(f"\n{tests_passed} passed, {tests_failed} failed")
sys.exit(0 if tests_failed == 0 else 1)
