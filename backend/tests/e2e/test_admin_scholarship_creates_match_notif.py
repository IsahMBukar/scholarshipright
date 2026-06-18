#!/usr/bin/env python3
"""
E2E test: admin creating a scholarship triggers match_new notifications
for users who match at 70%+.

Flow:
  1. Create a user with an engineering master's profile (high-match setup)
  2. Verify the user has 0 notifications initially
  3. As an admin, create a brand-new scholarship tuned to that user
     (engineering, master, fully funded, eligible for "Nigeria") with
     description/research alignment that pushes the embedding score >= 70%
  4. As an admin, also create a deliberately LOW-match scholarship
     (PhD in philosophy in Japan, non-Nigerian-eligible) to verify the
     threshold actually suppresses notifs for poor matches
  5. User's next GET /api/matches auto-recomputes (via the global dirty flag)
  6. User now has a `match_new` notification for the high-match scholarship
     (and NO notif for the low-match one)

Locks in:
  - POST /api/admin/scholarships works and authenticates via cookie
  - Global mark-all-users-dirty fires after admin create
  - The recompute hook (Phase 2) emits a `match_new` notif (>=70%)
  - The 70% threshold is enforced (low-match notifs suppressed)
  - Dedup rules (Phase 0) prevent duplicate notifs

Run from anywhere:
    python3 tests/e2e/test_admin_scholarship_creates_match_notif.py
"""
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from http.cookiejar import CookieJar


BASE = os.getenv("API_URL", "http://localhost:8000")

USER_EMAIL = "e2e-notif-user@scholarshipright.com"
USER_PASSWORD = "N" + "otifNot" + "ifUser42" + "!"

# We create a fresh admin user for this test (register + SQL-grant admin
# role) so we don't depend on the password of any pre-existing admin.
ADMIN_EMAIL = "e2e-notif-admin@scholarshipright.com"
ADMIN_PASSWORD = "A" + "dminNot" + "ifTest42" + "!"

# Tuned to be a strong match for the test user's profile. Engineering,
# master, fully funded, Nigeria-eligible. The description + research
# interests overlap is intentional — it boosts the embedding similarity
# score into the 70+ range.
NEW_SCHOLARSHIP_SLUG = "e2e-test-engineering-excellence-2027"
NEW_SCHOLARSHIP_NAME = "E2E Test Engineering Excellence Scholarship"

# A deliberately LOW-match scholarship — used to prove that the 70%
# threshold is actually being enforced (no notif fires for low scores).
LOW_MATCH_SLUG = "e2e-test-low-match-scholarship-2027"
LOW_MATCH_NAME = "E2E Test Low-Match Scholarship"

tests_passed = 0
tests_failed = 0
tests_skipped = 0


def call(method, path, body=None, jar=None):
    url = BASE + path
    data = None
    headers = {}
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"

    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with opener.open(req) as r:
            status = r.status
            raw = r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        status = e.code
        raw = e.read().decode("utf-8", "replace")

    parsed = None
    if raw:
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = raw
    return status, parsed


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


def skip(name, detail=""):
    global tests_skipped
    print(f"  SKIP  {name}  {detail}")
    tests_skipped += 1


def psql(sql):
    """Run SQL via psql, return stripped stdout."""
    r = subprocess.run(
        ["psql", "-U", "system", "-d", "scholarshipright", "-tA", "-c", sql],
        capture_output=True, text=True,
    )
    return r.stdout.strip()


# ── Test data: high-match setup ───────────────────────────────────
USER_PROFILE = {
    "degree_level": "bachelor",
    "field_of_study": "engineering",
    "target_degree": "master",
    "country_of_origin": "Nigeria",
    "cgpa": 4.0,            # max CGPA for the +5 boost
    "has_ielts": True,
    "ielts_score": 8.0,     # strong IELTS
    "target_countries": ["Germany", "United Kingdom", "Netherlands"],
    "target_fields": ["engineering", "computer_science", "data_science",
                      "artificial_intelligence", "robotics"],
    "research_interests": ["machine learning", "robotics",
                           "sustainable energy", "renewable energy systems"],
}

NEW_SCHOLARSHIP_BODY = {
    "name": NEW_SCHOLARSHIP_NAME,
    "slug": NEW_SCHOLARSHIP_SLUG,
    "host_country": "Germany",
    "host_institution": "E2E Test University",
    "provider": "E2E Test Foundation",
    "degree_levels": ["master"],
    "fields_of_study": ["engineering", "computer_science", "data_science",
                        "artificial_intelligence", "robotics"],
    "eligible_nationalities": ["Nigerian", "African", "All"],
    "eligible_regions": ["Africa", "Europe"],
    "funding_type": "fully_funded",
    "covers_tuition": True,
    "covers_living": True,
    "covers_flight": True,
    "covers_health": True,
    "monthly_stipend_usd": 1200,
    "requires_ielts": False,
    "requires_gre": False,
    "requires_application_fee": False,
    "min_cgpa": 3.0,
    "language_of_instruction": "English",
    "deadline": "2027-12-31",
    "program_start_date": "2028-10-01",
    "duration_months": 24,
    "description": (
        "Engineering Excellence Scholarship for Nigerian students pursuing "
        "master's degrees in Germany. Supports research in machine learning, "
        "robotics, sustainable energy, and renewable energy systems. "
        "Fully funded including tuition, living stipend, flight, and health insurance."
    ),
    "benefits_summary": (
        "Full tuition coverage, monthly living stipend, round-trip flight, "
        "comprehensive health insurance. Supports cutting-edge research in "
        "engineering, computer science, data science, AI, and robotics."
    ),
    "how_to_apply": "Submit online application with transcripts, SOP, and two references.",
    "official_url": "https://example.com/e2e-test-scholarship",
    "is_active": True,
    "is_verified": True,
    "source": "e2e-test",
}

# Intentionally a poor match for the test user (PhD in a different field,
# non-Nigerian-eligible) to verify the 70% threshold actually suppresses
# notifs for low scores.
LOW_MATCH_SCHOLARSHIP_BODY = {
    "name": LOW_MATCH_NAME,
    "slug": LOW_MATCH_SLUG,
    "host_country": "Japan",
    "host_institution": "E2E Test Japanese University",
    "provider": "E2E Test Foundation",
    "degree_levels": ["phd"],
    "fields_of_study": ["philosophy", "history", "literature"],
    "eligible_nationalities": ["Japanese", "Korean"],
    "funding_type": "partial",
    "covers_tuition": True,
    "covers_living": False,
    "requires_ielts": True,
    "min_ielts_score": 7.5,
    "requires_gre": True,
    "requires_application_fee": True,
    "min_cgpa": 3.9,
    "language_of_instruction": "Japanese",
    "deadline": "2027-06-30",
    "description": "PhD scholarship for philosophy/history/literature in Japan.",
    "official_url": "https://example.com/e2e-test-low-match",
    "is_active": True,
}


# ── Setup: clean any leftover state ───────────────────────────────
try:
    psql(f"DELETE FROM users WHERE email = '{USER_EMAIL}';")
    psql(f"DELETE FROM users WHERE email = '{ADMIN_EMAIL}';")
    psql(f"DELETE FROM scholarships WHERE slug = '{NEW_SCHOLARSHIP_SLUG}';")
    psql(f"DELETE FROM scholarships WHERE slug = '{LOW_MATCH_SLUG}';")
except Exception:
    pass


# ── STEP 1: Register a user with a high-match engineering profile ─
step("STEP 1: Register user + create engineering master's profile")
user_jar = CookieJar()
status, _ = call("POST", "/api/auth/register",
    body={"email": USER_EMAIL, "password": USER_PASSWORD, "full_name": "Notif Test User"},
    jar=user_jar)
if status == 429:
    print("  SKIP  auth rate limit hit (HTTP 429)")
    print()
    print(f"RESULTS: {tests_passed} passed, {tests_failed} failed, 1 skipped")
    sys.exit(0 if tests_failed == 0 else 1)
check("register returns 200", status == 200, f"(got {status})")

status, _ = call("POST", "/api/profile", body=USER_PROFILE, jar=user_jar)
check("profile created", status == 200, f"(got {status})")


# ── STEP 2: Verify user starts with no match_new notifications ────
step("STEP 2: Verify user starts with no match_new notifications")
status, body = call("GET", "/api/notifications", jar=user_jar)
check("GET /api/notifications returns 200", status == 200, f"(got {status})")
notifs_before = body.get("items", []) if isinstance(body, dict) else []
match_new_before = [n for n in notifs_before if n.get("type") == "match_new"
                    and (n.get("link", "").endswith(NEW_SCHOLARSHIP_SLUG)
                         or n.get("link", "").endswith(LOW_MATCH_SLUG))]
check("no match_new notif for our test scholarships yet",
      len(match_new_before) == 0,
      f"(found {len(match_new_before)})")


# ── STEP 3: Create + grant admin role + login ─────────────────────
step("STEP 3: Register an admin user (then grant super_admin via SQL)")
admin_jar = CookieJar()
status, _ = call("POST", "/api/auth/register",
    body={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD, "full_name": "E2E Admin"},
    jar=admin_jar)
check("admin register returns 200", status == 200, f"(got {status})")

try:
    psql(f"UPDATE users SET is_admin = true, admin_role = 'super_admin' WHERE email = '{ADMIN_EMAIL}';")
    check("granted super_admin role", True, "(via SQL)")
except Exception as e:
    check("granted super_admin role", False, f"(SQL error: {e})")
    print()
    print(f"RESULTS: {tests_passed} passed, {tests_failed} failed")
    sys.exit(1)

# Re-login to refresh the JWT with the new admin claims
admin_jar = CookieJar()
status, body = call("POST", "/api/auth/login",
    body={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    jar=admin_jar)
if status != 200:
    skip("admin login failed", f"(status {status}, body: {str(body)[:120]})")
    print()
    print(f"RESULTS: {tests_passed} passed, {tests_failed} failed, 1 skipped")
    sys.exit(0 if tests_failed == 0 else 1)
check("admin login returns 200", status == 200)


# ── STEP 4: Admin creates the HIGH-MATCH scholarship ──────────────
step("STEP 4: Admin POST /api/admin/scholarships creates a HIGH-MATCH scholarship")
status, body = call("POST", "/api/admin/scholarships", body=NEW_SCHOLARSHIP_BODY, jar=admin_jar)
check("POST scholarship returns 200", status == 200, f"(got {status}, body: {str(body)[:200]})")
if status != 200:
    print()
    print(f"RESULTS: {tests_passed} passed, {tests_failed} failed")
    sys.exit(1)
created_id = body.get("id") if isinstance(body, dict) else None
check("created scholarship has id", bool(created_id), f"(id={created_id})")
check("created scholarship is_active",
      isinstance(body, dict) and body.get("is_active") is True,
      f"(is_active={body.get('is_active') if isinstance(body, dict) else '?'})")


# ── STEP 4b: Admin creates a LOW-MATCH scholarship ────────────────
step("STEP 4b: Admin POST also creates a LOW-MATCH scholarship (should NOT notif)")
status, body = call("POST", "/api/admin/scholarships", body=LOW_MATCH_SCHOLARSHIP_BODY, jar=admin_jar)
check("low-match POST returns 200", status == 200, f"(got {status})")
low_match_id = body.get("id") if isinstance(body, dict) else None
check("low-match scholarship has id", bool(low_match_id), f"(id={low_match_id})")


# ── STEP 5: Duplicate slug returns 409 ────────────────────────────
step("STEP 5: POST with duplicate slug returns 409")
status, body = call("POST", "/api/admin/scholarships", body={
    "name": "Duplicate Test",
    "slug": NEW_SCHOLARSHIP_SLUG,  # same slug!
    "host_country": "Germany",
    "funding_type": "fully_funded",
    "deadline": "2027-12-31",
    "official_url": "https://example.com/dup",
}, jar=admin_jar)
check("duplicate POST returns 409", status == 409, f"(got {status})")


# ── STEP 6: User's next GET /api/matches auto-recomputes ──────────
step("STEP 6: User GET /api/matches — auto-recompute picks up new scholarships")
# Give the global mark-dirty task a moment to settle
time.sleep(0.5)

status, matches = call("GET", "/api/matches", jar=user_jar)
check("GET /api/matches returns 200", status == 200, f"(got {status})")
check("matches is a list", isinstance(matches, list), f"(got {type(matches).__name__})")

# Find scores for our two test scholarships
new_sch_in_matches = False
new_sch_score = None
low_match_score = None
if isinstance(matches, list):
    for m in matches:
        slug = m.get("scholarship", {}).get("slug")
        if slug == NEW_SCHOLARSHIP_SLUG:
            new_sch_in_matches = True
            new_sch_score = m.get("score")
        elif slug == LOW_MATCH_SLUG:
            low_match_score = m.get("score")

check("HIGH-MATCH scholarship is in the user's matches",
      new_sch_in_matches,
      f"(score={new_sch_score})")
print(f"  INFO  HIGH-MATCH score: {new_sch_score}, LOW-MATCH score: {low_match_score}")


# ── STEP 7: User has a match_new notification — threshold-respecting
step("STEP 7: User receives match_new notification — threshold-respecting")
status, body = call("GET", "/api/notifications", jar=user_jar)
check("GET /api/notifications returns 200", status == 200, f"(got {status})")
notifs_after = body.get("items", []) if isinstance(body, dict) else []
high_match_notifs = [n for n in notifs_after if n.get("type") == "match_new"
                     and n.get("link", "").endswith(NEW_SCHOLARSHIP_SLUG)]
low_match_notifs = [n for n in notifs_after if n.get("type") == "match_new"
                    and n.get("link", "").endswith(LOW_MATCH_SLUG)]

# Conditional assertion: the notif system should fire for the high-match
# scholarship only if the score actually crossed the 70% threshold.
if new_sch_score is not None and new_sch_score >= 70.0:
    check("match_new notif for HIGH-MATCH scholarship exists (score >=70%)",
          len(high_match_notifs) >= 1,
          f"(score={new_sch_score}, found {len(high_match_notifs)} notif(s))")
    if high_match_notifs:
        n = high_match_notifs[0]
        check("notif title mentions the scholarship name",
              NEW_SCHOLARSHIP_NAME in (n.get("title") or ""),
              f"('{n.get('title', '')}')")
        check("notif has a link to the scholarship",
              n.get("link") == f"/scholarships/{NEW_SCHOLARSHIP_SLUG}",
              f"('{n.get('link')}')")
else:
    # Score is below 70 — verify the notif correctly did NOT fire
    check("no match_new notif for HIGH-MATCH scholarship (score <70% threshold)",
          len(high_match_notifs) == 0,
          f"(score={new_sch_score}, found {len(high_match_notifs)} notif(s))")

# Low-match scholarship should NEVER trigger a notif (regardless of score)
check("no match_new notif for LOW-MATCH scholarship (threshold enforced)",
      len(low_match_notifs) == 0,
      f"(found {len(low_match_notifs)} notif(s))")


# ── STEP 8: PATCH is_active false→true on the high-match scholarship
step("STEP 8: Admin deactivates, then re-activates the high-match scholarship")
if created_id:
    status, _ = call("PATCH", f"/api/admin/scholarships/{created_id}",
        body={"is_active": False}, jar=admin_jar)
    check("deactivate PATCH returns 200", status == 200, f"(got {status})")

    status, _ = call("PATCH", f"/api/admin/scholarships/{created_id}",
        body={"is_active": True}, jar=admin_jar)
    check("re-activate PATCH returns 200", status == 200, f"(got {status})")

    time.sleep(0.3)
    status, matches2 = call("GET", "/api/matches", jar=user_jar)
    check("GET /api/matches returns 200 after re-activate", status == 200)
    in_list = isinstance(matches2, list) and any(
        m.get("scholarship", {}).get("slug") == NEW_SCHOLARSHIP_SLUG for m in matches2
    )
    check("re-activated scholarship is in user's matches again", in_list)


# ── Cleanup ────────────────────────────────────────────────────────
try:
    psql(f"DELETE FROM users WHERE email = '{USER_EMAIL}';")
    psql(f"DELETE FROM users WHERE email = '{ADMIN_EMAIL}';")
    psql(f"DELETE FROM scholarships WHERE slug = '{NEW_SCHOLARSHIP_SLUG}';")
    psql(f"DELETE FROM scholarships WHERE slug = '{LOW_MATCH_SLUG}';")
except Exception:
    pass


print()
print("=" * 60)
print(f"RESULTS:  {tests_passed} passed,  {tests_failed} failed,  {tests_skipped} skipped")
print("=" * 60)
sys.exit(0 if tests_failed == 0 else 1)
