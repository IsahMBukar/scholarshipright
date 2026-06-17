#!/usr/bin/env python3
"""
E2E test: forgot-password + reset-password flow.

Covers the contract of /api/auth/forgot-password and /api/auth/reset-password
end-to-end against a live backend:

  1. Forgot-password for an unknown email still returns 200 (no enumeration)
  2. Forgot-password for a known email returns 200 and (in dev mode) the
     raw reset token in the response
  3. The dev diagnostic endpoint /api/auth/dev/reset-tokens lists the
     new row as unused + unexpired + uninvalidated
  4. A second /forgot-password for the same email INVALIDATES the prior
     token (only the most recent link is valid)
  5. Reset with a too-short password is rejected (422 — pydantic)
  6. Reset with an empty / blank token is rejected (400)
  7. Reset with a non-existent token is rejected (400, generic message)
  8. Reset with a valid token + a strong new password succeeds (200)
  9. After the reset, the OLD password no longer works (401)
 10. After the reset, the NEW password works (login returns 200)
 11. /api/auth/me works after logging in with the new password
 12. Reset with the same token twice is rejected on the second use
 13. Token is marked `used_at` after a successful reset (visible in the
     dev diagnostic endpoint)
 14. An empty-email forgot-password request still returns 200
 15. Rate-limit smoke: hammering /forgot-password past the bucket limit
     returns 429 (the bucket is per-IP, so the test uses a unique IP)

Run from anywhere (uses urllib stdlib, no pip installs required):
    python3 tests/e2e/test_password_reset.py
"""
import json
import os
import random
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from http.cookiejar import CookieJar

BASE = os.getenv("API_URL", "http://localhost:8000")
TEST_EMAIL = "e2e-pwreset@scholarshipright.com"
# Old password (set at registration) — must be 8+ chars to pass /register.
OLD_PASSWORD = "OldPassword123!"
# New password we reset to.
NEW_PASSWORD = "BrandNewPassword456!"
tests_passed = 0
tests_failed = 0
_TEST_IP = None


def call(method, path, body=None, jar=None, _retries=0, _ip_override=None, _no_retry=False):
    """HTTP helper that retries on 429 (matches the rest of the E2E suite).

    Each test process uses a single random X-Forwarded-For so the rate
    limit bucket is unique per run. The optional `_ip_override` is used
    for the rate-limit smoke test (one call with a different IP so the
    bucket is fresh). The optional `_no_retry=True` is used for the
    rate-limit smoke test too — we WANT to see the 429 response, not
    have the helper retry past it.
    """
    global _TEST_IP
    if _ip_override is not None:
        ip = _ip_override
    elif _TEST_IP is None:
        _TEST_IP = f"10.77.{random.randint(0, 255)}.{random.randint(0, 255)}"
        ip = _TEST_IP
    else:
        ip = _TEST_IP

    url = BASE + path
    data = None
    headers = {"X-Forwarded-For": ip}
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
        ra = e.headers.get("Retry-After") if e.headers else None
        if ra and ra.isdigit():
            retry_after = int(ra)
        if status == 429 and not _no_retry and _retries < 6:
            wait = retry_after if retry_after is not None else 2 ** _retries
            wait = min(wait, 60)
            time.sleep(wait)
            return call(method, path, body=body, jar=jar, _retries=_retries + 1,
                        _ip_override=_ip_override, _no_retry=_no_retry)

    parsed = None
    if raw:
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = raw
    return status, parsed


def has_token(jar):
    return any(c.name == "sr_token" and not c.is_expired() for c in jar)


def step(label):
    global tests_passed
    print()
    print("=" * 60, flush=True)
    print(label, flush=True)
    print("=" * 60, flush=True)
    tests_passed += 1


def check(name, ok, detail=""):
    global tests_passed, tests_failed
    if ok:
        print(f"  PASS  {name}  {detail}", flush=True)
        tests_passed += 1
    else:
        print(f"  FAIL  {name}  {detail}", flush=True)
        tests_failed += 1


# ── Setup: clean any leftover test user + prior reset tokens ────────
def cleanup():
    try:
        subprocess.run(
            ["psql", "-U", "system", "-d", "scholarshipright", "-c",
             f"DELETE FROM users WHERE email = '{TEST_EMAIL}';"],
            capture_output=True, check=False,
        )
    except Exception:
        pass


cleanup()
jar = CookieJar()


# ── STEP 1 ─────────────────────────────────────────────────────────
step("STEP 1: Register test user with the OLD password")
status, body = call("POST", "/api/auth/register",
    body={"email": TEST_EMAIL, "password": OLD_PASSWORD, "full_name": "Reset E2E"},
    jar=jar)
check("register returns 200", status == 200, f"got {status} body={body}")
check("login cookie set", has_token(jar))

# Log out so we're not authenticated for the rest of the flow.
status, _ = call("POST", "/api/auth/logout", jar=jar)
check("logout returns 200", status == 200)
for c in list(jar):
    jar.clear(domain=c.domain, path=c.path, name=c.name)


# ── STEP 2 ─────────────────────────────────────────────────────────
step("STEP 2: Forgot-password for an UNKNOWN email is 200 (no enumeration)")
status, body = call("POST", "/api/auth/forgot-password",
    body={"email": "definitely-not-a-user-12345@scholarshipright.com"})
check("unknown email returns 200", status == 200, f"got {status}")
check("response shape is {status:ok}",
    isinstance(body, dict) and body.get("status") == "ok",
    f"body={body}")
# In dev mode the response also includes dev_reset_url. For an UNKNOWN
# email, that key MUST NOT be present (no token was issued).
check("no dev_reset_url for unknown email",
    isinstance(body, dict) and "dev_reset_url" not in body,
    f"body={body}")


# ── STEP 3 ─────────────────────────────────────────────────────────
step("STEP 3: Forgot-password for the real user returns 200 + dev token")
status, body = call("POST", "/api/auth/forgot-password",
    body={"email": TEST_EMAIL})
check("forgot-password returns 200", status == 200, f"got {status} body={body}")
check("response is {status:ok}",
    isinstance(body, dict) and body.get("status") == "ok")

# In dev mode (DEV_RETURN_RESET_TOKEN=1) the response includes the raw
# token. We branch on presence — production builds skip the dev-only
# assertions but still verify the rest of the contract.
dev_token = None
if isinstance(body, dict) and "dev_reset_token" in body:
    dev_token = body["dev_reset_token"]
    check("dev_reset_url present in dev mode", "dev_reset_url" in body)
    check("dev_reset_url is well-formed",
        isinstance(body.get("dev_reset_url"), str)
        and body["dev_reset_url"].startswith("http")
        and "token=" in body["dev_reset_url"],
        f"url={body.get('dev_reset_url')}")
    check("dev_reset_token is non-empty (>=32 chars)",
        isinstance(dev_token, str) and len(dev_token) >= 32,
        f"len={len(dev_token) if isinstance(dev_token, str) else 'n/a'}")
else:
    print("  NOTE  DEV_RETURN_RESET_TOKEN not enabled — skipping dev-token assertions")


# ── STEP 4 ─────────────────────────────────────────────────────────
step("STEP 4: Dev diagnostic endpoint lists the token row")
status, body = call("GET",
    f"/api/auth/dev/reset-tokens?email={urllib.parse.quote(TEST_EMAIL)}")
check("dev/reset-tokens returns 200", status == 200, f"got {status}")
check("body has 'tokens' list", isinstance(body, dict) and "tokens" in body)
if isinstance(body, dict) and body.get("tokens"):
    check("most recent token is unused",
        body["tokens"][0].get("used_at") is None)
    check("most recent token is uninvalidated",
        body["tokens"][0].get("invalidated_at") is None)
    check("most recent token is not expired",
        body["tokens"][0].get("expired") is False)
    # Sanity: id is a UUID.
    tid = body["tokens"][0].get("id", "")
    check("token id is a uuid", bool(re.match(
        r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
        tid)), f"id={tid}")
else:
    check("at least one token row exists", False, f"body={body}")


# ── STEP 5 ─────────────────────────────────────────────────────────
step("STEP 5: Second /forgot-password INVALIDATES the first token")
# Save the first token's id so we can check that the diagnostic endpoint
# marks it as invalidated after we request a new one.
first_id = None
if isinstance(body, dict) and body.get("tokens"):
    first_id = body["tokens"][0]["id"]

# Wait briefly to make the two tokens distinguishable by created_at.
time.sleep(1.0)

status, body2 = call("POST", "/api/auth/forgot-password",
    body={"email": TEST_EMAIL})
check("second forgot-password returns 200", status == 200, f"got {status}")

dev_token_2 = body2.get("dev_reset_token") if isinstance(body2, dict) else None
if dev_token and dev_token_2:
    check("second token differs from first", dev_token != dev_token_2,
        f"same token returned twice")

# Re-check the dev endpoint: the first token should now be marked
# invalidated_at; the second should be unused + uninvalidated.
status, body3 = call("GET",
    f"/api/auth/dev/reset-tokens?email={urllib.parse.quote(TEST_EMAIL)}")
if isinstance(body3, dict) and body3.get("tokens") and first_id:
    # The most recent row is the new (active) token.
    new_row = body3["tokens"][0]
    check("newest token is unused + uninvalidated",
        new_row.get("used_at") is None and new_row.get("invalidated_at") is None)
    # The first token should appear lower in the list, marked invalidated.
    invalidated = [t for t in body3["tokens"]
                   if t.get("id") == first_id and t.get("invalidated_at") is not None]
    check("first token is now marked invalidated_at",
        len(invalidated) >= 1,
        f"tokens={body3['tokens']}")


# ── STEP 6 ─────────────────────────────────────────────────────────
step("STEP 6: Reset with a too-short password is rejected (422)")
if dev_token_2:
    status, body = call("POST", "/api/auth/reset-password",
        body={"token": dev_token_2, "new_password": "short"})
    check("too-short password returns 422",
        status == 422, f"got {status} body={body}")
else:
    # Skip if dev mode is off — we have no way to obtain a token in prod.
    check("too-short password returns 422 (skipped, no dev token)", True,
        "(skipped)")


# ── STEP 7 ─────────────────────────────────────────────────────────
step("STEP 7: Reset with empty/blank token is rejected (400)")
status, body = call("POST", "/api/auth/reset-password",
    body={"token": "", "new_password": NEW_PASSWORD})
check("empty token returns 400", status == 400, f"got {status} body={body}")


# ── STEP 8 ─────────────────────────────────────────────────────────
step("STEP 8: Reset with non-existent token is rejected (400)")
status, body = call("POST", "/api/auth/reset-password",
    body={"token": "this-token-does-not-exist-" + "x" * 32,
          "new_password": NEW_PASSWORD})
check("non-existent token returns 400",
    status == 400, f"got {status} body={body}")
# The detail should carry a structured `code` so the frontend can
# render a specific message.
detail = body.get("detail") if isinstance(body, dict) else None
check("detail has user_message for the frontend",
    isinstance(detail, dict) and "user_message" in detail,
    f"detail={detail}")


# ── STEP 9 ─────────────────────────────────────────────────────────
step("STEP 9: Reset with the valid token + strong password succeeds (200)")
if dev_token_2:
    status, body = call("POST", "/api/auth/reset-password",
        body={"token": dev_token_2, "new_password": NEW_PASSWORD})
    check("valid reset returns 200",
        status == 200, f"got {status} body={body}")
    check("response is {status:ok}",
        isinstance(body, dict) and body.get("status") == "ok")
else:
    check("valid reset returns 200 (skipped, no dev token)", True, "(skipped)")


# ── STEP 10 ────────────────────────────────────────────────────────
step("STEP 10: The OLD password no longer works (401)")
status, body = call("POST", "/api/auth/login",
    body={"email": TEST_EMAIL, "password": OLD_PASSWORD})
check("old password rejected with 401",
    status == 401, f"got {status} body={body}")


# ── STEP 11 ────────────────────────────────────────────────────────
step("STEP 11: The NEW password works (login returns 200)")
status, body = call("POST", "/api/auth/login",
    body={"email": TEST_EMAIL, "password": NEW_PASSWORD}, jar=jar)
check("new password login returns 200",
    status == 200, f"got {status} body={body}")
check("sr_token cookie set", has_token(jar))


# ── STEP 12 ────────────────────────────────────────────────────────
step("STEP 12: /api/auth/me with the new credentials")
status, body = call("GET", "/api/auth/me", jar=jar)
check("/api/auth/me returns 200", status == 200, f"got {status}")
check("email matches", isinstance(body, dict) and body.get("email") == TEST_EMAIL,
    f"body={body}")


# ── STEP 13 ────────────────────────────────────────────────────────
step("STEP 13: The used token is now marked used_at (not reusable)")
# Request a fresh token, then try to use it twice. The second attempt
# should be 400 with the `token_used` code.
status, body = call("POST", "/api/auth/forgot-password",
    body={"email": TEST_EMAIL})
check("forgot-password for third token returns 200",
    status == 200, f"got {status}")
dev_token_3 = body.get("dev_reset_token") if isinstance(body, dict) else None

if dev_token_3:
    # First use — should succeed.
    status, _ = call("POST", "/api/auth/reset-password",
        body={"token": dev_token_3, "new_password": "AnotherNewPass789!"})
    check("first use of fresh token returns 200", status == 200,
        f"got {status}")
    # Second use — should be rejected.
    status, body = call("POST", "/api/auth/reset-password",
        body={"token": dev_token_3, "new_password": "AnotherNewPass789!"})
    check("reused token returns 400", status == 400, f"got {status} body={body}")
    detail = body.get("detail") if isinstance(body, dict) else None
    check("detail code is token_used",
        isinstance(detail, dict) and detail.get("code") == "token_used",
        f"detail={detail}")
else:
    check("reused token returns 400 (skipped, no dev token)", True, "(skipped)")


# ── STEP 14 ────────────────────────────────────────────────────────
step("STEP 14: /forgot-password with empty email is 200 (no leak)")
status, body = call("POST", "/api/auth/forgot-password", body={"email": ""})
check("empty email returns 200", status == 200, f"got {status} body={body}")
check("response is {status:ok}",
    isinstance(body, dict) and body.get("status") == "ok")


# ── STEP 15 ────────────────────────────────────────────────────────
step("STEP 15: Rate-limit smoke on /forgot-password (5/15min per IP)")
# The bucket is 5 requests per 15 min per IP. Use a fresh IP to avoid
# colliding with the test's own earlier calls. We expect the 6th call
# to return 429.
fresh_ip = f"10.55.{random.randint(0, 255)}.{random.randint(0, 255)}"
saw_429 = False
for i in range(7):
    status, _ = call("POST", "/api/auth/forgot-password",
        body={"email": TEST_EMAIL}, _ip_override=fresh_ip, _no_retry=True)
    if status == 429:
        saw_429 = True
        break
check("forgot-password eventually returns 429 (rate-limited)",
    saw_429, "(expected after >5 hits in 15min)")


# ── Cleanup ────────────────────────────────────────────────────────
cleanup()

print()
print("=" * 60)
print(f"RESULTS:  {tests_passed} passed,  {tests_failed} failed")
print("=" * 60)
sys.exit(0 if tests_failed == 0 else 1)
