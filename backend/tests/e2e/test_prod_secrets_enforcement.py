#!/usr/bin/env python3
"""
E2E: production must refuse to start with insecure JWT_SECRET settings.

Background: a prior audit flagged that the auth module was reading
JWT_SECRET via os.getenv() with a hard-coded fallback, so a production
deploy with a missing or placeholder secret would boot and sign tokens
with a known-public string. We now centralize the secret in
app.core.config.Settings.jwt_secret + a guard that fires at
get_settings() time when ENVIRONMENT="production".

This test pins that contract on four axes:

  1. App boots in development with an empty JWT_SECRET (no flag day
     break for fresh clones).
  2. Refuses to construct Settings() when ENVIRONMENT=production and
     JWT_SECRET is empty.
  3. Refuses when JWT_SECRET is a known dev placeholder ("change-me-...").
  4. Refuses when JWT_SECRET is shorter than 32 chars.
  5. Boots cleanly when ENVIRONMENT=production and JWT_SECRET is a
     64-char random string; the resulting settings carry the right
     secret and environment.

Approach: spawn a fresh Python interpreter with carefully-controlled
env vars and assert on the output / exit code. No network calls, no
booting the actual FastAPI server.
"""
import os
import subprocess
import sys
import textwrap

ROOT = os.path.realpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..")
)
BACKEND_DIR = os.path.join(ROOT, "backend")

# Helper: build the env var dict we want for a child process. Always
# clears JWT_SECRET and ENVIRONMENT first so the child gets a clean slate.
def env_with(**overrides):
    env = os.environ.copy()
    env.pop("JWT_SECRET", None)
    env.pop("ENVIRONMENT", None)
    env.pop("PYTHONPATH", None)
    env["PYTHONPATH"] = BACKEND_DIR
    env["PYTHONUNBUFFERED"] = "1"
    for k, v in overrides.items():
        if v is not None:
            env[k] = v
    return env


# Helper: run a Python snippet in the venv and return (returncode, combined_output).
def run_in_backend(snippet, **env_overrides):
    env = env_with(**env_overrides)
    proc = subprocess.run(
        ["venv/bin/python", "-c", textwrap.dedent(snippet)],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        timeout=20,
    )
    return proc.returncode, (proc.stdout or "") + (proc.stderr or "")


SETTINGS_PROBE = """
try:
    from app.core.config import get_settings
    get_settings.cache_clear()
    s = get_settings()
    print("ENV=" + s.environment)
    print("LEN=" + str(len(s.jwt_secret)))
except RuntimeError as e:
    print("CRASH: " + str(e)[:200])
"""


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


def expect_crash(name, env_overrides):
    """Assert that get_settings() raises RuntimeError when called with the
    given env. Prints the error message for debugging."""
    rc, out = run_in_backend(SETTINGS_PROBE, **env_overrides)
    check(
        f"{name} refused to boot",
        "CRASH:" in out,
        f"exit={rc}, out={out!r}",
    )
    return out


def expect_boot(name, env_overrides, expected_env, expected_min_len=32):
    """Assert Settings were constructed cleanly and len>=32."""
    rc, out = run_in_backend(SETTINGS_PROBE, **env_overrides)
    env_ok = f"ENV={expected_env}" in out
    # Pull the LEN= line
    len_ok = False
    for line in out.splitlines():
        if line.startswith("LEN="):
            try:
                length = int(line.split("=", 1)[1])
                len_ok = length >= expected_min_len
            except ValueError:
                pass
    check(
        f"{name} boots with env={expected_env}, secret>={expected_min_len} chars",
        env_ok and len_ok and rc == 0,
        f"exit={rc}, env_ok={env_ok}, len_ok={len_ok}, out={out!r}",
    )


print("=" * 60)
print("Regression: production JWT_SECRET enforcement")
print("=" * 60)

# Test 1: development with empty JWT_SECRET must boot (no regression for
# fresh clones)
expect_boot(
    "Test 1: development + empty JWT_SECRET",
    {"ENVIRONMENT": "development", "JWT_SECRET": None},
    expected_env="development",
    expected_min_len=0,  # dev allows empty
)

# Test 2: production + empty JWT_SECRET must crash
out = expect_crash(
    "Test 2: production + missing JWT_SECRET",
    {"ENVIRONMENT": "production", "JWT_SECRET": None},
)
check(
    "Test 2 message names JWT_SECRET",
    "JWT_SECRET" in out,
    f"expected 'JWT_SECRET' in crash message; got {out!r}",
)

# Test 3: production + known dev placeholder must crash
out = expect_crash(
    "Test 3: production + placeholder JWT_SECRET",
    {"ENVIRONMENT": "production", "JWT_SECRET": "change-me-in-production"},
)
check(
    "Test 3 message flags placeholder",
    "placeholder" in out.lower(),
    f"expected placeholder mention; got {out!r}",
)

# Test 4: production + short secret (5 chars) must crash
out = expect_crash(
    "Test 4: production + short JWT_SECRET",
    {"ENVIRONMENT": "production", "JWT_SECRET": "short"},
)
check(
    "Test 4 message reports length",
    "32" in out,
    f"expected '32' in crash message; got {out!r}",
)

# Test 5: production + valid 64-char secret must boot cleanly
expect_boot(
    "Test 5: production + 64-char random JWT_SECRET",
    {"ENVIRONMENT": "production", "JWT_SECRET": "a" * 64},
    expected_env="production",
    expected_min_len=32,
)

# Test 6: app.main can still be imported in development with empty
# JWT_SECRET (guards against a regression where the import-time
# validator breaks the dev experience)
print()
print("=" * 60)
print("Bonus: import-time check (development boot path)")
print("=" * 60)
import_probe = (
    "from app.core.config import get_settings\n"
    "get_settings.cache_clear()\n"
    "s = get_settings()\n"
    "import app.main\n"
    "print('IMPORT_OK ' + s.environment)\n"
)
rc, out = run_in_backend(
    import_probe,
    **{"ENVIRONMENT": "development", "JWT_SECRET": None},
)
check(
    "Test 6: app.main imports cleanly when environment=development",
    rc == 0 and "IMPORT_OK development" in out,
    f"exit={rc}, out={out!r}",
)


print()
print("=" * 60)
print(f"Results: {tests_passed} passed, {tests_failed} failed, {tests_skipped} skipped")
print("=" * 60)
sys.exit(0 if tests_failed == 0 else 1)
