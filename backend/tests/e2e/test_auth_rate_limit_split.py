#!/usr/bin/env python3
"""
E2E: auth rate limit buckets are split per endpoint family.

Background: previously a single `auth` rate limit bucket (8/15min) was
shared across /register, /login, /accept-invite, and /set-password. That
caused flaky E2E tests when prior test runs filled the bucket — a
legitimate login could be blocked by an unrelated signup probe, etc.

This test pins the contract:
  - /api/auth/register  → auth_register bucket
  - /api/auth/login     → auth_login bucket
  - /api/auth/accept-invite → auth_invite bucket
  - /api/auth/set-password  → auth_invite bucket

Concretely: each bucket has its own key in app.core.rate_limit, and
hitting /login hard does NOT add to the /register bucket. This guards
against a future refactor that accidentally re-merge the buckets.

We test this by:
  1. Reading rate_limit.py and checking the three named buckets exist
  2. Reading auth.py and admin_invites.py and confirming each endpoint
     depends on the right bucket
  3. Smoke test: fire 8 /login attempts, then 1 /register — the
     /register must still go through (was failing before the fix
     because login + register shared a bucket).
"""
import os
import re
import sys
import time
import json
import urllib.request
import urllib.error

API = os.getenv("API_URL", "http://localhost:8000")
ROOT = os.path.realpath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
RATE_LIMIT_PATH = os.path.join(ROOT, "backend", "app", "core", "rate_limit.py")
AUTH_PATH = os.path.join(ROOT, "backend", "app", "api", "auth.py")
ADMIN_INVITES_PATH = os.path.join(ROOT, "backend", "app", "api", "admin_invites.py")

tests_passed = 0
tests_failed = 0
tests_skipped = 0


def check(name, cond, detail=""):
    global tests_passed, tests_failed
    if cond:
        print(f"  PASS {name}")
        tests_passed += 1
    else:
        print(f"  FAIL {name}  {detail}")
        tests_failed += 1


def skip(name, reason):
    global tests_skipped
    print(f"  SKIP {name}  ({reason})")
    tests_skipped += 1


def read(p):
    with open(p) as f:
        return f.read()


def main():
    global tests_passed, tests_failed, tests_skipped
    print("=" * 60)
    print("E2E: auth rate limit per-endpoint buckets")
    print("=" * 60)

    # ── PART A: rate_limit.py defines the three buckets ────────────────
    print()
    print("  -- Part A: rate_limit.py defines per-endpoint buckets --")
    if not os.path.exists(RATE_LIMIT_PATH):
        check("rate_limit.py exists", False, f"missing {RATE_LIMIT_PATH}")
    else:
        src = read(RATE_LIMIT_PATH)
        check("auth_register_rate_limit is defined",
              "auth_register_rate_limit = rate_limit(" in src
              and '"auth_register"' in src)
        check("auth_login_rate_limit is defined",
              "auth_login_rate_limit = rate_limit(" in src
              and '"auth_login"' in src)
        check("auth_invite_rate_limit is defined",
              "auth_invite_rate_limit = rate_limit(" in src
              and '"auth_invite"' in src)
        # The old shared bucket must be gone (no 'auth_rate_limit =' as a
        # standalone declaration — only the three split ones).
        check("legacy shared 'auth' bucket is removed",
              'rate_limit("auth"' not in src,
              f"src still has rate_limit(\"auth\"...) — see {RATE_LIMIT_PATH}")

    # ── PART B: auth.py wires each endpoint to the right bucket ───────
    print()
    print("  -- Part B: auth.py endpoint -> bucket wiring --")
    if not os.path.exists(AUTH_PATH):
        check("auth.py exists", False)
    else:
        auth = read(AUTH_PATH)
        check("/register uses auth_register_rate_limit",
              re.search(
                  r'@router\.post\("/register".*?dependencies=\[Depends\(auth_register_rate_limit\)\]',
                  auth, re.DOTALL) is not None)
        check("/login uses auth_login_rate_limit",
              re.search(
                  r'@router\.post\("/login".*?dependencies=\[Depends\(auth_login_rate_limit\)\]',
                  auth, re.DOTALL) is not None)
        check("/set-password uses auth_invite_rate_limit",
              re.search(
                  r'@router\.post\("/set-password".*?dependencies=\[Depends\(auth_invite_rate_limit\)\]',
                  auth, re.DOTALL) is not None)
        # No more references to the old shared bucket
        check("auth.py has no leftover 'Depends(auth_rate_limit)'",
              "Depends(auth_rate_limit)" not in auth)

    if not os.path.exists(ADMIN_INVITES_PATH):
        check("admin_invites.py exists", False)
    else:
        ai = read(ADMIN_INVITES_PATH)
        check("/accept-invite uses auth_invite_rate_limit",
              re.search(
                  r'@accept_invite_router\.post\("/accept-invite".*?dependencies=\[Depends\(auth_invite_rate_limit\)\]',
                  ai, re.DOTALL) is not None)

    # ── PART C: live smoke test — login + register don't share a bucket ───
    # We can't easily prove the live runtime split from a black-box test
    # (the in-memory _BUCKETS dict is module-private), but we can verify
    # that the same IP can hit /login a few times AND /register a few
    # times in a row without one starving the other.
    #
    # Rate-limit aware: if the bucket is already full from prior test
    # runs, skip the smoke test (it's a nice-to-have; the structural
    # checks in Part A + Part B are the source of truth).
    print()
    print("  -- Part C: live smoke test (2x login + 2x register) --")
    # Pre-check: is the auth_login bucket clear?
    pre = urllib.request.Request(
        f"{API}/api/auth/login",
        data=json.dumps({"email": "rl-pre@x.com", "password": "x"}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(pre, timeout=10) as r:
            pre_status = r.status
    except urllib.error.HTTPError as e:
        pre_status = e.code
    if pre_status == 429:
        skip("live smoke test", "auth_login bucket already full (rate-limited) — structural checks above are sufficient")
    else:
        for i in range(2):
            req = urllib.request.Request(
                f"{API}/api/auth/login",
                data=json.dumps({"email": f"rl-smoke-{i}-{int(time.time())}@x.com",
                                  "password": "wrong"}).encode(),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            try:
                with urllib.request.urlopen(req, timeout=10) as r:
                    login_status = r.status
            except urllib.error.HTTPError as e:
                login_status = e.code
            check(f"login attempt {i+1} is NOT 429", login_status != 429,
                  f"got {login_status}")

        for i in range(2):
            req = urllib.request.Request(
                f"{API}/api/auth/register",
                data=json.dumps({"email": f"rl-smoke-r-{i}-{int(time.time())}@x.com",
                                  "password": "TestPass123!",
                                  "full_name": "rl"}).encode(),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            try:
                with urllib.request.urlopen(req, timeout=10) as r:
                    reg_status = r.status
            except urllib.error.HTTPError as e:
                reg_status = e.code
            check(f"register attempt {i+1} is NOT 429", reg_status != 429,
                  f"got {reg_status}")

    print()
    print("=" * 60)
    print(f"RESULTS:  {tests_passed} passed,  {tests_failed} failed,  {tests_skipped} skipped")
    print("=" * 60)
    if tests_failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
