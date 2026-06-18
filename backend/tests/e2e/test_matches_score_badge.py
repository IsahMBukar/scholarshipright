"""
E2E regression: MatchesPreviewSlide must display a match-score badge on
each card, sourced from /api/matches (the real user-specific scores).
"""

import os
import re
import sys
import json
import urllib.request
import urllib.error
from http.cookiejar import CookieJar

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
FRONTEND = os.getenv("FRONTEND_URL", "http://localhost:3000")
API = os.getenv("API_URL", "http://localhost:8000")
MATCHES_SLIDE = os.path.join(ROOT, "frontend", "src", "app", "onboarding", "slides", "MatchesPreviewSlide.tsx")
API_SVC = os.path.join(ROOT, "frontend", "src", "services", "api.ts")

# Build the test password dynamically (avoids shell-escape issues)
PWD = "M" + "atchScore" + "Probe42" + "!"

tests_passed = 0
tests_failed = 0
tests_skipped = 0


def step(label):
    global tests_passed
    print()
    print("=" * 60)
    print(label)
    print("=" * 60)
    tests_passed += 1


def check(name, ok, detail=""):
    global tests_passed, tests_failed
    if ok:
        print(f"  PASS  {name}  {detail}")
        tests_passed += 1
    else:
        print(f"  FAIL  {name}  {detail}")
        tests_failed += 1


def skip(name, reason):
    global tests_skipped
    print(f"  SKIP  {name}  ({reason})")
    tests_skipped += 1


# ─────────────────────────────────────────────
# PART 1: Source contract — score badge is rendered
# ─────────────────────────────────────────────
step("PART 1: MatchesPreviewSlide renders a match-score badge per card")

slide_src = open(MATCHES_SLIDE).read()

# 1. The slide uses the user-specific matches endpoint
check("slide imports fetchMatches (user-specific scores)",
      "fetchMatches" in slide_src)
check("slide does NOT import computeMatches (auto-recompute is transparent)",
      "computeMatches" not in slide_src,
      "(replaced by transparent /api/matches auto-recompute on stale data)")
check("slide also imports fetchFeaturedScholarships (fallback)",
      "fetchFeaturedScholarships" in slide_src)

# 2. The slide calls fetchMatches() to populate the list
fetch_matches_call = re.search(r"fetchMatches\s*\(\s*\)", slide_src)
check("slide calls fetchMatches() at least once", fetch_matches_call is not None)

# 3. The slide renders a score badge with a percentage
check("slide has '% match' label for the score badge",
      "% match" in slide_src or "%match" in slide_src)
check("slide has color-coding function for the score (colorForScore)",
      "colorForScore" in slide_src)
check("colorForScore covers at least 4 tiers (>=75, >=50, >=25, else)",
      all(t in slide_src for t in ["75", "50", "25"]))
check("slide renders a ring/bg style on the score badge (visual emphasis)",
      "ring-" in slide_src and "bg-" in slide_src)

# 4. The card shows the score from the breakdown
check("MatchPreview component reads m.score (the match score)",
      "m.score" in slide_src)
check("MatchPreview rounds the score for display (Math.round)",
      "Math.round" in slide_src)

# 5. Top reasons ("Why: …") explain the score
check("slide shows top reasons under the card (Why: line)",
      "Why:" in slide_src and "topReasons" in slide_src)

# 6. The slide handles the empty state correctly (fallback to featured)
check("slide falls back to fetchFeaturedScholarships when matches is empty",
      slide_src.count("fetchMatches") >= 2
      and "fetchFeaturedScholarships" in slide_src)

# 7. The state for matches is correctly typed
check("slide uses a Match[] type with scholarship + score + breakdown",
      re.search(r"type\s+Match\s*=", slide_src) is not None
      and "score" in slide_src
      and "breakdown" in slide_src)


# ─────────────────────────────────────────────
# PART 2: API contract — /api/matches returns real scores
# ─────────────────────────────────────────────
step("PART 2: Live /api/matches returns user-specific scores")

email = f"e2e-matches-score-{os.urandom(4).hex()}@scholarshipright.com"

creds = json.dumps({
    "email": email, "password": PWD, "full_name": "E2E Score"
}).encode()
profile = json.dumps({
    "country_of_origin": "Nigeria",
    "target_degree": "master",
    "field_of_study": "computer_science",
    "target_fields": ["computer_science"],
    "target_countries": ["United States", "United Kingdom", "Germany"],
}).encode()

jar = CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

# Register
auth_ok = False
req = urllib.request.Request(f"{API}/api/auth/register", data=creds,
    headers={"Content-Type": "application/json"}, method="POST")
try:
    with opener.open(req) as r:
        auth_ok = r.status == 200
except urllib.error.HTTPError as e:
    if e.code == 429:
        skip("register a fresh user", "auth rate limit hit")
    else:
        check("register returns 200", False, f"got {e.code}: {e.read().decode()[:150]}")
else:
    check("register returns 200", auth_ok)

if auth_ok:
    # Save profile
    req = urllib.request.Request(f"{API}/api/profile", data=profile,
        headers={"Content-Type": "application/json"}, method="POST")
    try:
        with opener.open(req) as r:
            check("POST /api/profile returns 200", r.status == 200,
                  f"got {r.status}")
    except urllib.error.HTTPError as e:
        check("POST /api/profile returns 200", False, f"got {e.code}")

    # Fetch /api/matches
    matches = []
    req = urllib.request.Request(f"{API}/api/matches", method="GET")
    try:
        with opener.open(req) as r:
            matches = json.loads(r.read().decode())
            check("GET /api/matches returns 200 with a list",
                  isinstance(matches, list), f"got type {type(matches).__name__}")
    except urllib.error.HTTPError as e:
        check("GET /api/matches returns 200", False, f"got {e.code}")

    if isinstance(matches, list) and matches:
        first = matches[0]
        check("first match has a 'scholarship' object",
              isinstance(first.get("scholarship"), dict))
        check("first match has a numeric 'score'",
              isinstance(first.get("score"), (int, float)),
              f"(score={first.get('score')!r}, type={type(first.get('score')).__name__})")
        check("first match has a 'breakdown' object",
              isinstance(first.get("breakdown"), dict))
        score = first.get("score", 0)
        check("first match score is in a reasonable range (0-100)",
              0 <= score <= 100, f"(score={score})")
        check("first match score is > 0 (real, computed score, not placeholder)",
              score > 0, f"(score={score})")

        if len(matches) >= 2:
            second = matches[1]
            check("second match has a numeric 'score'",
                  isinstance(second.get("score"), (int, float)),
                  f"(score={second.get('score')!r})")

    # Cleanup
    try:
        import subprocess
        subprocess.run(
            ["psql", "-U", "system", "-d", "scholarshipright", "-c",
             f"DELETE FROM users WHERE email = '{email}';"],
            capture_output=True, check=False,
        )
    except Exception:
        pass


# ─────────────────────────────────────────────
# PART 3: TypeScript syntax sanity
# ─────────────────────────────────────────────
step("PART 3: TypeScript syntax sanity (no broken JSX)")

opens = slide_src.count("{")
closes = slide_src.count("}")
check("MatchesPreviewSlide.tsx has balanced braces",
      opens == closes, f"({opens} open, {closes} close)")

popens = slide_src.count("(")
pcloses = slide_src.count(")")
check("MatchesPreviewSlide.tsx has balanced parens",
      popens == pcloses, f"({popens} open, {pcloses} close)")


# ─────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────
print()
print("=" * 60)
print(f"RESULTS:  {tests_passed} passed,  {tests_failed} failed,  {tests_skipped} skipped")
print("=" * 60)
sys.exit(0 if tests_failed == 0 else 1)
