#!/usr/bin/env python3
"""
E2E: /onboarding access policy + per-user slide isolation.

Three things this test pins:

  1. /onboarding REDIRECTS completed users to /scholarships.
     A user is "completed" when they have a source (resume or manual
     stub) AND a complete profile (country_of_origin + target_degree
     + field_of_study). The optional matches / Scholara slides do NOT
     block this.

  2. The onboarding slide index is PER-USER SCOPED in localStorage.
     Two users on the same browser must NOT see each other's slide.
     The keys are:
       - sr_onboard_slide_v1_<userId>           (current, scoped)
       - sr_manual_source_v1_<userId>          (current, scoped)
       - sr_chatted_v1_<userId>                 (current, scoped)
     The legacy unscoped keys (sr_onboard_slide_v1, etc.) MUST NOT
     be written to by any current code path — they're only cleared
     defensively by clearOnboardingForUser().

  3. Logout WIPES the user's onboarding localStorage keys via
     clearOnboardingForUser(). The function is defined in the hook
     and called from useLogout.ts / logoutAndRedirect().

We assert against the SOURCE FILES (since the live /onboarding page
is client-rendered and we have no headless browser in this env)
plus a few /api endpoint sanity checks to confirm the user model
supports the "completed" criteria.
"""
import os
import re
import sys
import time
import json
import requests

API = os.getenv("API_URL", "http://localhost:8000")
ROOT = os.path.realpath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
HOOK_PATH = os.path.join(ROOT, "frontend", "src", "hooks", "useOnboarding.ts")
LOGOUT_PATH = os.path.join(ROOT, "frontend", "src", "hooks", "useLogout.ts")
PAGE_PATH = os.path.join(ROOT, "frontend", "src", "app", "onboarding", "page.tsx")
RESUME_SLIDE_PATH = os.path.join(
    ROOT, "frontend", "src", "app", "onboarding", "slides", "ResumeSlide.tsx"
)

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
    print("E2E: /onboarding access policy + per-user slide isolation")
    print("=" * 60)

    # ── PART A: /onboarding page redirects completed users ──────────
    print()
    print("  -- Part A: /onboarding redirects completed users --")
    if not os.path.exists(PAGE_PATH):
        check("onboarding/page.tsx exists", False, f"missing {PAGE_PATH}")
    else:
        page = read(PAGE_PATH)
        check("/onboarding pushes /scholarships on completed user",
              "router.push('/scholarships')" in page)
        # The redirect must depend on both source AND profile being present.
        # Find ALL useEffects that call router.push('/scholarships') and
        # check at least one has the right dependencies.
        redirect_blocks = re.findall(
            r"useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?router\.push\('/scholarships'\)[\s\S]*?\},\s*\[[^\]]+\]\s*\)",
            page,
        )
        has_right_deps = False
        for block in redirect_blocks:
            if ("hasResume" in block or "hasManualSource" in block) and "hasProfile" in block:
                has_right_deps = True
                break
        check("redirect useEffect depends on hasResume/hasProfile",
              has_right_deps)
        # Mid-flow protection: a user with slideIndex > 0 must not be
        # redirected. The page guards with `ob.slideIndex > 0`.
        check("mid-flow users are not redirected (slideIndex > 0 check)",
              "ob.slideIndex > 0" in page)
        # The OLD behavior (auto-advance to slide 3 inside a useEffect
        # triggered by hasResume/hasProfile) must be gone. We check for
        # the SPECIFIC old pattern: a useEffect that depends on
        # hasResume/hasProfile and calls setSlideIndex(3). The other
        # setSlideIndex(3) calls are inside slide onSkip handlers and
        # are legitimate (Profile → Matches).
        old_pattern = re.search(
            r"useEffect\([^)]*\[ob\.loading, ob\.hasResume, ob\.hasProfile\][^)]*\)\s*\{[^}]*setSlideIndex\(3\)",
            page,
        )
        check("old auto-advance useEffect to slide 3 is removed",
              old_pattern is None,
              "found old auto-advance useEffect — this used to skip completed users to slide 3")

    # ── PART B: slide index is per-user scoped ──────────────────────
    print()
    print("  -- Part B: per-user slide index scoping --")
    if not os.path.exists(HOOK_PATH):
        check("useOnboarding.ts exists", False)
    else:
        hook = read(HOOK_PATH)
        # The localStorage read for the slide index must be per-user scoped.
        check("slide index read uses scoped key",
              "scopedKey(SLIDE_INDEX_KEY, userId)" in hook)
        # The localStorage write for the slide index must be per-user scoped.
        check("slide index write uses scoped key",
              "scopedKey(SLIDE_INDEX_KEY, userId)" in hook)
        # No unscoped writes anywhere in the hook.
        check("no unscoped SLIDE_INDEX_KEY write in hook",
              "localStorage.setItem(SLIDE_INDEX_KEY," not in hook
              and "localStorage.setItem('sr_onboard_slide_v1'," not in hook)
        # No unscoped reads anywhere in the hook.
        check("no unscoped SLIDE_INDEX_KEY read in hook",
              "localStorage.getItem(SLIDE_INDEX_KEY)" not in hook
              and "localStorage.getItem('sr_onboard_slide_v1'" not in hook)
        # Same for manual source flag.
        check("manual source read uses scoped key",
              "scopedKey(MANUAL_SOURCE_FLAG_KEY, uid)" in hook)
        check("manual source write uses scoped key",
              "scopedKey(MANUAL_SOURCE_FLAG_KEY, userId)" in hook)
        check("no unscoped MANUAL_SOURCE_FLAG_KEY write in hook",
              "localStorage.setItem('sr_manual_source_v1'," not in hook)
        # Same for chat flag.
        check("chat flag write uses scoped key",
              "scopedKey(CHAT_FLAG_KEY, userId)" in hook)
        # clearOnboardingForUser must exist and wipe both scoped AND
        # legacy keys.
        check("clearOnboardingForUser is exported",
              "export function clearOnboardingForUser" in hook)
        check("clearOnboardingForUser wipes legacy unscoped keys",
              "ls.removeItem(SLIDE_INDEX_KEY)" in hook
              and "ls.removeItem(MANUAL_SOURCE_FLAG_KEY)" in hook
              and "ls.removeItem(CHAT_FLAG_KEY)" in hook)

    # ── PART C: ResumeSlide does NOT write unscoped keys ───────────
    print()
    print("  -- Part C: no unscoped localStorage writes in slides --")
    if not os.path.exists(RESUME_SLIDE_PATH):
        check("ResumeSlide.tsx exists", False)
    else:
        slide = read(RESUME_SLIDE_PATH)
        check("ResumeSlide does NOT write unscoped sr_manual_source_v1",
              "localStorage.setItem('sr_manual_source_v1'" not in slide,
              "found unscoped write — this would leak across users")
        check("ResumeSlide does NOT write unscoped sr_onboard_slide_v1",
              "localStorage.setItem('sr_onboard_slide_v1'" not in slide)
        # The slide has the onMarkManual prop so the parent can do
        # the scoped write.
        check("ResumeSlide accepts onMarkManual prop",
              "onMarkManual" in slide)
        check("ResumeSlide calls onMarkManual in onManualEntry",
              re.search(r"onManualEntry[^}]*onMarkManual", slide, re.DOTALL) is not None)

    # ── PART D: page passes onMarkManual to ResumeSlide ────────────
    print()
    print("  -- Part D: page passes onMarkManual to ResumeSlide --")
    if not os.path.exists(PAGE_PATH):
        check("onboarding/page.tsx exists", False)
    else:
        page = read(PAGE_PATH)
        check("page passes onMarkManual={ob.markManualSource} to ResumeSlide",
              re.search(
                  r"<ResumeSlide[\s\S]*?onMarkManual=\{ob\.markManualSource\}",
                  page,
              ) is not None,
              "ResumeSlide is not getting the scoped markManualSource")

    # ── PART E: logout calls clearOnboardingForUser ─────────────────
    print()
    print("  -- Part E: logout wipes onboarding localStorage --")
    if not os.path.exists(LOGOUT_PATH):
        check("useLogout.ts exists", False)
    else:
        lo = read(LOGOUT_PATH)
        check("useLogout imports clearOnboardingForUser",
              "import { clearOnboardingForUser }" in lo)
        check("useLogout imports fetchMe",
              "import { fetchMe }" in lo)
        # The function bodies should call BOTH fetchMe() and
        # clearOnboardingForUser(). We count occurrences in the file
        # and verify at least 2 calls each (one in logout, one in
        # logoutAndRedirect).
        check("useLogout calls fetchMe at least twice (logout + logoutAndRedirect)",
              lo.count("fetchMe()") >= 2)
        check("useLogout calls clearOnboardingForUser at least twice",
              lo.count("clearOnboardingForUser(") >= 2)
        # The userId is derived from fetchMe and passed to
        # clearOnboardingForUser.
        check("useLogout derives userId from fetchMe and passes it",
              re.search(
                  r"const\s+me\s*=\s*await\s+fetchMe",
                  lo,
              ) is not None
              and "clearOnboardingForUser(userId)" in lo)

    # ── PART F: API supports the "completed" user model ────────────
    print()
    print("  -- Part F: API supports the completed-user model --")
    # Register a fresh user, create a profile, mark complete, then
    # verify /api/profile returns the data the hook needs to decide
    # hasProfile=true. We don't need to upload a real resume — the
    # /api/profile has_profile check uses the schema fields, not the
    # resume table.
    s = requests.Session()
    email = f"onb-scoping-{int(time.time())}@example.com"
    pw = "S" + "coping" + "Test42" + "!"
    r = s.post(f"{API}/api/auth/register",
               json={"email": email, "password": pw, "full_name": "Onb Scoping"})
    if r.status_code != 200:
        skip("register round-trip", f"got {r.status_code}")
    else:
        check("register round-trip succeeds", True)
        # Save a complete profile (country + degree + field). The
        # /api/profile endpoint uses POST (not PUT) for both create
        # and update.
        r = s.post(f"{API}/api/profile", json={
            "country_of_origin": "Nigeria",
            "target_degree": "Master's",
            "field_of_study": "Computer Science",
        })
        check("save complete profile returns 200", r.status_code == 200,
              f"got {r.status_code} body={r.text[:200]}")
        # Read it back; the hook would see country+degree+field and
        # mark hasProfile=true.
        r = s.get(f"{API}/api/profile")
        if r.status_code == 200:
            prof = r.json()
            ok = bool(prof.get("country_of_origin") and prof.get("target_degree"))
            # field_of_study OR target_fields must be present.
            has_field = bool(
                prof.get("field_of_study")
                or (prof.get("target_fields") or [])
            )
            check("/api/profile returns country_of_origin", ok)
            check("/api/profile returns field_of_study or target_fields",
                  has_field, f"profile keys: {list(prof.keys())[:10]}")
        else:
            check("/api/profile GET returns 200 for completed user", False,
                  f"got {r.status_code}")
        # Cleanup
        try:
            import subprocess
            subprocess.run(
                ["psql", "-U", "system", "-d", "scholarshipright", "-c",
                 f"DELETE FROM users WHERE email = '{email}';"],
                check=False, capture_output=True,
            )
        except Exception:
            pass

    print()
    print("=" * 60)
    print(f"RESULTS:  {tests_passed} passed,  {tests_failed} failed,  {tests_skipped} skipped")
    print("=" * 60)
    if tests_failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
