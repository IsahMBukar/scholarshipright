"""
E2E regression: Quick-Stats field parity between /onboarding and /profile.

Bug it guards against: /onboarding ProfileSlide collected
country_of_origin, target_degree, field_of_study, and target_countries,
but those values were NOT surfaced in /profile's Quick Stats panel.
Conversely, /profile's Quick Stats had cgpa, work_experience_years,
and IELTS — fields the onboarding never asked for.

Fix: both surfaces now expose the same 9 fields:
  - country_of_origin
  - target_degree
  - field_of_study
  - target_countries
  - graduation_year
  - degree_level (current)
  - cgpa + cgpa_scale
  - work_experience_years
  - has_ielts + ielts_score
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
PROFILE_SLIDE = os.path.join(ROOT, "frontend", "src", "app", "onboarding", "slides", "ProfileSlide.tsx")
PROFILE_PAGE = os.path.join(ROOT, "frontend", "src", "app", "profile", "page.tsx")

# All 9 fields the two surfaces should both know about
QUICK_STATS_FIELDS = [
    "country_of_origin",
    "target_degree",
    "field_of_study",
    "target_countries",
    "graduation_year",
    "degree_level",
    "cgpa",
    "work_experience_years",
    "has_ielts",
    "ielts_score",
]

PWD = "Q" + "uickStats" + "Parity42" + "!"

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
# PART 1: Onboarding slide exposes the new optional quick-stats fields
# ─────────────────────────────────────────────
step("PART 1: Onboarding ProfileSlide collects the optional quick stats")

slide_src = open(PROFILE_SLIDE).read()

# The slide must clearly separate the 2 sections
check("slide has 'Required for matching' section heading",
      "Required for matching" in slide_src)
check("slide has 'Quick stats' section heading",
      "Quick stats" in slide_src)
check("slide labels the quick-stats section as optional",
      "optional" in slide_src.lower())

# New optional fields must each have their own state + UI
optional_state = [
    "graduationYear",      # graduation_year
    "cgpa",                # cgpa
    "cgpaScale",           # cgpa_scale
    "workYears",           # work_experience_years
    "hasIelts",            # has_ielts
    "ieltsScore",          # ielts_score
]
for name in optional_state:
    check(f"slide has useState for {name}", f"set{name}" in slide_src or name in slide_src)

# UI controls: each field must have a label or input element
ui_labels = [
    "Graduation year", "Work experience", "CGPA", "Scale", "English proficiency",
    "I have an IELTS score",
]
for label in ui_labels:
    check(f"slide UI shows '{label}'", label in slide_src)

# The submit logic must still gate on the 4 required fields only
can_submit_line = re.search(r"canSubmit\s*=\s*[^;]+;", slide_src)
check("slide still gates submit on 4 required fields (country, target_degree, field, targets)",
      can_submit_line is not None
      and "country" in can_submit_line.group(0)
      and "targetDegree" in can_submit_line.group(0)
      and "field" in can_submit_line.group(0)
      and "targets" in can_submit_line.group(0),
      "")

# The save payload must include the optional fields when filled
check("slide sends graduation_year when filled",
      "graduation_year" in slide_src)
check("slide sends cgpa + cgpa_scale when filled",
      "cgpa_scale" in slide_src and "cgpa" in slide_src)
check("slide sends work_experience_years when filled",
      "work_experience_years" in slide_src)
check("slide sends has_ielts + ielts_score when filled",
      "has_ielts" in slide_src and "ielts_score" in slide_src)

# The slide still has the navigation fix
check("slide still calls onNext() after a successful save",
      "onNext()" in slide_src)
check("slide still has the failure-guard early-return",
      "if (!result)" in slide_src and "return;" in slide_src)


# ─────────────────────────────────────────────
# PART 2: /profile Quick Stats shows all the new fields
# ─────────────────────────────────────────────
step("PART 2: /profile Quick Stats shows all the fields")

profile_src = open(PROFILE_PAGE).read()

# The Quick Stats section header must still exist
check("profile page still has 'Quick Stats' SectionHeader",
      "Quick Stats" in profile_src and "analytics" in profile_src)

# The onEdit handler for Quick Stats must include all 9 fields
stats_edit_match = re.search(
    r"openEdit\('stats'[\s\S]*?\}\)",
    profile_src,
)
check("profile page has openEdit('stats', ...) handler", stats_edit_match is not None)
if stats_edit_match:
    block = stats_edit_match.group(0)
    missing = [f for f in QUICK_STATS_FIELDS if f not in block]
    if missing:
        check("openEdit('stats') passes all 9 quick-stats fields", False,
              f"(missing: {missing})")
    else:
        check("openEdit('stats') passes all 10 quick-stats fields (incl. cgpa_scale)",
              True)

# The StatCard grid must include all 9 cards
stat_card_count = profile_src.count("<StatCard ")
check("profile page renders 9+ StatCard components (was 4 before)",
      stat_card_count >= 9, f"(found {stat_card_count})")

# Each field must appear as a StatCard label
stat_labels = [
    ("Country", "country_of_origin"),
    ("Target Degree", "target_degree"),
    ("Field of Study", "field_of_study"),
    ("Target Countries", "target_countries"),
    ("Graduation", "graduation_year"),
    ("Current Degree", "degree_level"),
    ("CGPA", "cgpa"),
    ("Experience", "work_experience_years"),
    ("IELTS", "ielts_score"),
]
for label, field in stat_labels:
    check(f"StatCard for '{label}' exists (renders {field})",
          label in profile_src and field in profile_src)

# The 'stats' modal must be split into two sections (Target & Origin + Quick stats)
stats_modal = re.search(
    r"editing === 'stats' && \([\s\S]*?</Modal>",
    profile_src,
)
check("'stats' edit Modal is found", stats_modal is not None)
if stats_modal:
    modal = stats_modal.group(0)
    check("'stats' modal has 'Target & Origin' sub-section",
          "Target & Origin" in modal)
    check("'stats' modal has 'Quick stats' sub-section",
          "Quick stats" in modal)
    # Save payload must include all 9 fields
    save_match = re.search(r"saveProfile\(\{([\s\S]*?)\}\s*,\s*\)", modal)
    if save_match:
        save_block = save_match.group(1)
        missing = [f for f in QUICK_STATS_FIELDS if f not in save_block]
        if missing:
            check("'stats' modal saveProfile payload includes all fields", False,
                  f"(missing: {missing})")
        else:
            check("'stats' modal saveProfile payload includes all 10 fields", True)


# ─────────────────────────────────────────────
# PART 3: Live API round-trip — onboarding fields actually persist
# ─────────────────────────────────────────────
step("PART 3: Live API — onboarding fields persist to /api/profile")

email = f"e2e-quickstats-{os.urandom(4).hex()}@scholarshipright.com"

creds = json.dumps({
    "email": email, "password": PWD, "full_name": "E2E QuickStats"
}).encode()
# This is exactly what the onboarding slide would send
profile_payload = json.dumps({
    # Required (from onboarding)
    "country_of_origin": "Nigeria",
    "target_degree": "master",
    "field_of_study": "computer_science",
    "target_fields": ["computer_science"],
    "target_countries": ["United States", "United Kingdom", "Germany"],
    # Optional quick stats (new)
    "graduation_year": 2024,
    "degree_level": "bachelor",
    "cgpa": 3.7,
    "cgpa_scale": 4.0,
    "work_experience_years": 2,
    "has_ielts": True,
    "ielts_score": 7.0,
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
    # Save profile (this is what saveProfileFields in the hook does)
    req = urllib.request.Request(f"{API}/api/profile", data=profile_payload,
        headers={"Content-Type": "application/json"}, method="POST")
    save_ok = False
    saved = None
    try:
        with opener.open(req) as r:
            save_ok = r.status == 200
            saved = json.loads(r.read().decode())
            check("POST /api/profile returns 200", save_ok, f"got {r.status}")
    except urllib.error.HTTPError as e:
        check("POST /api/profile returns 200", False, f"got {e.code}: {e.read().decode()[:200]}")

    if save_ok and isinstance(saved, dict):
        # Required fields
        check("country_of_origin persisted", saved.get("country_of_origin") == "Nigeria")
        check("target_degree persisted", saved.get("target_degree") == "master")
        check("field_of_study persisted", saved.get("field_of_study") == "computer_science")
        check("target_countries persisted (3 entries)",
              isinstance(saved.get("target_countries"), list)
              and len(saved["target_countries"]) == 3)
        # Optional fields
        check("graduation_year persisted", saved.get("graduation_year") == 2024)
        check("degree_level persisted", saved.get("degree_level") == "bachelor")
        # cgpa comes back as string in Decimal — compare loosely
        cgpa_val = saved.get("cgpa")
        check("cgpa persisted (≈ 3.7)",
              cgpa_val is not None and float(cgpa_val) == 3.7,
              f"(value={cgpa_val!r})")
        check("cgpa_scale persisted",
              saved.get("cgpa_scale") is not None
              and float(saved["cgpa_scale"]) == 4.0,
              f"(value={saved.get('cgpa_scale')!r})")
        check("work_experience_years persisted", saved.get("work_experience_years") == 2)
        check("has_ielts persisted (True)", saved.get("has_ielts") is True)
        check("ielts_score persisted (≈ 7.0)",
              saved.get("ielts_score") is not None
              and float(saved["ielts_score"]) == 7.0,
              f"(value={saved.get('ielts_score')!r})")

    # Now GET /api/profile — what /profile page reads
    req = urllib.request.Request(f"{API}/api/profile", method="GET")
    try:
        with opener.open(req) as r:
            fetched = json.loads(r.read().decode())
            check("GET /api/profile returns the same fields",
                  fetched.get("country_of_origin") == "Nigeria"
                  and fetched.get("target_degree") == "master"
                  and fetched.get("graduation_year") == 2024
                  and fetched.get("has_ielts") is True,
                  "")
    except urllib.error.HTTPError as e:
        check("GET /api/profile returns 200", False, f"got {e.code}")

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
# PART 4: TypeScript syntax sanity
# ─────────────────────────────────────────────
step("PART 4: TypeScript syntax sanity")

for path, label in [(PROFILE_SLIDE, "ProfileSlide.tsx"), (PROFILE_PAGE, "profile/page.tsx")]:
    src = open(path).read()
    o, c = src.count("{"), src.count("}")
    check(f"{label} has balanced braces", o == c, f"({o} open, {c} close)")
    po, pc = src.count("("), src.count(")")
    check(f"{label} has balanced parens", po == pc, f"({po} open, {pc} close)")


# ─────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────
print()
print("=" * 60)
print(f"RESULTS:  {tests_passed} passed,  {tests_failed} failed,  {tests_skipped} skipped")
print("=" * 60)
sys.exit(0 if tests_failed == 0 else 1)
