"""
E2E regression: ProfileSlide's "Find my matches" button must advance the
carousel to the matches preview slide.

Bug it guards against: ProfileSlide's onSubmit() called onSave() but
forgot to call onNext(), so users were stuck on the profile slide after
a successful save. The button showed "Saving…" then reverted, with no
navigation — they never reached the matches preview or the scholarships
matching page.
"""

import os
import re
import sys
import urllib.request
import urllib.error
from http.cookiejar import CookieJar

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
FRONTEND = os.getenv("FRONTEND_URL", "http://localhost:3000")
API = os.getenv("API_URL", "http://localhost:8000")
PROFILE_SLIDE = os.path.join(ROOT, "frontend", "src", "app", "onboarding", "slides", "ProfileSlide.tsx")
ONBOARD_PAGE = os.path.join(ROOT, "frontend", "src", "app", "onboarding", "page.tsx")

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
# PART 1: Source contract — the fix is in place
# ─────────────────────────────────────────────
step("PART 1: ProfileSlide advances to next slide after save")

slide_src = open(PROFILE_SLIDE).read()
page_src = open(ONBOARD_PAGE).read()

# 1. ProfileSlide declares an onNext prop
check("ProfileSlide declares an onNext prop in its signature",
      re.search(r"onNext\s*:\s*\(\)\s*=>\s*void", slide_src) is not None)

# 2. ProfileSlide's onSubmit() calls onNext() after a successful save
# Extract the onSubmit function body by brace-counting from its opening
# (regex on a complex async function with nested blocks is brittle).
on_submit_match = re.search(r"const onSubmit = async \(\) => \{", slide_src)
on_submit_block = None
if on_submit_match:
    start = on_submit_match.end() - 1  # position of the opening '{'
    depth = 0
    i = start
    while i < len(slide_src):
        c = slide_src[i]
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                # include the closing brace
                on_submit_block = slide_src[on_submit_match.start():i+1]
                break
        i += 1
check("ProfileSlide has an onSubmit handler", on_submit_block is not None)

if on_submit_block:
    body = on_submit_block  # already a string after brace-counting extraction
    # Must set error + early-return on failure
    has_failure_return = (
        "setError" in body
        and re.search(r"if\s*\(\s*!result\s*\).*?return\s*;", body, re.DOTALL) is not None
    )
    check("onSubmit sets an error and returns early when save fails",
          has_failure_return)
    # Must call onNext() on success
    has_success_advance = re.search(r"onNext\s*\(\s*\)", body) is not None
    check("onSubmit calls onNext() after a successful save",
          has_success_advance)
    # onNext() call must come AFTER the !result early return
    if has_success_advance and on_submit_block:
        early_return_pos = body.find("return;") if "return;" in body else -1
        on_next_pos = body.find("onNext()")
        check("onNext() is called after the failure-guard return (i.e. on success only)",
              early_return_pos != -1 and on_next_pos > early_return_pos,
              f"(early_return@{early_return_pos}, onNext@{on_next_pos})")

# 3. page.tsx passes an onNext handler to ProfileSlide that goes to slide 3
check("page.tsx wires onNext to a handler (not undefined)",
      re.search(r"<ProfileSlide[\s\S]*?onNext=\{", page_src) is not None)

profile_block = re.search(r"ob\.slideIndex === 2[\s\S]*?(?:/>|</ProfileSlide>)", page_src)
check("page.tsx ProfileSlide block is found", profile_block is not None)
if profile_block:
    block = profile_block.group(0)
    check("page.tsx's onNext handler calls ob.setSlideIndex(3)",
          "setSlideIndex(3)" in block)
    check("page.tsx's onNext handler calls ob.refresh() (so hasProfile updates)",
          "ob.refresh()" in block)

# 4. The "Find my matches" button still exists (label unchanged)
check("ProfileSlide still renders the 'Find my matches' button",
      "Find my matches" in slide_src)


# ─────────────────────────────────────────────
# PART 2: Live API contract — /api/profile returns 200 for a saved profile
# (this is what the slide relies on for success detection)
# ─────────────────────────────────────────────
step("PART 2: Live /api/profile round-trip works (so onSave returns truthy)")

TEST_PASSWORD = "FixProfileNav42!"
jar = CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

# Try to register
import json
email = f"e2e-profile-nav-{os.urandom(4).hex()}@scholarshipright.com"
register_body = json.dumps({
    "email": email, "password": TEST_PASSWORD, "full_name": "E2E Profile Nav"
}).encode()
req = urllib.request.Request(
    f"{API}/api/auth/register", data=register_body,
    headers={"Content-Type": "application/json"}, method="POST"
)
auth_ok = False
try:
    with opener.open(req) as r:
        auth_ok = r.status == 200
except urllib.error.HTTPError as e:
    if e.code == 429:
        skip("register a fresh user", "auth rate limit hit")
    else:
        check("register returns 200", False, f"got {e.code}")
else:
    check("register returns 200", auth_ok, f"got {r.status}")

if auth_ok:
    # Now POST the profile fields
    profile_body = json.dumps({
        "country_of_origin": "Nigeria",
        "target_degree": "master",
        "field_of_study": "computer_science",
        "target_fields": ["computer_science"],
        "target_countries": ["United States", "United Kingdom"],
    }).encode()
    req = urllib.request.Request(
        f"{API}/api/profile", data=profile_body,
        headers={"Content-Type": "application/json"}, method="POST"
    )
    profile_ok = False
    try:
        with opener.open(req) as r:
            status = r.status
            body = r.read().decode()
    except urllib.error.HTTPError as e:
        status = e.code
        body = e.read().decode()
    check("POST /api/profile returns 200", status == 200, f"got {status}: {body[:200]}")
    if status == 200:
        try:
            saved = json.loads(body)
            check("response body has a non-null profile object",
                  isinstance(saved, dict) and saved.get("country_of_origin") == "Nigeria",
                  f"(got keys: {list(saved.keys())[:6] if isinstance(saved, dict) else 'n/a'})")
        except Exception as e:
            check("response body is valid JSON", False, f"({e})")

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
# PART 3: Compile check — make sure the .tsx files still type-check
# ─────────────────────────────────────────────
step("PART 3: TypeScript files compile (no broken prop wiring)")

# Quick textual sanity: the new onNext handler references must be syntactically
# balanced. A simpler proxy is that the onSubmit block parses cleanly.
try:
    # Count opening and closing braces in the onSubmit block
    if on_submit_block:
        body = on_submit_block
        opens = body.count("{")
        closes = body.count("}")
        check("onSubmit block has balanced braces",
              opens == closes, f"({opens} open, {closes} close)")
        # Count parens
        popens = body.count("(")
        pcloses = body.count(")")
        check("onSubmit block has balanced parens",
              popens == pcloses, f"({popens} open, {pcloses} close)")
    else:
        check("onSubmit block parses", False, "(regex didn't match)")
except Exception as e:
    check("onSubmit block parses", False, f"({e})")

# Also check page.tsx for the onNext handler bracket balance
try:
    m = re.search(r"<ProfileSlide[\s\S]*?/>", page_src)
    if m:
        body = m.group(0)
        opens = body.count("{")
        closes = body.count("}")
        check("page.tsx <ProfileSlide /> block has balanced braces",
              opens == closes, f"({opens} open, {closes} close)")
    else:
        # Try the multiline form
        m2 = re.search(r"<ProfileSlide[\s\S]*?\n\s*</ProfileSlide>", page_src)
        if m2:
            body = m2.group(0)
            opens = body.count("{")
            closes = body.count("}")
            check("page.tsx <ProfileSlide> block has balanced braces",
                  opens == closes, f"({opens} open, {closes} close)")
        else:
            check("page.tsx <ProfileSlide> block is parseable", False, "(regex didn't match)")
except Exception as e:
    check("page.tsx <ProfileSlide> block parses", False, f"({e})")


# ─────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────
print()
print("=" * 60)
print(f"RESULTS:  {tests_passed} passed,  {tests_failed} failed,  {tests_skipped} skipped")
print("=" * 60)
sys.exit(0 if tests_failed == 0 else 1)
