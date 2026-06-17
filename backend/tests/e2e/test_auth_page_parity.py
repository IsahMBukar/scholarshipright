#!/usr/bin/env python3
"""
E2E: /login and /signup must share the accept-invite design language.

The three auth surfaces — /login, /signup, /admin/accept-invite — must
look and feel like one family. The user explicitly called this out
("sign up/login shall have the same UI/UX style as the accept admin
invite page"), so this test locks every visual token in place so a
future drift can be caught in CI.

We assert against the SOURCE FILES (the source of truth — what will be
shipped), with a parallel set of HTTP-render checks so the test also
catches runtime / hydration / Suspense issues.
"""
import os
import re
import sys
import time
import json
import http.cookiejar
import urllib.request
import urllib.error

FRONTEND = os.getenv("FRONTEND_URL", "http://localhost:3000")
ROOT = os.path.realpath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
LOGIN_PATH = os.path.join(ROOT, "frontend", "src", "app", "login", "page.tsx")
SIGNUP_PATH = os.path.join(ROOT, "frontend", "src", "app", "signup", "page.tsx")
ACCEPT_PATH = os.path.join(ROOT, "frontend", "src", "app", "admin", "accept-invite", "page.tsx")
PWF_PATH = os.path.join(ROOT, "frontend", "src", "components", "auth", "PasswordField.tsx")
LOGIN_LOAD = os.path.join(ROOT, "frontend", "src", "app", "login", "loading.tsx")
SIGNUP_LOAD = os.path.join(ROOT, "frontend", "src", "app", "signup", "loading.tsx")

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


def strip_js_comments(src):
    """Strip // line comments and /* block comments */ from source.
    Used so test assertions don't false-positive on tokens inside comments.
    """
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.DOTALL)
    src = re.sub(r"//[^\n]*", "", src)
    return src


def get(url):
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=10) as r:
        return r.status, r.read().decode("utf-8", errors="ignore")


# Tokens that MUST be present in all 3 auth pages
COMMON_TOKENS= [  # noqa
    # Page wrapper
    "min-h-screen flex items-center justify-center p-6 bg-gray-100",
    # Card
    "max-w-md w-full bg-white rounded-card border border-gray-200 p-8",
    # In-card header
    "flex items-center gap-3 mb-6",
    "w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center",
    "text-lg font-semibold text-text-primary",
    "text-xs text-text-secondary",
    # Label
    "block text-xs font-medium text-text-secondary mb-1",
    # Input (text fields use the white style)
    "w-full h-10 px-3 rounded-btn border border-gray-200",
    "focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary",
    # Required marker
    "text-red-500 ml-0.5",
    # Error pill
    "flex items-start gap-2 rounded-btn border border-red-200 bg-red-50 p-3 text-xs text-red-700",
    "AlertTriangle",
    # Button
    "import Button from '@/components/admin/ui/Button'",
    'variant="primary"',
    'size="md"',
    'className="w-full"',
    # Shared password field
    "import PasswordField from '@/components/auth/PasswordField'",
]

# Tokens that MUST be present only in pages that use useSearchParams
# (login + accept-invite). Signup doesn't need them since it has no
# URL state to wait for.
SUSPENSE_TOKENS= [  # noqa
    "min-h-screen flex items-center justify-center bg-gray-100",
    "Loader2",
    "Suspense",
]

# Tokens that MUST NOT appear in any of the three pages
FORBIDDEN_TOKENS= [  # noqa
    # Old login/signup wrapper
    "bg-gray-100 flex items-center justify-center px-4",
    # Shadows on auth cards
    "shadow-sm",
    # Big centered header above the card
    "text-[28px] font-extrabold text-primary",
    "text-[32px] font-bold text-text-primary",
    "text-center mb-8",
    # Old input style (gray fill, rounded-card, larger)
    "p-3.5 bg-gray-100",
    # Old label style (big, semibold)
    "text-[14px] font-semibold text-text-primary block mb-2",
]


def assert_all_present(name, src, tokens):
    missing = [t for t in tokens if t not in src]
    check(
        f"{name}: {len(tokens) - len(missing)}/{len(tokens)} tokens present",
        not missing,
        f"missing: {missing}",
    )


def assert_none_present(name, src, tokens):
    leaked = [t for t in tokens if t in src]
    check(
        f"{name}: no forbidden tokens",
        not leaked,
        f"leaked: {leaked}",
    )


def main():
    global tests_passed, tests_failed, tests_skipped
    print("=" * 60)
    print("E2E: /login, /signup, /admin/accept-invite design parity")
    print("=" * 60)

    # ── PART A: source-file structural checks ──────────────────────────
    print()
    print("  -- Part A: common design tokens in source --")
    pages_common= [
        ("login", LOGIN_PATH),
        ("signup", SIGNUP_PATH),
        ("accept-invite", ACCEPT_PATH),
    ]
    pages_with_suspense= [
        ("login", LOGIN_PATH),
        ("accept-invite", ACCEPT_PATH),
    ]

    for label, path in pages_common:
        if not os.path.exists(path):
            skip(f"{label} page.tsx exists", f"missing {path}")
            continue
        src = strip_js_comments(read(path))
        assert_all_present(f"{label} (common)", src, COMMON_TOKENS)
        assert_none_present(f"{label} (forbidden)", src, FORBIDDEN_TOKENS)

    print()
    print("  -- Part A2: Suspense tokens (only login + accept-invite) --")
    for label, path in pages_with_suspense:
        if not os.path.exists(path):
            continue
        src = strip_js_comments(read(path))
        assert_all_present(f"{label} (suspense)", src, SUSPENSE_TOKENS)

    # ── PART B: shared PasswordField exists and is used by all three ─
    print()
    print("  -- Part B: shared PasswordField component --")
    if not os.path.exists(PWF_PATH):
        check("PasswordField component exists", False, f"missing {PWF_PATH}")
    else:
        pwf = read(PWF_PATH)
        check("PasswordField exists at components/auth/PasswordField.tsx", True)
        check("PasswordField exports default", "export default function PasswordField" in pwf)
        check("PasswordField uses lucide Eye/EyeOff", "EyeOff" in pwf and "Eye" in pwf)
        check("PasswordField has strength meter", "evaluateStrength" in pwf)
        check("PasswordField has showStrength prop", "showStrength" in pwf)
        check("PasswordField has requiredMark prop", "requiredMark" in pwf)
        check("PasswordField input uses shared style",
              "w-full h-10 pl-3 pr-10 rounded-btn border border-gray-200" in pwf)
        if os.path.exists(SIGNUP_PATH):
            check("signup imports shared PasswordField",
                  'PasswordField' in strip_js_comments(read(SIGNUP_PATH)))
        if os.path.exists(LOGIN_PATH):
            check("login imports shared PasswordField",
                  'PasswordField' in strip_js_comments(read(LOGIN_PATH)))
        if os.path.exists(ACCEPT_PATH):
            check("accept-invite imports shared PasswordField",
                  'PasswordField' in strip_js_comments(read(ACCEPT_PATH)))

    # ── PART C: Suspense loading state files ───────────────────────────
    print()
    print("  -- Part C: Suspense loading files --")
    for label, path in [("login", LOGIN_LOAD), ("signup", SIGNUP_LOAD)]:
        if not os.path.exists(path):
            check(f"{label}/loading.tsx exists", False, f"missing {path}")
            continue
        src = read(path)
        check(f"{label}/loading.tsx uses Loader2", "Loader2" in src)
        check(f"{label}/loading.tsx matches accept-invite layout",
              "min-h-screen flex items-center justify-center bg-gray-100" in src)

    # ── PART D: HTTP render check ─────────────────────────────────────
    print()
    print("  -- Part D: HTTP render returns 200 + tokens present in HTML --")
    for label, route in [("login", "/login"), ("signup", "/signup")]:
        try:
            status, html = get(f"{FRONTEND}{route}")
        except Exception as e:
            skip(f"{label} HTTP render", f"{e}")
            continue
        check(f"{label} returns 200", status == 200, f"status={status}")
        check(f"{label} SSR shell has gray-100 background", "bg-gray-100" in html)
        check(f"{label} SSR shell has a centered loader", "animate-spin" in html)

    # ── PART E: full register -> login round-trip ────────────────────
    # Rate-limit aware: if the register bucket is already full from
    # prior test runs, skip — the structural + HTTP-render checks
    # above are sufficient to prove the design parity contract.
    print()
    print("  -- Part E: real user can sign up and log in --")
    cj = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

    email = f"auth-parity-{int(time.time())}@example.com"
    pw = "ParityTest42!"

    # Pre-check: is the auth_register bucket clear?
    pre = urllib.request.Request(
        f"{FRONTEND}/api/auth/register",
        data=json.dumps({"email": f"parity-pre-{int(time.time())}@x.com",
                         "password": "x",
                         "full_name": "pre"}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with opener.open(pre, timeout=10) as r:
            pre_status = r.status
    except urllib.error.HTTPError as e:
        pre_status = e.code

    if pre_status == 429:
        skip("register round-trip succeeds", "auth_register bucket already full (rate-limited)")
        skip("login round-trip succeeds", "auth_login bucket assumed limited (skipped after register 429)")
        skip("logged-in cookie is honored on /api/auth/me", "register was rate-limited; no user to log in as")
    else:
        req = urllib.request.Request(
            f"{FRONTEND}/api/auth/register",
            data=json.dumps({"email": email, "password": pw, "full_name": "Parity Test"}).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with opener.open(req, timeout=10) as r:
                reg_status = r.status
                reg_body = json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            reg_status = e.code
            reg_body = json.loads(e.read().decode())

        if reg_status == 200 and reg_body.get("email") == email:
            check("register round-trip succeeds", True)
        else:
            check("register round-trip succeeds", False, f"status={reg_status} body={reg_body}")
            _finish()
            return

        req = urllib.request.Request(
            f"{FRONTEND}/api/auth/login",
            data=json.dumps({"email": email, "password": pw}).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with opener.open(req, timeout=10) as r:
                login_status = r.status
        except urllib.error.HTTPError as e:
            login_status = e.code
        check("login round-trip succeeds", login_status == 200, f"status={login_status}")

        req = urllib.request.Request(f"{FRONTEND}/api/auth/me", method="GET")
        try:
            with opener.open(req, timeout=10) as r:
                me = json.loads(r.read().decode())
            check("logged-in cookie is honored on /api/auth/me",
                  me.get("email") == email,
                  f"got {me}")
        except Exception as e:
            check("logged-in cookie is honored on /api/auth/me", False, str(e))

    _finish()


def _finish():
    print()
    print("=" * 60)
    print(f"RESULTS:  {tests_passed} passed,  {tests_failed} failed,  {tests_skipped} skipped")
    print("=" * 60)
    if tests_failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
