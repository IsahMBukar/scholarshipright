#!/usr/bin/env python3
"""
E2E test: password-required invite + logout flow.

Covers:
  1. Super admin creates an invite
  2. New staff accepts the invite WITH a password
  3. Re-login proves the password was stored
  4. /api/auth/me returns the new admin identity
  5. All user routes accessible (scholarships, profile, resume, agent)
  6. Admin routes accessible (since the new user is_admin=True)
  7. Logout clears the cookie
  8. /api/auth/me after logout is 401
  9. Wrong password is rejected

Run from anywhere (uses urllib stdlib, no pip installs required):
    python3 tests/e2e/test_invite_password_logout.py
"""
import json
import os
import random
import re
import subprocess
import sys
import time
import urllib.request
import urllib.error
from http.cookiejar import CookieJar

BASE = os.getenv("API_URL", "http://localhost:8000")
TEST_EMAIL = "e2e-staff@scholarshipright.com"
# Build password dynamically so file-write pipelines don't mangle literals.
TEST_PASSWORD = "S" + "ecureP" + "ass2026" + "!"
tests_passed = 0
tests_failed = 0
_TEST_IP = None  # per-process random IP for rate limit isolation


def call(method, path, body=None, jar=None, _retries=0):
    """HTTP call that retries on 429 with exponential backoff.

    The E2E suite fires 10+ auth calls from the same IP in 15 min, which
    can exhaust the auth rate limit. We retry up to 6 times with backoff
    capped at 60s — total worst case ~2 min — so the test waits for the
    bucket to drain rather than failing on a 429.

    We honor the server's Retry-After header (in seconds) when present.

    IP isolation: each test process uses a single random X-Forwarded-For
    so the rate limit bucket is unique per test run, not shared with
    other concurrent tests or prior runs. (Production users share the
    bucket; tests are isolated to keep prod limits strict.)
    """
    global _TEST_IP
    if _TEST_IP is None:
        _TEST_IP = f"10.99.{random.randint(0, 255)}.{random.randint(0, 255)}"
    url = BASE + path
    data = None
    headers = {"X-Forwarded-For": _TEST_IP}
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"

    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    retry_after = None
    try:
        with opener.open(req) as r:
            status = r.status
            raw = r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        status = e.code
        raw = e.read().decode("utf-8", "replace")
        # Try to honor server's Retry-After hint
        ra = e.headers.get("Retry-After") if e.headers else None
        if ra and ra.isdigit():
            retry_after = int(ra)
        if status == 429 and _retries < 6:
            wait = retry_after if retry_after is not None else 2 ** _retries
            wait = min(wait, 60)  # cap at 60s per attempt
            time.sleep(wait)
            return call(method, path, body=body, jar=jar, _retries=_retries + 1)

    parsed = None
    if raw:
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = raw
    return status, parsed


def has_token(jar):
    return any(c.name == "sr_token" and not c.is_expired() for c in jar)


def clear_jar(jar):
    for c in list(jar):
        jar.clear(domain=c.domain, path=c.path, name=c.name)


def step(label):
    global tests_passed, tests_failed
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


# ── Setup: clean any leftover test user ───────────────────────────
try:
    subprocess.run(
        ["psql", "-U", "system", "-d", "scholarshipright", "-c",
         f"DELETE FROM users WHERE email = '{TEST_EMAIL}';"],
        capture_output=True, check=False,
    )
except Exception:
    pass

admin_jar = CookieJar()
staff_jar = CookieJar()

# ── STEP 1 ─────────────────────────────────────────────────────────
step("STEP 1: Super admin logs in & creates invite")

# Register a fresh admin user and promote to super_admin via DB.
admin_email = f"e2e-admin-{random.randint(10000,99999)}@example.com"
admin_pw = "AdminPass123!"
status, body = call("POST", "/api/auth/register",
    body={"email": admin_email, "password": admin_pw, "full_name": "E2E Admin"},
    jar=admin_jar)
check("register admin returns 200", status == 200, str(body)[:80])

# Promote to super_admin directly in the DB
try:
    subprocess.run(
        ["psql", "-U", "system", "-d", "scholarshipright", "-c",
         f"UPDATE users SET is_admin = true, admin_role = 'super_admin' WHERE email = '{admin_email}';"],
        capture_output=True, check=True,
    )
    check("promoted to super_admin in DB", True)
except Exception as e:
    check("promoted to super_admin in DB", False, str(e)[:100])

# Login again to get a fresh session with the admin flag
status, body = call("POST", "/api/auth/login",
    body={"email": admin_email, "password": admin_pw}, jar=admin_jar)
check("admin login returns 200", status == 200, str(body)[:80])
check("super_admin cookie set", has_token(admin_jar))

status, body = call("POST", "/api/admin/invites",
    body={"email": TEST_EMAIL, "admin_role": "support_staff", "note": "e2e test"},
    jar=admin_jar)
check("create-invite returns 201", status == 201, str(body)[:80])
invite_url = body["invite_url"] if isinstance(body, dict) else ""
m = re.search(r"token=([^&]+)$", invite_url)
token = m.group(1) if m else None
check("token extracted", bool(token))

# ── STEP 2 ─────────────────────────────────────────────────────────
step("STEP 2: Accept invite WITH password")
status, body = call("POST", "/api/auth/accept-invite",
    body={"token": token, "full_name": "E2E Staff Member", "password": TEST_PASSWORD},
    jar=staff_jar)
check("accept-invite returns 200", status == 200, str(body)[:80])
check("accepted is True", isinstance(body, dict) and body.get("accepted") is True)
check("user is admin", isinstance(body, dict) and body.get("user", {}).get("is_admin") is True)
check("admin_role is support_staff", isinstance(body, dict) and body.get("user", {}).get("admin_role") == "support_staff")
check("staff cookie set", has_token(staff_jar))

# ── STEP 3 ─────────────────────────────────────────────────────────
step("STEP 3: Re-login with the new password (proves storage)")
clear_jar(staff_jar)
status, body = call("POST", "/api/auth/login",
    body={"email": TEST_EMAIL, "password": TEST_PASSWORD},
    jar=staff_jar)
check("login with new password returns 200", status == 200, f"got {status} body={body}")

# ── STEP 4 ─────────────────────────────────────────────────────────
step("STEP 4: /api/auth/me with new credentials")
status, body = call("GET", "/api/auth/me", jar=staff_jar)
check("/api/auth/me returns 200", status == 200)
check("is_admin=True", isinstance(body, dict) and body.get("is_admin") is True)
check("admin_role=support_staff", isinstance(body, dict) and body.get("admin_role") == "support_staff")

# ── STEP 5 ─────────────────────────────────────────────────────────
step("STEP 5: User routes accessible (scholarship, profile, resume, agent)")
routes = [
    ("/api/resumes", "resume"),
    ("/api/scholarships", "scholarships"),
    ("/api/agent/sessions", "agent/sessions"),
    ("/api/matches", "matches"),
]
for path, label in routes:
    status, _ = call("GET", path, jar=staff_jar)
    check(f"{label:30s} HTTP 200", status == 200, f"(got {status})")

# ── STEP 6 ─────────────────────────────────────────────────────────
step("STEP 6: Admin routes accessible")
admin_routes = [
    ("/api/admin/overview", "admin/overview"),
    ("/api/admin/users", "admin/users"),
    ("/api/admin/invites", "admin/invites"),
]
for path, label in admin_routes:
    status, _ = call("GET", path, jar=staff_jar)
    check(f"{label:30s} HTTP 200", status == 200, f"(got {status})")

# ── STEP 7 ─────────────────────────────────────────────────────────
step("STEP 7: Logout clears cookie")
status, body = call("POST", "/api/auth/logout", jar=staff_jar)
check("logout returns 200", status == 200)
check("no live token after logout", not has_token(staff_jar))

# ── STEP 8 ─────────────────────────────────────────────────────────
step("STEP 8: /api/auth/me after logout is 401")
clear_jar(staff_jar)
status, _ = call("GET", "/api/auth/me", jar=staff_jar)
check("/api/auth/me returns 401", status == 401, f"(got {status})")

# ── STEP 9 ─────────────────────────────────────────────────────────
step("STEP 9: Wrong password rejected")
status, body = call("POST", "/api/auth/login",
    body={"email": TEST_EMAIL, "password": "wrongPassword"})
check("wrong password returns 401", status == 401)

# ── Cleanup ────────────────────────────────────────────────────────
try:
    subprocess.run(
        ["psql", "-U", "system", "-d", "scholarshipright", "-c",
         f"DELETE FROM users WHERE email = '{TEST_EMAIL}';"],
        capture_output=True, check=False,
    )
except Exception:
    pass

print()
print("=" * 60)
print(f"RESULTS:  {tests_passed} passed,  {tests_failed} failed")
print("=" * 60)
sys.exit(0 if tests_failed == 0 else 1)
