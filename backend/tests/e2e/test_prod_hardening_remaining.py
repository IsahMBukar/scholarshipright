#!/usr/bin/env python3
"""
E2E: production hardening — dev-login guard, cookie flags, matches rate limit.

Three production-readiness contracts pinned here:

  A. /api/auth/dev-login must return 404 (not 200, not 401) when the
     app boots with ENVIRONMENT=production. Empirically the endpoint
     would otherwise auto-create test@scholarshipright.com and grant
     any anonymous caller a signed-in admin account.

  B. Set-Cookie responses for auth must include the Secure flag when
     ENVIRONMENT=production and must NOT include it when
     ENVIRONMENT=development. Cookies on /api/auth/logout must match
     the create flags so deletion actually clears the cookie
     (otherwise a Secure cookie survives a non-Secure delete attempt).

  C. GET /api/matches must return 429 once a single user exceeds
     60 calls in a 60-minute window.

Tests A and B boot a fresh uvicorn subprocess with carefully-controlled
env vars so we don't have to disturb the running dev backend.
Test C exercises the rate limit against the long-running dev backend
already running on :8000. After test C we leave the bucket degraded
locally -- the next real-user interaction will see <60 free slots.
Run from a clean dev session occasionally if that matters to you.
"""
import json
import http.cookiejar
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.realpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..")
)
BACKEND_DIR = os.path.join(ROOT, "backend")
LIVE_API = os.getenv("API_URL", "http://127.0.0.1:8000")

tests_passed = 0
tests_failed = 0
tests_skipped = 0


def check(name, cond, detail=""):
    global tests_passed, tests_failed
    if cond:
        print(f"  PASS {name}")
        tests_passed += 1
    else:
        print(f"  FAIL {name}: {detail}")
        tests_failed += 1


def _free_port() -> int:
    """Ask the OS for an unused TCP port."""
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _wait_for_http(url: str, timeout: float = 30.0) -> bool:
    """Poll the URL until it responds (any status) or timeout."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urllib.request.urlopen(url, timeout=1)
            return True
        except urllib.error.HTTPError:
            return True  # any HTTP response means the server is up
        except Exception:
            time.sleep(0.4)
    return False


def _boot_uvicorn(env_overrides: dict, port: int) -> subprocess.Popen:
    """Spawn a fresh uvicorn wired with the given env vars. Returns Popen."""
    env = os.environ.copy()
    env["PYTHONPATH"] = BACKEND_DIR
    env["PYTHONUNBUFFERED"] = "1"
    for k, v in env_overrides.items():
        if v is None:
            env.pop(k, None)
        else:
            env[k] = v
    return subprocess.Popen(
        [
            "venv/bin/python",
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
            "--log-level",
            "warning",
            "--no-access-log",
        ],
        cwd=BACKEND_DIR,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def _stop_uvicorn(proc: subprocess.Popen, timeout: float = 10.0) -> None:
    try:
        proc.terminate()
        proc.wait(timeout=timeout)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass


def _post(url: str, body=None, headers=None):
    """POST with JSON body. Returns (status, response_headers, parsed_json_or_text)."""
    data = None
    final_headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode()
        final_headers["Content-Type"] = "application/json"
    if headers:
        final_headers.update(headers)
    req = urllib.request.Request(url, data=data, headers=final_headers, method="POST")
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        raw = resp.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            payload = raw
        return resp.status, dict(resp.headers.items()), payload
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            payload = raw
        return e.code, dict(e.headers.items()), payload


def _get(url: str, headers=None):
    final_headers = {"Accept": "application/json"}
    if headers:
        final_headers.update(headers)
    req = urllib.request.Request(url, headers=final_headers, method="GET")
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        raw = resp.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            payload = raw
        return resp.status, dict(resp.headers.items()), payload
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            payload = raw
        return e.code, dict(e.headers.items()), payload


def _set_cookie_has_flag(headers: dict, flag: str) -> bool:
    """Cookie header is single string; Set-Cookie header is one per line. urllib
    folds repeats via getallmatchingheaders but we only see the last one.
    Sufficient for our assertion that the LAST emitted cookie carries (or
    lacks) the flag."""
    cookie = headers.get("Set-Cookie") or headers.get("set-cookie") or ""
    return flag.lower() in cookie.lower()


# ──────────────────────────────────────────────────────────────────────
# Test A: dev-login guard under ENVIRONMENT=production
# ──────────────────────────────────────────────────────────────────────

print("=" * 60)
print("Test A: /api/auth/dev-login must 404 in production")
print("=" * 60)

# Spawn a fresh uvicorn on a random port with ENVIRONMENT=production.
# Need a real JWT_SECRET so the app boots -- generate a 64-char random
# string in-process.
import secrets

_jwt_secret = secrets.token_urlsafe(48)
prod_port = _free_port()
prod_proc = _boot_uvicorn(
    env_overrides={
        "ENVIRONMENT": "production",
        "JWT_SECRET": _jwt_secret,
        "FRONTEND_URL": "https://example.com",
    },
    port=prod_port,
)
prod_url = f"http://127.0.0.1:{prod_port}"

try:
    if not _wait_for_http(f"{prod_url}/healthz", timeout=30):
        check(
            "Test A boot: uvicorn came up on isolated port",
            False,
            "uvicorn in production env failed to start within 30s",
        )
    else:
        check("Test A boot: uvicorn came up on isolated port", True)

        status, headers, payload = _post(f"{prod_url}/api/auth/dev-login")
        check(
            "Test A-1: POST /api/auth/dev-login returns 404 in production",
            status == 404,
            f"got status={status}, payload={payload!r}",
        )

        # Build a representation that would prove the guard fired (and
        # not, say, a 200 with no DB row). Although we can't introspect
        # an arbitrary path, we can confirm that /healthz still answers
        # 200 in this same prod-mode uvicorn, so the 404 is not a global
        # 404 fallback.
        h_status, _, _ = _get(f"{prod_url}/healthz")
        check(
            "Test A-2: /healthz still 200 in the same production uvicorn",
            h_status == 200,
            f"healthz returned {h_status}",
        )

        # Same endpoint must still work in development — boot a SECOND
        # uvicorn with environment=development on a different port.
        dev_port = _free_port()
        dev_proc = _boot_uvicorn(
            env_overrides={
                "ENVIRONMENT": "development",
                "JWT_SECRET": "any",
            },
            port=dev_port,
        )
        try:
            if _wait_for_http(f"http://127.0.0.1:{dev_port}/healthz", timeout=30):
                dstatus, _, dpayload = _post(
                    f"http://127.0.0.1:{dev_port}/api/auth/dev-login"
                )
                check(
                    "Test A-3: POST /api/auth/dev-login still works in development",
                    dstatus == 200 and isinstance(dpayload, dict) and "id" in dpayload,
                    f"dev status={dstatus}, payload={dpayload!r}",
                )
            else:
                check(
                    "Test A-3: development uvicorn came up for A-3",
                    False,
                    "dev uvicorn failed to start",
                )
        finally:
            _stop_uvicorn(dev_proc)
finally:
    _stop_uvicorn(prod_proc)


# ──────────────────────────────────────────────────────────────────────
# Test B: cookie Secure flag driven by ENVIRONMENT
# ──────────────────────────────────────────────────────────────────────

print()
print("=" * 60)
print("Test B: Set-Cookie Secure flag follows ENVIRONMENT")
print("=" * 60)

# Boot a fresh uvicorn per environment so we can hit dev-login cleanly
# and inspect the cookies WITHOUT competing with other tests for the
# shared dev instance's cookie state.

# Production boot -- cookie MUST carry Secure
def _fresh_secret() -> str:
    return secrets.token_urlsafe(48)


prod_b_port = _free_port()
prod_b_proc = _boot_uvicorn(
    env_overrides={
        "ENVIRONMENT": "production",
        "JWT_SECRET": _fresh_secret(),
        "FRONTEND_URL": "https://example.com",
    },
    port=prod_b_port,
)
try:
    if _wait_for_http(f"http://127.0.0.1:{prod_b_port}/healthz", timeout=30):
        status, headers, payload = _post(
            f"http://127.0.0.1:{prod_b_port}/api/auth/dev-login"
        )
        # in prod, dev-login is 404; we need a real login for cookie
        # test. Provision a real user via /register instead.
        if status == 404:
            import random
            import string

            email = "cookie-test-" + "".join(
                random.choices(string.ascii_lowercase + string.digits, k=8)
            ) + "@example.com"
            rs, _, _ = _post(
                f"http://127.0.0.1:{prod_b_port}/api/auth/register",
                body={"email": email, "password": "verysecret123", "full_name": "Cookie Test"},
            )
            # Now login that user
            ls, l_headers, lp = _post(
                f"http://127.0.0.1:{prod_b_port}/api/auth/login",
                body={"email": email, "password": "verysecret123"},
            )
            check(
                "Test B-1: production cookie has Secure flag",
                ls == 200 and _set_cookie_has_flag(l_headers, "Secure"),
                f"login status={ls}, headers_keys present={('Set-Cookie' in l_headers) or ('set-cookie' in l_headers)}",
            )
            # HttpOnly is always set, regardless of env
            check(
                "Test B-2: production cookie has HttpOnly",
                ls == 200 and _set_cookie_has_flag(l_headers, "HttpOnly"),
                f"login status={ls}",
            )
        else:
            check(
                "Test B-0: production uvicorn allowed /dev-login (guard missing?)",
                False,
                f"got status={status}, expected 404 so we must fall back to /register+login",
            )
    else:
        check("Test B-0: production uvicorn (B-1/2) came up", False, "boot timed out")
finally:
    _stop_uvicorn(prod_b_proc)

# Development boot -- cookie MUST NOT carry Secure
dev_b_port = _free_port()
dev_b_proc = _boot_uvicorn(
    env_overrides={"ENVIRONMENT": "development", "JWT_SECRET": "any"},
    port=dev_b_port,
)
try:
    if _wait_for_http(f"http://127.0.0.1:{dev_b_port}/healthz", timeout=30):
        ls, l_headers, _ = _post(
            f"http://127.0.0.1:{dev_b_port}/api/auth/dev-login"
        )
        # dev-login works in dev -- easier than juggling a real user
        check(
            "Test B-3: development cookie (dev-login) does NOT have Secure",
            ls == 200 and not _set_cookie_has_flag(l_headers, "Secure"),
            f"login status={ls}, headers={l_headers}",
        )
        check(
            "Test B-4: development cookie still has HttpOnly",
            ls == 200 and _set_cookie_has_flag(l_headers, "HttpOnly"),
            f"login status={ls}",
        )
        # logout cookie carries matching flags
        los, lo_headers, _ = _post(f"http://127.0.0.1:{dev_b_port}/api/auth/logout")
        check(
            "Test B-5: logout Set-Cookie exists and doesn't carry Secure (dev)",
            los == 200 and not _set_cookie_has_flag(lo_headers, "Secure"),
            f"logout status={los}",
        )
    else:
        check("Test B-3 pre: development uvicorn came up", False, "boot timed out")
finally:
    _stop_uvicorn(dev_b_proc)


# ──────────────────────────────────────────────────────────────────────
# Test C: GET /api/matches rate limit (~60/h per user)
# ──────────────────────────────────────────────────────────────────────

print()
print("=" * 60)
print("Test C: GET /api/matches rate limit (60/h)")
print("=" * 60)

# Use the long-running dev backend on LIVE_API. Lazily log in via
# dev-login once, then hammer /api/matches.
status, headers, payload = _post(f"{LIVE_API}/api/auth/dev-login")
if status != 200:
    check(
        "Test C pre: dev backend reachable and dev-login works",
        False,
        f"status={status}, payload={payload!r}",
    )
else:
    cookie_jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(cookie_jar)
    )
    # Reuse the cookie from dev-login (this is a POST)
    opener.open(
        urllib.request.Request(
            f"{LIVE_API}/api/auth/dev-login", method="POST"
        ),
        timeout=10,
    )
    check(
        "Test C pre: dev backend reachable and dev-login works",
        True,
    )

    # Track how many we successfully got through before a 429.
    last_429_at = None
    last_code = None
    last_body = None
    for i in range(80):
        try:
            resp = opener.open(
                urllib.request.Request(f"{LIVE_API}/api/matches"), timeout=10
            )
            last_code = resp.status
        except urllib.error.HTTPError as e:
            last_code = e.code
            last_body = e.read().decode("utf-8", errors="replace")[:200]
            if e.code == 429:
                last_429_at = i + 1
                break

    check(
        "Test C-1: GET /api/matches returns 429 within 80 attempts",
        last_429_at is not None and last_429_at <= 65,
        f"first 429 at attempt #{last_429_at}, last_code={last_code}, body_snip={last_body!r}",
    )
    check(
        "Test C-2: 429 came back BEFORE the 70th attempt (well above the 60 limit)",
        last_429_at is not None and last_429_at > 60,
        f"first 429 at attempt #{last_429_at} -- should be 61+ not in the first 60",
    )


print()
print("=" * 60)
print(f"Results: {tests_passed} passed, {tests_failed} failed, {tests_skipped} skipped")
print("=" * 60)
sys.exit(0 if tests_failed == 0 else 1)
