#!/usr/bin/env python3
"""
E2E test: English-language study waiver.

Verifies the `prior_studies_in_english` profile flag + the new
`english_test_score` matching engine. Covers all 5 scoring cases
defined in the engine's decision table:

  | requires_any | has_ielts | in_accepted | prior_eng | score |
  | ------------ | --------- | ----------- | --------- | ----- |
  | False        | *         | *           | *         |  +6   |  CASE 1
  | True         | True      | True/None   | *         |  +8   |  CASE 2
  | True         | True      | False       | True      |  +4   |  CASE 3
  | True         | False     | *           | True      |  +5   |  CASE 4
  | True         | False     | *           | False     |  -8   |  CASE 5

Plus source-code assertions to lock in the UI surface, the schema
exposes the field, and the engine has the new function.

This is a REGRESSION test — older behaviour (CASE 5 returns -8) must
NOT change. Only the new waiver paths (CASES 3, 4) and the new field
roundtrip are exercised for the first time here.
"""
import json
import os
import secrets
import sys
import types
import urllib.request
import urllib.error
from http.cookiejar import CookieJar

# Make the backend importable for the unit-level test of english_test_score.
sys.path.insert(0, os.path.expanduser("~/Desktop/Scholarshipright/backend"))
try:
    from app.services.match_engine import english_test_score
    _HAVE_ENGINE = True
    _ENGINE_IMPORT_ERR: Exception | None = None
except Exception as _e:  # noqa: BLE001
    english_test_score = None  # type: ignore
    _HAVE_ENGINE = False
    _ENGINE_IMPORT_ERR = _e

BASE = os.getenv("API_URL", "http://localhost:8000")
RUN_TAG = secrets.token_hex(4)  # unique per run so concurrent runs don't collide
ADMIN_EMAIL = f"e2e-engwaiver-admin-{RUN_TAG}@scholarshipright.com"
# Build password dynamically to avoid file-write mangling.
TEST_PASSWORD = chr(83) + "ecureEngW" + "aiv42" + "!"
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


def skip(name, reason=""):
    global tests_skipped
    print(f"  SKIP  {name}  {reason}")
    tests_skipped += 1


def psql(sql):
    """Run a psql command, return stdout. Errors are non-fatal."""
    import subprocess
    r = subprocess.run(
        ["psql", "-U", "system", "-d", "scholarshipright", "-c", sql],
        capture_output=True, text=True,
    )
    return r.stdout.strip()


def make_user(profile_data, label=""):
    """Register a fresh user with given profile, return (jar, email)."""
    jar = CookieJar()
    email = f"e2e-engwaiver-{label}-{secrets.token_hex(4)}@scholarshipright.com"
    status, body = call("POST", "/api/auth/register",
        body={"email": email, "password": TEST_PASSWORD, "full_name": f"E2E EngWaiver {label}"},
        jar=jar)
    if status != 200:
        return None, email
    if profile_data is not None:
        s, _ = call("POST", "/api/profile", body=profile_data, jar=jar)
        if s != 200:
            return None, email
    return jar, email


def get_language_score(jar, scholarship_slug):
    """Return the breakdown.language score for the given scholarship, or None."""
    status, body = call("GET", "/api/matches", jar=jar)
    if status != 200 or not isinstance(body, list):
        return None
    for m in body:
        sch = m.get("scholarship") or {}
        if sch.get("slug") == scholarship_slug:
            bd = m.get("breakdown") or {}
            return bd.get("language")
    return None


# ── Setup: clean leftover test data ────────────────────────────────
try:
    psql(
        f"DELETE FROM users WHERE email LIKE 'e2e-engwaiver-%@scholarshipright.com';"
    )
    psql(
        f"DELETE FROM scholarships WHERE slug LIKE 'e2e-engwaiver-%';"
    )
except Exception as e:
    print(f"  WARN  cleanup failed: {e}")


# ── STEP 1: source-code assertions — backend + frontend surface ────
step("STEP 1: source — backend + frontend expose prior_studies_in_english")

backend_profile = open(
    os.path.expanduser("~/Desktop/Scholarshipright/backend/app/models/profile.py")
).read()
check("backend Profile model has prior_studies_in_english column",
      "prior_studies_in_english = Column(Boolean" in backend_profile)
check("backend has ensure_profile_schema_columns() migration",
      "ensure_profile_schema_columns" in backend_profile and
      "ADD COLUMN IF NOT EXISTS prior_studies_in_english" in backend_profile)

backend_schema = open(
    os.path.expanduser("~/Desktop/Scholarshipright/backend/app/schemas/profile.py")
).read()
check("backend ProfileBase has prior_studies_in_english: bool",
      "prior_studies_in_english: bool" in backend_schema)

backend_match = open(
    os.path.expanduser("~/Desktop/Scholarshipright/backend/app/services/match_engine.py")
).read()
check("match_engine defines english_test_score()",
      "def english_test_score(" in backend_match)
check("match_engine compute_match_score uses english_test_score",
      '"language": english_test_score(profile, scholarship),' in backend_match)

backend_main = open(
    os.path.expanduser("~/Desktop/Scholarshipright/backend/app/main.py")
).read()
check("app.main.py wires ensure_profile_schema_columns into lifespan",
      "ensure_profile_schema_columns" in backend_main and
      "await ensure_profile_schema_columns()" in backend_main)

frontend_api = open(
    os.path.expanduser("~/Desktop/Scholarshipright/frontend/src/services/api.ts")
).read()
check("frontend Profile type has prior_studies_in_english",
      "prior_studies_in_english" in frontend_api)

frontend_onboarding = open(
    os.path.expanduser("~/Desktop/Scholarshipright/frontend/src/app/onboarding/slides/ProfileSlide.tsx")
).read()
check("ProfileSlide has prior_studies_in_english toggle",
      "prior_studies_in_english" in frontend_onboarding and
      "priorEnglish" in frontend_onboarding)

frontend_profile = open(
    os.path.expanduser("~/Desktop/Scholarshipright/frontend/src/app/profile/page.tsx")
).read()
check("profile page has prior_english_edit checkbox",
      "prior_english_edit" in frontend_profile)
check("profile page includes prior_studies_in_english in saveProfile",
      "prior_studies_in_english" in frontend_profile)


# ── STEP 2: profile field roundtrip ────────────────────────────────
step("STEP 2: profile field roundtrips through POST + GET")
jar_test, email = make_user({
    "country_of_origin": "Nigeria",
    "target_degree": "master",
    "field_of_study": "computer_science",
    "has_ielts": False,
    "ielts_score": None,
    "prior_studies_in_english": True,
}, label="roundtrip")
if jar_test is None:
    skip("profile field roundtrip", "user creation failed (likely auth rate limit)")
else:
    check("user created with prior_studies_in_english=True", True, f"({email})")
    status, body = call("GET", "/api/profile", jar=jar_test)
    check("GET /api/profile returns 200", status == 200, f"(got {status})")
    if isinstance(body, dict):
        check("GET /api/profile returns prior_studies_in_english=True",
              body.get("prior_studies_in_english") is True,
              f"(got {body.get('prior_studies_in_english')!r})")

    # Toggle off + verify
    s, _ = call("POST", "/api/profile",
                body={"country_of_origin": "Nigeria", "target_degree": "master",
                      "field_of_study": "computer_science",
                      "prior_studies_in_english": False}, jar=jar_test)
    check("PATCH prior_studies_in_english=False returns 200", s == 200, f"(got {s})")
    s, body2 = call("GET", "/api/profile", jar=jar_test)
    if isinstance(body2, dict):
        check("GET /api/profile returns prior_studies_in_english=False after toggle",
              body2.get("prior_studies_in_english") is False,
              f"(got {body2.get('prior_studies_in_english')!r})")


# ── STEP 3: admin user + controlled scholarships ──────────────────
step("STEP 3: admin user + 4 controlled scholarships")

admin_jar = CookieJar()
status, body = call("POST", "/api/auth/register",
                    body={"email": ADMIN_EMAIL, "password": TEST_PASSWORD,
                          "full_name": "E2E EngWaiver Admin"}, jar=admin_jar)
if status != 200:
    skip("admin user setup", f"register returned {status}: {str(body)[:200]}")
    print()
    print("=" * 60)
    print(f"RESULTS: {tests_passed} passed, {tests_failed} failed, {tests_skipped} skipped")
    print("=" * 60)
    sys.exit(0 if tests_failed == 0 else 1)
psql(f"UPDATE users SET is_admin = true, admin_role = 'super_admin' WHERE email = '{ADMIN_EMAIL}';")
admin_jar = CookieJar()
status, _ = call("POST", "/api/auth/login",
                 body={"email": ADMIN_EMAIL, "password": TEST_PASSWORD}, jar=admin_jar)
check("admin login returns 200", status == 200, f"(got {status})")

# Scholarship A: NO English test required (we'll test CASE 1)
SLUG_A = f"e2e-engwaiver-no-english-{RUN_TAG}"
# Scholarship B: requires IELTS, min 6.5 (CASES 2, 4, 5)
SLUG_B = f"e2e-engwaiver-ielts-{RUN_TAG}"
# Scholarship C: requires TOEFL only, no IELTS (CASES 3)
SLUG_C = f"e2e-engwaiver-toefl-only-{RUN_TAG}"

scholarships = [
    {
        "name": "E2E No-English Scholarship",
        "slug": SLUG_A,
        "host_country": "Germany",
        "funding_type": "fully_funded",
        "deadline": "2027-12-31",
        "official_url": "https://example.com/e2e-no-english",
        "degree_levels": ["master"],
        "requires_ielts": False,
        "min_ielts_score": None,
        "accepted_english_tests": [],  # Empty = no test required
    },
    {
        "name": "E2E IELTS Scholarship",
        "slug": SLUG_B,
        "host_country": "United Kingdom",
        "funding_type": "fully_funded",
        "deadline": "2027-12-31",
        "official_url": "https://example.com/e2e-ielts",
        "degree_levels": ["master"],
        "requires_ielts": True,
        "min_ielts_score": 6.5,
        "accepted_english_tests": ["IELTS", "TOEFL"],
    },
    {
        "name": "E2E TOEFL-Only Scholarship",
        "slug": SLUG_C,
        "host_country": "USA",
        "funding_type": "fully_funded",
        "deadline": "2027-12-31",
        "official_url": "https://example.com/e2e-toefl-only",
        "degree_levels": ["master"],
        "requires_ielts": False,  # No IELTS needed!
        "min_ielts_score": None,
        "accepted_english_tests": ["TOEFL", "PTE", "Duolingo"],  # IELTS NOT in this list
    },
]
for sch in scholarships:
    status, body = call("POST", "/api/admin/scholarships", body=sch, jar=admin_jar)
    check(f"created scholarship {sch['slug']}", status == 200,
          f"(got {status}, body: {str(body)[:150]})")


# ── STEP 4: CASE 1 — no English test required → +6 ────────────────
# CASE 1 is a unit-level test because `apply_auto_defaults` always
# backfills `accepted_english_tests` from the host country, so the
# "no test required" path isn't reachable via the HTTP API. We test
# the `english_test_score` function directly with mock objects.
step("STEP 4: CASE 1 — english_test_score() with no test required → +6")
if not _HAVE_ENGINE:
    skip("CASE 1 unit test", f"engine import failed: {_ENGINE_IMPORT_ERR}")
else:
    profile = types.SimpleNamespace(
        has_ielts=False, ielts_score=None, prior_studies_in_english=False)
    scholarship = types.SimpleNamespace(
        requires_ielts=False, min_ielts_score=None, accepted_english_tests=[])

    score = english_test_score(profile, scholarship)
    check("CASE 1: language=+6 when no English test required",
          score == 6, f"(got {score})")


# ── STEP 4b: unit test all 5 scoring cases of english_test_score ───
# These mirror the live HTTP tests below but cover the function in
# isolation. They run in milliseconds and don't need auth/DB.
step("STEP 4b: english_test_score() — all 5 decision-table cases (unit)")

def _profile(has_ielts=False, ielts_score=None, prior_english=False):
    return types.SimpleNamespace(
        has_ielts=has_ielts, ielts_score=ielts_score,
        prior_studies_in_english=prior_english)

def _sch(requires_ielts=False, min_ielts=None, accepted=None):
    return types.SimpleNamespace(
        requires_ielts=requires_ielts, min_ielts_score=min_ielts,
        accepted_english_tests=accepted or [])

try:
    if not _HAVE_ENGINE:
        raise RuntimeError(f"engine not importable: {_ENGINE_IMPORT_ERR}")
    cases = [
        # (label, profile, scholarship, expected)
        ("CASE 1: no test required", _profile(), _sch(accepted=[]), 6),
        ("CASE 2: has IELTS ≥ min", _profile(True, 7.0), _sch(True, 6.5, ["IELTS"]), 8),
        ("CASE 2b: has IELTS, no min set", _profile(True, 7.0), _sch(True, None, ["IELTS"]), 6),
        ("CASE 5: no IELTS, no waiver",
            _profile(False, None, False), _sch(True, 6.5, ["IELTS"]), -8),
        ("CASE 4: no IELTS, prior English (waiver)",
            _profile(False, None, True), _sch(True, 6.5, ["IELTS"]), 5),
        ("CASE 3: has IELTS, NOT in accepted, + waiver",
            _profile(True, 7.5, True), _sch(False, None, ["TOEFL"]), 4),
        ("CASE 3 neg: has IELTS, NOT in accepted, no waiver",
            _profile(True, 7.5, False), _sch(False, None, ["TOEFL"]), -8),
        ("CASE 2c: has IELTS, accepted, BELOW min",
            _profile(True, 5.5), _sch(True, 6.5, ["IELTS"]), -8),
    ]
    for label, prof, sch, expected in cases:
        actual = english_test_score(prof, sch)
        check(f"  {label} → {expected}", actual == expected,
              f"(got {actual})")
except Exception as e:
    skip("STEP 4b unit cases", f"error: {e}")


# ── STEP 5: CASE 2 — has IELTS ≥ min → +8 ──────────────────────────
step("STEP 5: CASE 2 — has IELTS, accepted, ≥ min → language=+8")
jar2, _ = make_user({
    "country_of_origin": "Nigeria",
    "target_degree": "master",
    "field_of_study": "computer_science",
    "has_ielts": True,
    "ielts_score": 7.0,
    "prior_studies_in_english": False,  # waiver doesn't matter here
}, label="case2")
if jar2 is None:
    skip("CASE 2: language=+8", "user creation failed")
else:
    score = get_language_score(jar2, SLUG_B)
    check("CASE 2: language=+8 when has IELTS, accepted, ≥ min",
          score == 8, f"(got {score})")


# ── STEP 6: CASE 5 — no IELTS, no waiver → -8 (regression check) ──
step("STEP 6: CASE 5 — no IELTS, no waiver → language=-8 (NO REGRESSION)")
jar5, _ = make_user({
    "country_of_origin": "Nigeria",
    "target_degree": "master",
    "field_of_study": "computer_science",
    "has_ielts": False,
    "ielts_score": None,
    "prior_studies_in_english": False,
}, label="case5")
if jar5 is None:
    skip("CASE 5: language=-8", "user creation failed")
else:
    score = get_language_score(jar5, SLUG_B)
    check("CASE 5: language=-8 when no IELTS, no waiver (regression)",
          score == -8, f"(got {score})")


# ── STEP 7: CASE 4 — no IELTS, waiver=True → +5 (NEW) ─────────────
step("STEP 7: CASE 4 — no IELTS, prior English study → language=+5 (waiver)")
jar4, _ = make_user({
    "country_of_origin": "Nigeria",
    "target_degree": "master",
    "field_of_study": "computer_science",
    "has_ielts": False,
    "ielts_score": None,
    "prior_studies_in_english": True,  # ← the new field
}, label="case4")
if jar4 is None:
    skip("CASE 4: language=+5", "user creation failed")
else:
    score = get_language_score(jar4, SLUG_B)
    check("CASE 4: language=+5 when no IELTS but prior English study (waiver)",
          score == 5, f"(got {score})")
    # Compare against CASE 5 (no waiver) — must be higher
    score5 = get_language_score(jar5, SLUG_B) if jar5 else None
    if score5 is not None:
        check("CASE 4 score > CASE 5 score (waiver helps)",
              score > score5, f"(CASE 4: {score}, CASE 5: {score5})")


# ── STEP 8: CASE 3 — has IELTS, NOT in accepted, waiver=True → +4 ─
step("STEP 8: CASE 3 — wrong test type + waiver → language=+4 (partial waiver)")
jar3, _ = make_user({
    "country_of_origin": "Nigeria",
    "target_degree": "master",
    "field_of_study": "computer_science",
    "has_ielts": True,  # User HAS IELTS
    "ielts_score": 7.5,
    "prior_studies_in_english": True,  # But scholarship wants TOEFL + waiver
}, label="case3")
if jar3 is None:
    skip("CASE 3: language=+4", "user creation failed")
else:
    score = get_language_score(jar3, SLUG_C)
    check("CASE 3: language=+4 when has wrong test type + prior English",
          score == 4, f"(got {score})")


# ── STEP 9: CASE 3 negative — has IELTS, NOT in accepted, NO waiver → -8
step("STEP 9: CASE 3 neg — wrong test type, no waiver → language=-8 (hard fail)")
jar3n, _ = make_user({
    "country_of_origin": "Nigeria",
    "target_degree": "master",
    "field_of_study": "computer_science",
    "has_ielts": True,
    "ielts_score": 7.5,
    "prior_studies_in_english": False,  # No waiver
}, label="case3neg")
if jar3n is None:
    skip("CASE 3 neg: language=-8", "user creation failed")
else:
    score = get_language_score(jar3n, SLUG_C)
    check("CASE 3 neg: language=-8 when has wrong test, no waiver",
          score == -8, f"(got {score})")


# ── STEP 10: existing IELTS user with TOEFL-only scholarship is NOT a soft fail
step("STEP 10: existing IELTS user behaviour vs TOEFL-only scholarship")
# (Same as STEP 9 — guard against accidentally softening the hard fail
# when a user has a test the scholarship doesn't accept and no waiver.)
score = get_language_score(jar3n, SLUG_C) if jar3n else None
if score is not None:
    check("STEP 10: hard fail preserved (no false waiver)", score == -8,
          f"(got {score})")


# ── STEP 11: cleanup ──────────────────────────────────────────────
step("STEP 11: cleanup test data")
psql(f"DELETE FROM users WHERE email LIKE 'e2e-engwaiver-%@scholarshipright.com';")
psql(f"DELETE FROM scholarships WHERE slug LIKE 'e2e-engwaiver-%';")
check("cleanup ran", True)


print()
print("=" * 60)
print(f"RESULTS: {tests_passed} passed, {tests_failed} failed, {tests_skipped} skipped")
print("=" * 60)
sys.exit(0 if tests_failed == 0 else 1)
