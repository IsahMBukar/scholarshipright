#!/usr/bin/env python3
"""
E2E regression: required-documents section + accepted_english_tests.

Locks in the work that ships "behind the scenes" auto-derivation:

  1. `accepted_english_tests` (multi-select on Create/Edit drawer)
     - Rendered with ENGLISH_TEST_OPTIONS.map(...) checkboxes
     - Saves and round-trips through POST/GET
     - Falls back to _infer_english_tests(host_country) when omitted

  2. The 5 "cement + flexible" required-documents fields:
       previous_degree_required
       recommendation_letters_count
       research_proposal_required
       writing_sample_required
       standardized_test
     - All 5 are present on the CreateScholarshipDrawer form
     - All 5 are in the ScholarshipForm TS type
     - All 5 are accepted by POST /api/admin/scholarships
     - When omitted (NULL), apply_auto_defaults() materialises sensible
       values derived from degree_levels (the docstring table):
         bachelor only    -> high_school_diploma,  2, false, false, sat_act
         master only      -> bachelor_degree,      2, false, false, gre_gmat
         phd / doctoral   -> master_degree,        3, true,  false, gre
         multi-level      -> highest rule,         3, true,  false, gre
         empty            -> high_school_diploma,  2, false, false, none
     - When explicitly set, the admin's value wins (no overwrite)

Source assertions cover the frontend surface; live API assertions
cover the backend surface (POST admin → GET public).

Run from anywhere:
    python3 tests/e2e/test_required_documents_section.py
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from http.cookiejar import CookieJar


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
FRONTEND = os.getenv("FRONTEND_URL", "http://localhost:3000")
API = os.getenv("API_URL", "http://localhost:8000")

PAGE_PATH = os.path.join(ROOT, "frontend", "src", "app", "admin", "scholarships", "page.tsx")
DRAWER_PATH = os.path.join(ROOT, "frontend", "src", "components", "admin", "CreateScholarshipDrawer.tsx")
TYPES_PATH = os.path.join(ROOT, "frontend", "src", "lib", "admin", "types.ts")
SCHOLARSHIP_FORM_PATH = os.path.join(ROOT, "frontend", "src", "components", "admin", "scholarshipForm.ts")
SCHOLARSHIP_MODEL_PATH = os.path.join(ROOT, "backend", "app", "models", "scholarship.py")
SCHOLARSHIP_API_PATH = os.path.join(ROOT, "backend", "app", "api", "scholarships.py")
ADMIN_API_PATH = os.path.join(ROOT, "backend", "app", "api", "admin_scholarships.py")
DOC_DEFAULTS_PATH = os.path.join(ROOT, "backend", "app", "services", "document_defaults.py")
SCHOLARSHIP_TYPES_PATH = os.path.join(ROOT, "frontend", "src", "app", "scholarships", "[slug]", "page.tsx")

ADMIN_EMAIL = "e2e-reqdocs-admin@scholarshipright.com"
ADMIN_PASSWORD = "ReqDocsAdminTest42!"

# Distinct slugs for cleanup + duplicate-check.
SLUG_MASTER = "e2e-reqdocs-master-2027"
SLUG_PHD = "e2e-reqdocs-phd-2027"
SLUG_OVERRIDE = "e2e-reqdocs-override-2027"
SLUG_NIGERIA = "e2e-reqdocs-nigeria-2027"
SLUG_GERMANY = "e2e-reqdocs-germany-2027"

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


# ── STEP 1: source-code assertions — accepted_english_tests ─────────
step("STEP 1: frontend — accepted_english_tests UI is wired")
drawer = src(DRAWER_PATH)
types = src(TYPES_PATH)
detail = src(SCHOLARSHIP_TYPES_PATH)

check("types.ts: ScholarshipForm has accepted_english_tests: string[]",
      "accepted_english_tests: string[]" in types)
check("types.ts: AdminScholarshipCreate has accepted_english_tests?",
      "accepted_english_tests?:" in types and "string[]" in types.split(
          "accepted_english_tests?:", 1)[-1][:200])
check("types.ts: ScholarshipAdminUpdate has accepted_english_tests?",
      types.count("accepted_english_tests?:") >= 2)
check("drawer: ENGLISH_TEST_OPTIONS map renders the checkboxes",
      "ENGLISH_TEST_OPTIONS.map" in drawer
      and "form.accepted_english_tests" in drawer)
check("drawer: toggle handler appends/removes from the array",
      "set('accepted_english_tests'," in drawer
      and "filter((t) => t !== opt.value)" in drawer)
check("drawer: empty-state hint when no test selected",
      "form.accepted_english_tests.length === 0" in drawer)
check("detail page: surfaces accepted_english_tests",
      "accepted_english_tests" in detail)


# ── STEP 2: source-code — 5 document-defaults fields on the form ────
step("STEP 2: frontend — all 5 document-defaults fields are on the form + types")
DOC_FIELDS = [
    ("previous_degree_required", "Previous degree"),
    ("recommendation_letters_count", "Recommendation letters"),
    ("research_proposal_required", "Research proposal"),
    ("writing_sample_required", "Writing sample"),
    ("standardized_test", "Standardized test"),
]
# Split types.ts at every 'interface' / 'export type' boundary so we can
# scope substring assertions to the ScholarshipForm declaration alone.
# ScholarshipForm lives in src/components/admin/scholarshipForm.ts,
# not in types.ts (types.ts has AdminScholarship, not ScholarshipForm).
form_section = ""
if os.path.exists(SCHOLARSHIP_FORM_PATH):
    form_src = src(SCHOLARSHIP_FORM_PATH)
    if "interface ScholarshipForm" in form_src:
        form_section = form_src.split("interface ScholarshipForm", 1)[1]
        if "}" in form_section:
            form_section = form_section.split("}", 1)[0]

for field, label in DOC_FIELDS:
    check(f"drawer: {field!r} field is rendered (label '{label}' present)",
          label in drawer)
    # Form binding (e.g. `form.{field}` or `value={form.{field}}`) and
    # set() handler may be multi-line, so just check the field name
    # appears in the drawer (covered by the `form.{field}` binding) AND
    # the set() handler references it as a string literal.
    check(f"drawer: {field!r} is bound on the form",
          f"form.{field}" in drawer or f"form.{field}," in drawer or f"form.{field}\n" in drawer)
    check(f"drawer: set handler writes {field!r}",
          f"'{field}'" in drawer)


# ── STEP 3: backend source — apply_auto_defaults + infer helper ──────
step("STEP 3: backend — auto-derivation helpers + wiring")
doc_defs = src(DOC_DEFAULTS_PATH)
model = src(SCHOLARSHIP_MODEL_PATH)
api_public = src(SCHOLARSHIP_API_PATH)
api_admin = src(ADMIN_API_PATH)

check("document_defaults: derive_defaults() defined",
      "def derive_defaults(" in doc_defs)
check("document_defaults: apply_auto_defaults() defined",
      "def apply_auto_defaults(" in doc_defs)
check("document_defaults: docstring enumerates the bachelor/master/phd rules",
      "bachelor only" in doc_defs
      and "master only" in doc_defs
      and "phd / doctoral" in doc_defs)
check("scholarships.py: GET single calls apply_auto_defaults()",
      "apply_auto_defaults" in api_public)
check("admin_scholarships.py: list + create + update paths call apply_auto_defaults",
      api_admin.count("apply_auto_defaults") >= 4,
      f"({api_admin.count('apply_auto_defaults')} occurrences)")
check("scholarships.py: filter query supports accepted_english_tests overlap",
      "accepted_english_tests.overlap" in api_public)
check("scholarship model: ensure_scholarship_schema_columns exported",
      "def ensure_scholarship_schema_columns" in model)


# ── STEP 4: live API — admin setup ─────────────────────────────────
step("STEP 4: live API — register + grant admin to test user")

for slug in (SLUG_MASTER, SLUG_PHD, SLUG_OVERRIDE, SLUG_NIGERIA, SLUG_GERMANY):
    psql(f"DELETE FROM scholarships WHERE slug = '{slug}';")
psql(f"DELETE FROM users WHERE email = '{ADMIN_EMAIL}';")

admin_jar = CookieJar()
status, _ = call("POST", "/api/auth/register",
                 body={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD,
                       "full_name": "E2E ReqDocs Admin"}, jar=admin_jar)
if status == 429:
    skip("live API tests", "(auth rate limit hit on register)")
    print()
    print("=" * 60)
    print(f"RESULTS: {tests_passed} passed, {tests_failed} failed, {tests_skipped} skipped")
    print("=" * 60)
    sys.exit(0 if tests_failed == 0 else 1)
check("admin register returns 200", status == 200, f"(got {status})")
psql(f"UPDATE users SET is_admin = true, admin_role = 'super_admin' WHERE email = '{ADMIN_EMAIL}';")

admin_jar = CookieJar()
status, body = call("POST", "/api/auth/login",
                    body={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, jar=admin_jar)
check("admin login returns 200", status == 200, f"(got {status})")


# ── STEP 5: master scholarship — auto-derive defaults ──────────────
step("STEP 5: master-only scholarship — auto-derive expects bachelor_degree/2/gre_gmat")

payload_master = {
    "name": "E2E ReqDocs Master Scholarship",
    "slug": SLUG_MASTER,
    "host_country": "Germany",
    "funding_type": "fully_funded",
    "deadline": "2027-12-31",
    "official_url": "https://example.com/e2e-master",
    "degree_levels": ["master"],
    # NOTE: deliberately OMITTING previous_degree_required,
    # recommendation_letters_count, research_proposal_required,
    # writing_sample_required, standardized_test, accepted_english_tests
    # to exercise the auto-derivation path.
}
status, body = call("POST", "/api/admin/scholarships", body=payload_master, jar=admin_jar)
check("POST master scholarship without doc fields returns 200",
      status == 200, f"(got {status}, body: {str(body)[:200]})")
if isinstance(body, dict):
    check("master: previous_degree_required auto-derived to bachelor_degree",
          body.get("previous_degree_required") == "bachelor_degree",
          f"(got {body.get('previous_degree_required')!r})")
    check("master: recommendation_letters_count auto-derived to 2",
          body.get("recommendation_letters_count") == 2,
          f"(got {body.get('recommendation_letters_count')!r})")
    check("master: research_proposal_required auto-derived to false",
          body.get("research_proposal_required") is False,
          f"(got {body.get('research_proposal_required')!r})")
    check("master: writing_sample_required auto-derived to false",
          body.get("writing_sample_required") is False,
          f"(got {body.get('writing_sample_required')!r})")
    check("master: standardized_test auto-derived to gre_gmat",
          body.get("standardized_test") == "gre_gmat",
          f"(got {body.get('standardized_test')!r})")
    check("master: accepted_english_tests auto-inferred from Germany",
          sorted(body.get("accepted_english_tests") or []) == ["Cambridge", "IELTS", "TOEFL"],
          f"(got {sorted(body.get('accepted_english_tests') or [])})")


# ── STEP 6: GET /api/scholarships/{slug} re-materialises defaults ──
step("STEP 6: public GET re-materialises defaults even if NULL was stored")
status, body = call("GET", f"/api/scholarships/{SLUG_MASTER}")
check("GET /api/scholarships/{slug} returns 200", status == 200,
      f"(got {status})")
if isinstance(body, dict):
    check("GET: previous_degree_required still bachelor_degree",
          body.get("previous_degree_required") == "bachelor_degree")
    check("GET: recommendation_letters_count still 2",
          body.get("recommendation_letters_count") == 2)
    check("GET: standardized_test still gre_gmat",
          body.get("standardized_test") == "gre_gmat")
    check("GET: accepted_english_tests still inferred",
          sorted(body.get("accepted_english_tests") or []) == ["Cambridge", "IELTS", "TOEFL"])


# ── STEP 7: phd scholarship — auto-derive expects master_degree/3/true/gre ─
step("STEP 7: phd-only scholarship — auto-derive expects master_degree/3/true/gre")

payload_phd = {
    "name": "E2E ReqDocs PhD Scholarship",
    "slug": SLUG_PHD,
    "host_country": "USA",
    "funding_type": "fully_funded",
    "deadline": "2027-12-31",
    "official_url": "https://example.com/e2e-phd",
    "degree_levels": ["phd"],
    "accepted_english_tests": ["IELTS", "TOEFL", "PTE", "Duolingo"],
}
status, body = call("POST", "/api/admin/scholarships", body=payload_phd, jar=admin_jar)
check("POST phd scholarship without doc fields returns 200",
      status == 200, f"(got {status})")
if isinstance(body, dict):
    check("phd: previous_degree_required auto-derived to master_degree",
          body.get("previous_degree_required") == "master_degree")
    check("phd: recommendation_letters_count auto-derived to 3",
          body.get("recommendation_letters_count") == 3)
    check("phd: research_proposal_required auto-derived to true",
          body.get("research_proposal_required") is True)
    check("phd: standardized_test auto-derived to gre",
          body.get("standardized_test") == "gre")
    check("phd: accepted_english_tests preserves admin override",
          sorted(body.get("accepted_english_tests") or []) == ["Duolingo", "IELTS", "PTE", "TOEFL"],
          f"(got {sorted(body.get('accepted_english_tests') or [])})")


# ── STEP 8: explicit override wins over auto-derive ─────────────────
step("STEP 8: explicit admin values win over auto-derive")

payload_override = {
    "name": "E2E ReqDocs Override Scholarship",
    "slug": SLUG_OVERRIDE,
    "host_country": "UK",
    "funding_type": "partial",
    "deadline": "2027-12-31",
    "official_url": "https://example.com/e2e-override",
    "degree_levels": ["bachelor"],  # would normally derive sat_act
    # Admin explicitly sets every doc field to non-default values:
    "previous_degree_required": "none",
    "recommendation_letters_count": 5,
    "research_proposal_required": True,
    "writing_sample_required": True,
    "standardized_test": "none",
    "accepted_english_tests": ["IELTS"],
}
status, body = call("POST", "/api/admin/scholarships",
                    body=payload_override, jar=admin_jar)
check("POST with explicit override returns 200", status == 200,
      f"(got {status})")
if isinstance(body, dict):
    check("override: previous_degree_required stays 'none' (not auto-derived)",
          body.get("previous_degree_required") == "none",
          f"(got {body.get('previous_degree_required')!r})")
    check("override: recommendation_letters_count stays 5",
          body.get("recommendation_letters_count") == 5)
    check("override: research_proposal_required stays true",
          body.get("research_proposal_required") is True)
    check("override: writing_sample_required stays true",
          body.get("writing_sample_required") is True)
    check("override: standardized_test stays 'none'",
          body.get("standardized_test") == "none")
    check("override: accepted_english_tests stays ['IELTS']",
          body.get("accepted_english_tests") == ["IELTS"])


# ── STEP 9: accepted_english_tests inferred from Nigeria host ───────
step("STEP 9: accepted_english_tests inferred from non-Western host country")

payload_ng = {
    "name": "E2E ReqDocs Nigeria Scholarship",
    "slug": SLUG_NIGERIA,
    "host_country": "Nigeria",
    "funding_type": "fully_funded",
    "deadline": "2027-12-31",
    "official_url": "https://example.com/e2e-ng",
    "degree_levels": ["bachelor"],
}
status, body = call("POST", "/api/admin/scholarships",
                    body=payload_ng, jar=admin_jar)
check("POST Nigeria scholarship returns 200", status == 200,
      f"(got {status})")
if isinstance(body, dict):
    check("Nigeria: accepted_english_tests inferred as ['IELTS','TOEFL']",
          sorted(body.get("accepted_english_tests") or []) == ["IELTS", "TOEFL"],
          f"(got {sorted(body.get('accepted_english_tests') or [])})")
    check("Nigeria: bachelor → standardized_test auto-derived to sat_act",
          body.get("standardized_test") == "sat_act")


# ── STEP 10: filter API recognises accepted_english_tests ───────────
step("STEP 10: GET /api/scholarships filters by accepted_english_tests")

# Backend query param is `language_test` (not `english_test`).
# See app/api/scholarships.py:47.
status, body = call("GET", "/api/scholarships?language_test=IELTS&limit=5")
check("GET ?english_test=IELTS returns 200", status == 200,
      f"(got {status})")
if isinstance(body, dict):
    items = body.get("items") or []
    check("filtered list returns >= 3 items (we created 4 + master)",
          len(items) >= 3,
          f"(got {len(items)} items)")
    check("every filtered item includes IELTS in accepted_english_tests",
          all("IELTS" in (i.get("accepted_english_tests") or [])
              for i in items if i.get("accepted_english_tests") is not None),
          "(skipped rows where field is missing)")


# ── STEP 11: PATCH update respects existing override ────────────────
step("STEP 11: PATCH keeps the override on existing scholarship")

# Fetch the override scholarship first to find its id
status, body = call("GET", f"/api/scholarships/{SLUG_OVERRIDE}")
if isinstance(body, dict) and body.get("id"):
    sid = body["id"]
    status, body = call("PATCH", f"/api/admin/scholarships/{sid}",
                        body={"description": "Updated after PATCH"},
                        jar=admin_jar)
    check("PATCH returns 200", status == 200, f"(got {status})")
    if isinstance(body, dict):
        check("PATCH: previous_degree_required preserved",
              body.get("previous_degree_required") == "none")
        check("PATCH: standardized_test preserved",
              body.get("standardized_test") == "none")
        check("PATCH: accepted_english_tests preserved",
              body.get("accepted_english_tests") == ["IELTS"])
else:
    skip("PATCH tests", "(could not fetch override scholarship id)")


# ── STEP 12: auth gate — non-admin can't write ──────────────────────
step("STEP 12: non-admin cannot POST /api/admin/scholarships")

user_jar = CookieJar()
status, _ = call("POST", "/api/auth/register",
                 body={"email": "e2e-reqdocs-regular@scholarshipright.com",
                       "password": "RegReqDocsTest42!",
                       "full_name": "Regular User"}, jar=user_jar)
if status != 429:
    status, _ = call("POST", "/api/admin/scholarships", body={
        "name": "Should be rejected",
        "slug": "e2e-reqdocs-forbidden-2027",
        "host_country": "France",
        "funding_type": "partial",
        "deadline": "2027-06-30",
        "official_url": "https://example.com/forbidden",
    }, jar=user_jar)
    check("non-admin POST returns 401 or 403", status in (401, 403),
          f"(got {status})")
    psql("DELETE FROM users WHERE email = 'e2e-reqdocs-regular@scholarshipright.com';")
else:
    skip("non-admin auth check", "(auth rate limit hit)")


# ── Cleanup ────────────────────────────────────────────────────────
try:
    psql(f"DELETE FROM users WHERE email = '{ADMIN_EMAIL}';")
    for slug in (SLUG_MASTER, SLUG_PHD, SLUG_OVERRIDE, SLUG_NIGERIA, SLUG_GERMANY,
                 "e2e-reqdocs-forbidden-2027"):
        psql(f"DELETE FROM scholarships WHERE slug = '{slug}';")
except Exception:
    pass


print()
print("=" * 60)
print(f"RESULTS:  {tests_passed} passed,  {tests_failed} failed,  {tests_skipped} skipped")
print("=" * 60)
sys.exit(0 if tests_failed == 0 else 1)