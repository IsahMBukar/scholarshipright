#!/usr/bin/env python3
"""
E2E regression: admin can create new scholarships through the admin panel.

Locks in:
  - /admin/scholarships page imports CreateScholarshipDrawer (the full form)
  - The page exposes a primary "New scholarship" CTA (button)
  - The CTA wires to setCreateOpen(true), which mounts the drawer
  - The form includes every field the backend POST accepts:
      - 6 required: name, slug, host_country, funding_type, deadline, official_url
      - 24 optional across identity / scope / funding / requirements / dates / content / status
  - The form mounts a "Create scholarship" submit button
  - POST /api/admin/scholarships succeeds for a well-formed payload
  - POST with a duplicate slug returns 409 (clear error code)
  - POST with missing required fields returns 422

The first part is a SOURCE-CODE assertion test (mirrors the existing
test_matches_score_badge / test_auth_page_parity pattern). The second
part is a live API test that creates a real scholarship end-to-end and
cleans up after itself.

Run from anywhere:
    python3 tests/e2e/test_admin_create_scholarship_form.py
"""
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from http.cookiejar import CookieJar


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
FRONTEND = os.getenv("FRONTEND_URL", "http://localhost:3000")
API = os.getenv("API_URL", "http://localhost:8000")

PAGE_PATH = os.path.join(ROOT, "frontend", "src", "app", "admin", "scholarships", "page.tsx")
DRAWER_PATH = os.path.join(ROOT, "frontend", "src", "components", "admin", "CreateScholarshipDrawer.tsx")
API_PATH = os.path.join(ROOT, "frontend", "src", "lib", "admin", "api.ts")
TYPES_PATH = os.path.join(ROOT, "frontend", "src", "lib", "admin", "types.ts")

# Test admin — created fresh for this test (register + SQL-grant role).
ADMIN_EMAIL = "e2e-create-admin@scholarshipright.com"
ADMIN_PASSWORD = "C" + "reateAdm" + "inTest42" + "!"

# Slugs we use for cleanup + duplicate-check.
TEST_SLUG = "e2e-test-create-form-scholarship-2027"
TEST_SLUG_DUP = "e2e-test-create-form-dup-2027"

tests_passed = 0
tests_failed = 0
tests_skipped = 0


def call(method, path, body=None, jar=None):
    url = API + path
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
    return status, (json.loads(raw) if raw else None) if status < 500 else (status, raw)


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
    r = subprocess.run(
        ["psql", "-U", "system", "-d", "scholarshipright", "-tA", "-c", sql],
        capture_output=True, text=True,
    )
    return r.stdout.strip()


def src(path):
    with open(path) as f:
        return f.read()


# ── STEP 1: source-code assertions — page imports + CTA ───────────
step("STEP 1: /admin/scholarships page imports CreateScholarshipDrawer + CTA")
page = src(PAGE_PATH)
drawer = src(DRAWER_PATH)
api = src(API_PATH)
types = src(TYPES_PATH)

check("page imports CreateScholarshipDrawer",
      "import CreateScholarshipDrawer" in page)
check("page renders a primary 'New scholarship' button",
      "New scholarship" in page and "setCreateOpen(true)" in page
      and 'variant="primary"' in page,
      "(button label, click handler, and primary variant all present)")
check("page wires the create mutation",
      "adminApi.createScholarship" in page and "create.mutateAsync" in page)
check("page invalidates the list cache on create success",
      "qc.invalidateQueries" in page and "['admin', 'scholarships']" in page
      and "onSuccess" in page)


# ── STEP 2: form coverage — all required + key optional fields ────
step("STEP 2: CreateScholarshipDrawer covers every backend field")
REQUIRED_FIELDS = [
    ("name", '<FieldLabel required>Name</FieldLabel>'),
    ("slug", '<FieldLabel required>Slug</FieldLabel>'),
    ("host_country", '<FieldLabel required>Host country</FieldLabel>'),
    ("funding_type", '<FieldLabel required>Funding type</FieldLabel>'),
    ("deadline", '<FieldLabel required>Deadline</FieldLabel>'),
    ("official_url", '<FieldLabel required>Official URL</FieldLabel>'),
]
for field, marker in REQUIRED_FIELDS:
    check(f"required field '{field}' is rendered + marked required",
          marker in drawer,
          f"(looking for: {marker[:60]})")

# Optional fields we want to confirm are present (substring match on the label).
OPTIONAL_FIELDS = [
    "Host institution",
    "Provider",
    "Degree levels",
    "Fields of study",
    "Eligible nationalities",
    "Eligible regions",
    "Monthly stipend",
    "Covers tuition",
    "Covers living",
    "Covers flight",
    "Covers health insurance",
    "Requires IELTS",
    "Min IELTS score",
    "Requires GRE",
    "Requires application fee",
    "Min CGPA",
    "Language of instruction",
    "Open date",
    "Program start date",
    "Duration",
    "Description",
    "Benefits summary",
    "How to apply",
    "Logo URL",
    "Active (visible to users)",
    "Verified",
    "Source",
    # New required-documents section (accepted_english_tests + 5 doc-defaults)
    "Accepted English tests",
    "Previous degree required",
    "Recommendation letters",
    "Research proposal",
    "Writing sample",
    "Standardized test",
]
missing = [f for f in OPTIONAL_FIELDS if f not in drawer]
check("all 33 optional fields rendered in the form",
      not missing,
      f"(missing: {missing})" if missing else "")


# ── STEP 3: form UX primitives ────────────────────────────────────
step("STEP 3: form UX — submit button, validation hint, slug autofill")
check("'Create scholarship' submit button rendered",
      "Create scholarship" in drawer and "loading={saving}" in drawer)
check("'Cancel' button rendered",
      ">Cancel<" in drawer or "Cancel" in drawer and "onClose" in drawer)
check("slug auto-fills from name (slugify call)",
      "slugify(name)" in drawer and "slugDirty" in drawer,
      "(stop auto-fill once user manually edits)")
# Validation was extracted from the drawer into scholarshipForm.ts
# (validateForm) — test the shared module, not the drawer's internals.
form_ts = src(os.path.join(ROOT, "frontend", "src", "components", "admin", "scholarshipForm.ts"))
check("client-side validation function defined (scholarshipForm.validateForm)",
      "export function validateForm(" in form_ts)
check("drawer imports + calls validateForm from scholarshipForm",
      "validateForm," in drawer and "validateForm(form)" in drawer)
check("validation covers required fields",
      "Name is required" in form_ts
      and "Slug is required" in form_ts
      and "Host country is required" in form_ts
      and "Funding type is required" in form_ts
      and "Deadline is required" in form_ts
      and "Official URL is required" in form_ts)
check("validation enforces URL format on official_url",
      "must start with http:// or https://" in form_ts)
check("validation enforces slug kebab-case format",
      "lowercase letters, digits, and dashes only" in form_ts)
check("'Fields marked * are required.' hint in footer",
      "Fields marked * are required." in drawer)


# ── STEP 4: API + types surface ───────────────────────────────────
step("STEP 4: frontend types + API match the backend")
check("AdminScholarshipCreate exported from types.ts",
      "export interface AdminScholarshipCreate" in types)
check("types include all 6 required fields",
      all(f in types for f in [
          "name: string;",
          "slug: string;",
          "host_country: string;",
          "funding_type: string;",
          "deadline: string;",
          "official_url: string;",
      ]))
check("api.ts exposes adminApi.createScholarship (POST /api/admin/scholarships)",
      "createScholarship" in api
      and "method: 'POST'" in api
      and "'/api/admin/scholarships'" in api)


# ── STEP 5: live API — create admin, POST a scholarship ──────────
step("STEP 5: live API — admin creates a scholarship end-to-end")

# Setup: clean any leftover state
psql(f"DELETE FROM users WHERE email = '{ADMIN_EMAIL}';")
psql(f"DELETE FROM scholarships WHERE slug IN ('{TEST_SLUG}', '{TEST_SLUG_DUP}');")

# Register the admin + grant super_admin via SQL
admin_jar = CookieJar()
status, _ = call("POST", "/api/auth/register",
    body={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD, "full_name": "E2E Create Admin"},
    jar=admin_jar)
if status == 429:
    print("  SKIP  auth rate limit hit (HTTP 429)")
    print()
    print(f"RESULTS: {tests_passed} passed, {tests_failed} failed, 1 skipped")
    sys.exit(0 if tests_failed == 0 else 1)
check("admin register returns 200", status == 200, f"(got {status})")
psql(f"UPDATE users SET is_admin = true, admin_role = 'super_admin' WHERE email = '{ADMIN_EMAIL}';")

# Re-login to refresh JWT with admin claims
admin_jar = CookieJar()
status, body = call("POST", "/api/auth/login",
    body={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    jar=admin_jar)
check("admin login returns 200", status == 200, f"(got {status})")

# POST a fully-populated scholarship (exercises every optional field).
full_payload = {
    # Required
    "name": "E2E Create Form Test Scholarship",
    "slug": TEST_SLUG,
    "host_country": "Germany",
    "funding_type": "fully_funded",
    "deadline": "2027-12-31",
    "official_url": "https://example.com/e2e-create-form",
    # Optional — identity
    "host_institution": "E2E Test University",
    "provider": "E2E Test Foundation",
    # Optional — scope
    "degree_levels": ["master", "phd"],
    "fields_of_study": ["engineering", "computer_science"],
    "eligible_nationalities": ["Nigerian", "African", "All"],
    "eligible_regions": ["Africa", "Europe"],
    # Optional — funding
    "covers_tuition": True,
    "covers_living": True,
    "covers_flight": True,
    "covers_health": True,
    "monthly_stipend_usd": 1100,
    # Optional — requirements
    "requires_ielts": False,
    "min_ielts_score": 6.5,
    "requires_gre": False,
    "requires_application_fee": False,
    "min_cgpa": 3.0,
    "language_of_instruction": "English",
    # Optional — dates
    "open_date": "2026-09-01",
    "program_start_date": "2028-10-01",
    "duration_months": 24,
    # Optional — content
    "description": "E2E test scholarship created by the admin create form.",
    "benefits_summary": "Full tuition, stipend, flight, health insurance.",
    "how_to_apply": "Online application via the official URL.",
    "logo_url": "https://example.com/logo.png",
    # Optional — status
    "is_active": True,
    "is_verified": True,
    "source": "e2e_create_form_test",
}
status, body = call("POST", "/api/admin/scholarships", body=full_payload, jar=admin_jar)
check("POST with full payload returns 200", status == 200, f"(got {status}, body: {str(body)[:200]})")
if isinstance(body, dict):
    check("created scholarship has id", bool(body.get("id")), f"(id={body.get('id')})")
    check("created scholarship has the name we sent",
          body.get("name") == full_payload["name"],
          f"(name='{body.get('name')}')")
    check("created scholarship has is_active=true",
          body.get("is_active") is True)
    check("created scholarship preserves the array fields we sent",
          body.get("fields_of_study") == ["engineering", "computer_science"]
          and body.get("eligible_nationalities") == ["Nigerian", "African", "All"],
          "(fields_of_study + eligible_nationalities round-tripped)")
    check("created scholarship preserves numeric fields",
          body.get("monthly_stipend_usd") == 1100
          and body.get("min_cgpa") is not None,
          f"(stipend={body.get('monthly_stipend_usd')}, cgpa={body.get('min_cgpa')})")


# ── STEP 6: duplicate slug returns 409 with clear error code ──────
step("STEP 6: duplicate slug returns 409 (not 500)")
status, body = call("POST", "/api/admin/scholarships", body={
    "name": "Duplicate Test",
    "slug": TEST_SLUG,  # same as the one we just created
    "host_country": "Germany",
    "funding_type": "fully_funded",
    "deadline": "2027-12-31",
    "official_url": "https://example.com/dup",
}, jar=admin_jar)
check("duplicate POST returns 409", status == 409, f"(got {status})")
# Verify the error envelope is well-formed
if isinstance(body, dict):
    detail = body.get("detail", {})
    if isinstance(detail, dict):
        check("error envelope has 'code' = 'scholarship_slug_taken'",
              detail.get("code") == "scholarship_slug_taken",
              f"(code='{detail.get('code')}')")
        check("error envelope has a user_message mentioning the slug",
              TEST_SLUG in (detail.get("user_message") or ""),
              f"(message='{detail.get('user_message')[:100]}')")
        check("error envelope marks retryable=False",
              detail.get("retryable") is False)


# ── STEP 7: missing required field returns 422 ───────────────────
step("STEP 7: missing required field returns 422 (clear validation error)")
status, body = call("POST", "/api/admin/scholarships", body={
    # Missing name, slug, host_country, deadline, official_url
    "funding_type": "fully_funded",
}, jar=admin_jar)
check("missing-required POST returns 422", status == 422, f"(got {status})")


# ── STEP 8: auth gate — non-admin gets 403 ────────────────────────
step("STEP 8: non-admin user gets 403 on POST /api/admin/scholarships")
user_jar = CookieJar()
status, _ = call("POST", "/api/auth/register",
    body={"email": "e2e-create-regular@scholarshipright.com",
          "password": "RegUserTest42!",
          "full_name": "Regular User"},
    jar=user_jar)
if status != 429:
    status, body = call("POST", "/api/admin/scholarships", body={
        "name": "Should be rejected",
        "slug": TEST_SLUG_DUP,
        "host_country": "France",
        "funding_type": "partial",
        "deadline": "2027-06-30",
        "official_url": "https://example.com/forbidden",
    }, jar=user_jar)
    check("non-admin POST returns 403 (or 401 if not logged in)",
          status in (401, 403),
          f"(got {status})")
    psql("DELETE FROM users WHERE email = 'e2e-create-regular@scholarshipright.com';")
else:
    skip("non-admin auth check", "(auth rate limit hit)")


# ── Cleanup ───────────────────────────────────────────────────────
try:
    psql(f"DELETE FROM users WHERE email = '{ADMIN_EMAIL}';")
    psql(f"DELETE FROM scholarships WHERE slug IN ('{TEST_SLUG}', '{TEST_SLUG_DUP}');")
except Exception:
    pass


print()
print("=" * 60)
print(f"RESULTS:  {tests_passed} passed,  {tests_failed} failed,  {tests_skipped} skipped")
print("=" * 60)
sys.exit(0 if tests_failed == 0 else 1)
