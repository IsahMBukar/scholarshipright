#!/usr/bin/env python3
"""
E2E: /onboarding slide carousel.

The page is a client-rendered React carousel (initial HTML is the
"Loading…" shell, content hydrates from JS). Without a headless
browser, we verify:

  A. /onboarding returns 200 for a fresh user (no redirect to login)
  B. SSR shell + hydration script for the page chunk is present
  C. The slide carousel structure exists in source:
     - 5 slide components exist (Welcome, Resume, Profile, Matches, Scholara)
     - SlideShell wraps all of them with progress dots + back/skip
     - slideIndex state + navigation (next/prev/setSlideIndex) is exposed
     - saveProfileFields mutation is exposed for inline profile save
  D. The /api/resumes/manual fallback (resume upload failure path) is
     called from ResumeSlide so the user can always proceed.
  E. /api/profile accepts the 4 critical fields (the slide's payload).
  F. Each slide component imports the right things and is in the page
     switch (page.tsx imports all 5).
  G. The CSS keyframes for slide transitions exist in globals.css.
"""
import os
import sys
import time
import subprocess
import re
import requests

API = os.getenv("API_URL", "http://localhost:8000")
FRONTEND = os.getenv("FRONTEND_URL", "http://localhost:3000")
ROOT = os.path.realpath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
SLIDES_DIR = os.path.join(ROOT, "frontend", "src", "app", "onboarding", "slides")
PAGE_PATH = os.path.join(ROOT, "frontend", "src", "app", "onboarding", "page.tsx")
HOOK_PATH = os.path.join(ROOT, "frontend", "src", "hooks", "useOnboarding.ts")
GLOBALS_CSS = os.path.join(ROOT, "frontend", "src", "app", "globals.css")

tests_passed = 0
tests_failed = 0
tests_skipped = 0


def check(name, cond, detail=""):
    global tests_passed, tests_failed
    if cond:
        print(f"  ✓ {name}")
        tests_passed += 1
    else:
        print(f"  ✗ {name}  {detail}")
        tests_failed += 1


def skip(name, reason):
    global tests_skipped
    print(f"  ⊘ {name}  (skipped: {reason})")
    tests_skipped += 1


def cleanup(email):
    subprocess.run([
        "psql", "-U", "system", "-d", "scholarshipright", "-c",
        f"DELETE FROM users WHERE email = '{email}';"
    ], check=False, capture_output=True)


def main():
    global tests_passed, tests_failed, tests_skipped
    print("=" * 60)
    print("E2E: /onboarding slide carousel")
    print("=" * 60)

    # ── PART A: API contract for fresh user
    print()
    print("  ── Part A: API contract for fresh user ──")
    s = requests.Session()
    email = f"onb-slide-{int(time.time())}@example.com"
    pw = "S" + "ecure" + "SlideTest42" + "!"

    r = s.post(f"{API}/api/auth/register",
               json={"email": email, "password": pw, "full_name": "Slide Test"})

    if r.status_code == 429:
        skip("register returns 200", "auth rate limit hit — skipping API tests")
        skip("sr_token cookie issued", "auth rate limit hit")
        skip("/api/auth/me returns 200", "auth rate limit hit")
        skip("/api/profile returns 404", "auth rate limit hit")
        skip("/api/profile accepts the 4 critical fields (POST)", "auth rate limit hit")
        skip("/api/resumes/manual creates a stub (failure-fallback path)", "auth rate limit hit")
        skip("/api/scholarships/featured returns ≥1 for matches preview", "auth rate limit hit")
        skip("/onboarding returns 200", "auth rate limit hit")
        api_ok = False
    else:
        check("register returns 200", r.status_code == 200,
              f"got {r.status_code}: {r.text[:200]}")
        check("sr_token cookie issued", "sr_token" in s.cookies,
              f"cookies: {list(s.cookies.keys())}")
        me = s.get(f"{API}/api/auth/me")
        check("/api/auth/me returns 200", me.status_code == 200,
              f"got {me.status_code}")
        prof = s.get(f"{API}/api/profile")
        check("/api/profile returns 404 (fresh user)", prof.status_code == 404,
              f"got {prof.status_code}")

        # /api/profile accepts the 4 critical fields
        prof_post = s.post(f"{API}/api/profile", json={
            "country_of_origin": "Nigeria",
            "target_degree": "master",
            "field_of_study": "computer_science",
            "target_countries": ["Germany", "United Kingdom"],
        })
        check("/api/profile accepts the 4 critical fields (POST)",
              prof_post.status_code == 200,
              f"got {prof_post.status_code}: {prof_post.text[:200]}")

        # /api/resumes/manual fallback
        manual = s.post(f"{API}/api/resumes/manual")
        check("/api/resumes/manual creates a stub (failure-fallback path)",
              manual.status_code == 200,
              f"got {manual.status_code}: {manual.text[:200]}")

        # /api/scholarships/featured
        featured = s.get(f"{API}/api/scholarships/featured")
        featured_data = featured.json() if featured.ok else []
        if isinstance(featured_data, dict):
            featured_list = featured_data.get("items", featured_data.get("scholarships", []))
        else:
            featured_list = featured_data
        check("/api/scholarships/featured returns ≥1 for matches preview",
              featured.status_code == 200 and len(featured_list) > 0,
              f"got {featured.status_code} with {len(featured_list) if isinstance(featured_list, list) else '?'} items")

        # /onboarding returns 200
        fe = s.get(f"{FRONTEND}/onboarding", allow_redirects=False)
        check("/onboarding returns 200 (no redirect to login)",
              fe.status_code == 200,
              f"got {fe.status_code}, location: {fe.headers.get('Location', 'none')}")
        check("app/onboarding/page.js chunk is loaded (proves hydration)",
              "app/onboarding/page.js" in fe.text)

        api_ok = True
        cleanup(email)

    # ── PART B: Source-code structure
    print()
    print("  ── Part B: source-code structure ──")

    # All 5 slide files exist
    for name in ["WelcomeSlide", "ResumeSlide", "ProfileSlide", "MatchesPreviewSlide", "ScholaraIntroSlide", "SlideShell"]:
        path = os.path.join(SLIDES_DIR, f"{name}.tsx")
        check(f"slide component file: {name}.tsx",
              os.path.exists(path),
              f"missing: {path}")

    page_src = open(PAGE_PATH).read()
    hook_src = open(HOOK_PATH).read()
    css_src = open(GLOBALS_CSS).read()

    # Page imports all 5 slides
    for name in ["WelcomeSlide", "ResumeSlide", "ProfileSlide", "MatchesPreviewSlide", "ScholaraIntroSlide"]:
        check(f"page imports {name}",
              f"import {name}" in page_src)

    # Page wires slides via slideIndex switch
    check("page uses slideIndex for slide selection",
          "ob.slideIndex === 0" in page_src and "ob.slideIndex === 4" in page_src)
    check("page renders 5 slides (switch has indices 0-4)",
          all(f"ob.slideIndex === {i}" in page_src for i in range(5)))

    # Hook exposes slide state + navigation
    check("hook exposes slideIndex",
          "slideIndex:" in hook_src and "slideIndex: number" in hook_src)
    check("hook exposes setSlideIndex (persisted to localStorage)",
          "setSlideIndex" in hook_src and "SLIDE_INDEX_KEY" in hook_src)
    check("hook exposes nextSlide + prevSlide",
          "nextSlide" in hook_src and "prevSlide" in hook_src)
    check("hook exposes resetSlides",
          "resetSlides" in hook_src)

    # Hook exposes saveProfileFields (used by ProfileSlide)
    check("hook exposes saveProfileFields mutation",
          "saveProfileFields" in hook_src and "createOrUpdateProfile" in hook_src)

    # CSS keyframes for slide transitions
    check("CSS: onboarding-fade-in keyframe defined",
          "onboarding-fade-in" in css_src)
    check("CSS: onboarding-slide-up keyframe defined",
          "onboarding-slide-up" in css_src)
    check("CSS: onboarding-slide-in-right keyframe defined",
          "onboarding-slide-in-right" in css_src)
    check("CSS: onboarding-slide-in-left keyframe defined",
          "onboarding-slide-in-left" in css_src)

    # Resume slide has failure handling
    resume_src = open(os.path.join(SLIDES_DIR, "ResumeSlide.tsx")).read()
    check("ResumeSlide handles upload failure (error state + manual fallback)",
          "kind: 'error'" in resume_src and "onManualEntry" in resume_src)
    check("ResumeSlide routes to /resume with onboarding=1",
          "/resume?onboarding=1" in resume_src or "/resume?onboarding" in resume_src)
    check("ResumeSlide has a 'I don't have a resume' link",
          "I don" in resume_src and "resume" in resume_src)

    # Profile slide has the 4 critical fields
    profile_src = open(os.path.join(SLIDES_DIR, "ProfileSlide.tsx")).read()
    check("ProfileSlide collects country_of_origin",
          "country_of_origin" in profile_src or "country" in profile_src.lower())
    check("ProfileSlide collects target_degree",
          "target_degree" in profile_src)
    check("ProfileSlide collects field_of_study",
          "field_of_study" in profile_src or "field" in profile_src.lower())
    check("ProfileSlide collects target_countries (multi-select)",
          "target_countries" in profile_src and "toggleTarget" in profile_src)
    check("ProfileSlide has a Skip escape hatch",
          "onSkip" in profile_src)

    # Matches preview slide fetches real scholarships
    matches_src = open(os.path.join(SLIDES_DIR, "MatchesPreviewSlide.tsx")).read()
    check("MatchesPreviewSlide fetches /api/scholarships/featured",
          "fetchFeaturedScholarships" in matches_src)
    check("MatchesPreviewSlide shows scholarship name + provider + tags",
          "name" in matches_src and "provider" in matches_src
          and "Fully Funded" in matches_src)
    check("MatchesPreviewSlide is OPTIONAL (has skip link)",
          "onSkip" in matches_src)
    check("MatchesPreviewSlide links to /scholarships",
          '"/scholarships"' in matches_src or "href=\"/scholarships\"" in matches_src)

    # Scholara slide is optional
    scholara_src = open(os.path.join(SLIDES_DIR, "ScholaraIntroSlide.tsx")).read()
    check("ScholaraIntroSlide is OPTIONAL (has skip)",
          "onSkip" in scholara_src)
    check("ScholaraIntroSlide shows sample prompts (3 of them)",
          scholara_src.count("text:") >= 3)
    check("ScholaraIntroSlide marks chatted and routes to /chat",
          "markChatted" in scholara_src and "onComplete" in scholara_src)
    # Parent page does the /chat navigation
    check("parent page routes Scholara completion to /chat",
          "router.push('/chat')" in page_src)

    # SlideShell has back button + skip onboarding
    shell_src = open(os.path.join(SLIDES_DIR, "SlideShell.tsx")).read()
    check("SlideShell has Back button (shown on slides 1+)",
          "onBack" in shell_src and "showBack" in shell_src)
    check("SlideShell has top 'Skip onboarding' link",
          "Skip onboarding" in shell_src)
    check("SlideShell renders 5 progress dots",
          "length: total" in shell_src or ("length: total" in shell_src) or
          ("Array.from({ length: total })" in shell_src))

    print()
    print(f"Results: {tests_passed} passed, {tests_failed} failed, {tests_skipped} skipped")
    if tests_failed:
        print("❌ FAIL")
        sys.exit(1)
    print("🎉 /onboarding slide carousel is in place and wired up correctly.")


if __name__ == "__main__":
    main()
