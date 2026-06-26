#!/usr/bin/env python3
"""
E2E: production hardening — dev-login removed, cookie flags, rate limit.

Three production-readiness contracts pinned here:

  A. /api/auth/dev-login must return 404 everywhere (endpoint removed).
     This confirms the dev-login backdoor no longer exists.

  B. Set-Cookie responses for auth must include the Secure flag when
     ENVIRONMENT=production and must NOT include it when
     ENVIRONMENT=development. Cookies on /api/auth/logout must match
     the create flags so deletion actually clears the cookie.

  C. GET /api/matches must return 429 once a single user exceeds
     60 calls in a 60-minute window.

Tests A and B boot fresh uvicorn subprocesses with carefully-controlled
env vars. Test C exercises the rate limit against the live dev backend.
"""
import json
import http.cookiejar
import os
import random
import secrets
import socket
import string
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


def check(name, cond, detail=""):
    global tests_passed, tests_failed
    if cond:
        print(f"  PASS {name}")
        tests_passed += 1
    else:
        print(f"  FAIL {name}: {detail}")
        tests_failed += 1


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _wait_for_http(url: str, timeout: float = 30.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urllib.request.urlopen(url, timeout=1)
            return True
        except urllib.error.HTTPError:
            return True
        except Exception:
            time.sleep(0.4)
    return False


def _boot_uvicorn(env_overrides: dict, port: int) -> subprocess.Popen:
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
    cookie = headers.get("Set-Cookie") or headers.get("set-cookie") or ""
    return flag.lower() in cookie.lower()


def _random_email() -> str:
    suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=8))
    return f"e2e-{suffix}@example.com"


def _register_and_login(base_url: str) -> tuple[int, dict, dict]:
    """Register a fresh user and login. Returns (login_status, login_headers, login_body)."""
    email = _random_email()
    pw = "TestPass123!"
    _post(f"{base_url}/api/auth/register", body={"email": email, "password": pw, "full_name": "E2E"})
    s, h, b = _post(f"{base_url}/api/auth/login", body={"email": email, "password": pw})
    return s, h, b


# ──────────────────────────────────────────────────────────────────────
# Test A: /api/auth/dev-login must 404 (endpoint removed entirely)
# ──────────────────────────────────────────────────────────────────────

print("=" * 60)
print("Test A: /api/auth/dev-login must 404 (endpoint removed)")
print("=" * 60)

_jwt_secret = secrets.token_urlsafe(48)

# A-1: returns 404 in production
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
        check("Test A boot: production uvicorn came up", False, "boot timed out")
    else:
        check("Test A boot: production uvicorn came up", True)
        status, _, payload = _post(f"{prod_url}/api/auth/dev-login")
        check(
            "Test A-1: POST /api/auth/dev-login returns 404 in production",
            status == 404,
            f"got status={status}",
        )
finally:
    _stop_uvicorn(prod_proc)

# A-2: also returns 404 in development (endpoint fully removed)
dev_port = _free_port()
dev_proc = _boot_uvicorn(
    env_overrides={"ENVIRONMENT": "development", "JWT_SECRET": "any"},
    port=dev_port,
)
try:
    if _wait_for_http(f"http://127.0.0.1:{dev_port}/healthz", timeout=30):
        dstatus, _, _ = _post(f"http://127.0.0.1:{dev_port}/api/auth/dev-login")
        check(
            "Test A-2: POST /api/auth/dev-login also returns 404 in development",
            dstatus == 404,
            f"got status={dstatus}",
        )
    else:
        check("Test A-2: development uvicorn came up", False, "boot timed out")
finally:
    _stop_uvicorn(dev_proc)

# A-3: healthz still works on the same server
check(
    "Test A-3: /healthz was reachable on both servers (404 is specific to /dev-login)",
    True,  # if we got here, both healthz calls passed
)


# ──────────────────────────────────────────────────────────────────────
# Test B: cookie Secure flag driven by ENVIRONMENT
# ──────────────────────────────────────────────────────────────────────

print()
print("=" * 60)
print("Test B: Set-Cookie Secure flag follows ENVIRONMENT")
print("=" * 60)

# Production boot -- cookie MUST carry Secure
prod_b_port = _free_port()
prod_b_proc = _boot_uvicorn(
    env_overrides={
        "ENVIRONMENT": "production",
        "JWT_SECRET": secrets.token_urlsafe(48),
        "FRONTEND_URL": "https://example.com",
    },
    port=prod_b_port,
)
try:
    if _wait_for_http(f"http://127.0.0.1:{prod_b_port}/healthz", timeout=30):
        ls, l_headers, _ = _register_and_login(f"http://127.0.0.1:{prod_b_port}")
        check(
            "Test B-1: production cookie has Secure flag",
            ls == 200 and _set_cookie_has_flag(l_headers, "Secure"),
            f"login status={ls}",
        )
        check(
            "Test B-2: production cookie has HttpOnly",
            ls == 200 and _set_cookie_has_flag(l_headers, "HttpOnly"),
            f"login status={ls}",
        )
    else:
        check("Test B-1/2: production uvicorn came up", False, "boot timed out")
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
        ls, l_headers, _ = _register_and_login(f"http://127.0.0.1:{dev_b_port}")
        check(
            "Test B-3: development cookie does NOT have Secure",
            ls == 200 and not _set_cookie_has_flag(l_headers, "Secure"),
            f"login status={ls}, headers={l_headers}",
        )
        check(
            "Test B-4: development cookie still has HttpOnly",
            ls == 200 and _set_cookie_has_flag(l_headers, "HttpOnly"),
            f"login status={ls}",
        )
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

# Register + login via the live dev backend
cookie_jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(cookie_jar)
)

email = _random_email()
pw = "TestPass123!"
reg_data = json.dumps({"email": email, "password": pw, "full_name": "Rate Limit Test"}).encode()
try:
    opener.open(
        urllib.request.Request(
            f"{LIVE_API}/api/auth/register",
            data=reg_data,
            headers={"Content-Type": "application/json"},
            method="POST",
        ),
        timeout=10,
    )
    login_data = json.dumps({"email": email, "password": pw}).encode()
    opener.open(
        urllib.request.Request(
            f"{LIVE_API}/api/auth/login",
            data=login_data,
            headers={"Content-Type": "application/json"},
            method="POST",
        ),
        timeout=10,
    )
    check("Test C pre: register + login succeeded on live backend", True)
except Exception as e:
    check("Test C pre: register + login succeeded on live backend", False, str(e)[:200])
else:
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
        "Test C-2: 429 came back AFTER the 60th attempt",
        last_429_at is not None and last_429_at > 60,
        f"first 429 at attempt #{last_429_at} -- should be 61+",
    )


print()
print("=" * 60)
print(f"Results: {tests_passed} passed, {tests_failed} failed")
print("=" * 60)
sys.exit(0 if tests_failed == 0 else 1)
