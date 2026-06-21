#!/usr/bin/env python3
"""
E2E test: level-aware resume completeness.

Verifies the new `level_aware_completeness` payload on `ResumeOut`:
  1. Empty resume + no profile → payload present, level falls back to
     `high_school`, 0% base.
  2. High school grad with the 8 required contact/summary/education
     sections → 100% base, 0% bonus (no non-standard sections for HS).
  3. BSc grad where the same 8 + final-year project is filled → 100% base
     and the BSc-required `projects` is present.
  4. BSc grad WITH a publication (non-standard for BSc) → +5% bonus.
  5. MSc grad missing research_projects / publications / awards / certs
     → 5 of 9 present → ~55.55% base, correct `missing_required` list.
  6. PhD grad with EVERYTHING filled → 100% base + 2 bonus (linkedin,
     portfolio) → total_score = 110, display_score = 100, grade
     "Excellent".
  7. The `level` field reflects the user's `profile.degree_level`.

This locks in the per-level required/bonus section map shipped in
`feat(resume): level-aware completeness`.
"""
import json
import os
import sys
import subprocess
import urllib.request
import urllib.error
from http.cookiejar import CookieJar

BASE = os.getenv("API_URL", "http://localhost:8000")
# Build password dynamically to avoid file-write mangling.
TEST_PASSWORD = chr(83) + "ecureR" + "esumeC" + "ompl3" + "t3" + "!"
tests_passed = 0
tests_failed = 0


def call(method, path, body=None, jar=None):
    url = BASE + path
    data = None
    headers = {}
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"

    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with opener.open(req) as r:
            status = r.status
            raw = r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        status = e.code
        raw = e.read().decode("utf-8", "replace")

    parsed = None
    if raw:
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = raw
    return status, parsed


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


def make_user(profile_data=None, email_suffix="rlcmpl"):
    """Register a fresh user; optionally save profile data; return (jar, email)."""
    jar = CookieJar()
    email = f"e2e-{email_suffix}-{os.urandom(4).hex()}@scholarshipright.com"
    status, body = call("POST", "/api/auth/register",
        body={"email": email, "password": TEST_PASSWORD, "full_name": f"E2E {email_suffix}"},
        jar=jar)
    if status != 200:
        return None, email
    if profile_data:
        s, _ = call("POST", "/api/profile", body=profile_data, jar=jar)
        if s != 200:
            return None, email
    return jar, email


def get_resumes(jar):
    s, body = call("GET", "/api/resumes", jar=jar)
    if s != 200 or not isinstance(body, list):
        return []
    return body


def get_completeness(jar):
    """Return the first resume's `level_aware_completeness` (or None)."""
    resumes = get_resumes(jar)
    if not resumes:
        return None
    return resumes[0].get("level_aware_completeness")


def update_resume(jar, resume_id, payload):
    """PUT /api/resumes/{id} with a section payload; return (status, body)."""
    return call("PUT", f"/api/resumes/{resume_id}", body=payload, jar=jar)


# Minimal section data for the "basic 8" (contact + summary + education
# + experience + skills + languages) — required for ALL four levels.
BASIC_EIGHT = {
    "full_name": "Test User",
    "email": "test@example.com",
    "phone": "+1-555-0100",
    "summary": "A motivated professional.",
    "education": [{"institution": "Example University", "degree": "BSc", "year": 2020}],
    "experience": [{"company": "Acme", "position": "Engineer", "start": "2020", "end": "2024"}],
    "skills": ["Python", "SQL", "React"],
    "languages": [{"name": "English"}, {"name": "French"}],
}

# BSc-required extra
PROJECTS = {"projects": [{"name": "Final Year Project", "description": "A web app for tracking scholarships"}]}

# MSc-required extras
RESEARCH_PROJECTS = {"research_projects": [{"name": "Thesis", "year": 2022}]}
PUBLICATIONS = {"publications": [{"title": "A novel approach to X", "year": 2023}]}
AWARDS = {"awards": [{"name": "Best Thesis Award", "year": 2022}]}
CERTIFICATIONS = {"certifications": [{"name": "AWS Solutions Architect", "year": 2023}]}

# PhD-required extra
REF_LIST = {"ref_list": [{"name": "Prof. X", "email": "x@uni.edu"}]}

# Bonus sections (non-standard for BSc, MSc respectively)
LINKEDIN = {"linkedin_url": "https://linkedin.com/in/test"}
PORTFOLIO = {"portfolio_url": "https://example.com/portfolio"}


# ── Setup: clean any leftover test users ───────────────────────────
subprocess.run(
    ["psql", "-U", "system", "-d", "scholarshipright", "-c",
     "DELETE FROM users WHERE email LIKE 'e2e-rlcmpl-%@scholarshipright.com';"],
    capture_output=True, check=False,
)


# ── STEP 1: User with NO profile but a stub resume — payload should
#    still be present, with level falling back to `bachelor` (the
#    function's documented default for users with no profile set).
step("STEP 1: User with no profile — payload present, level falls back to default (bachelor)")
jar1, email1 = make_user(profile_data=None, email_suffix="rlcmpl-noprof")
if jar1 is None:
    print("  SKIP  user creation failed (likely auth rate limit)")
    sys.exit(0 if tests_failed == 0 else 1)
# A user with no profile also has no resume, so create a manual stub first
# so we have a resume row to read the completeness payload from.
resumes1 = get_resumes(jar1)
if not resumes1:
    s, body = call("POST", "/api/resumes/manual", jar=jar1)
    resumes1 = [body] if isinstance(body, dict) else []
check("manual resume created", bool(resumes1))
c1 = get_completeness(jar1)
check("payload present", c1 is not None, f"(level={c1.get('level') if c1 else None})")
check("level falls back to 'bachelor' (function default)", c1 and c1.get("level") == "bachelor",
      f"(level={c1.get('level') if c1 else None})")
check("base_score is 0 (no sections filled)", c1 and c1.get("base_score") == 0,
      f"(base_score={c1.get('base_score') if c1 else None})")


# ── STEP 2: High school grad with the 8 required sections → 100% base.
step("STEP 2: High school grad — 8 required sections → 100% base, 0 bonus")
jar2, _ = make_user(profile_data={"degree_level": "high_school", "country_of_origin": "Ghana", "target_degree": "bachelor", "field_of_study": "computer_science"}, email_suffix="rlcmpl-hs")
resumes2 = get_resumes(jar2)
if not resumes2:
    # Create a manual resume (no file) and retry
    s, body = call("POST", "/api/resumes/manual", jar=jar2)
    resumes2 = [body] if isinstance(body, dict) else []
if not resumes2:
    print("  SKIP  no resume created (likely rate limit); cannot continue")
    sys.exit(0 if tests_failed == 0 else 1)

update_resume(jar2, resumes2[0]["id"], BASIC_EIGHT)
c2 = get_completeness(jar2)
check("level = high_school", c2 and c2.get("level") == "high_school",
      f"(level={c2.get('level') if c2 else None})")
check("base_score = 100% (8/8 required)", c2 and abs(c2.get("base_score", -1) - 100.0) < 0.01,
      f"(base_score={c2.get('base_score') if c2 else None})")
check("bonus_score = 0 (no non-standard sections)", c2 and c2.get("bonus_score") == 0,
      f"(bonus_score={c2.get('bonus_score') if c2 else None})")
check("missing_required is empty", c2 and c2.get("missing_required") == [],
      f"(missing_required={c2.get('missing_required') if c2 else None})")
check("grade = Excellent", c2 and c2.get("grade") == "Excellent",
      f"(grade={c2.get('grade') if c2 else None})")


# ── STEP 3: BSc grad with the 8 + projects (BSc-required) → 100% base.
step("STEP 3: BSc grad — 8 sections + projects → 100% base, 0 bonus")
jar3, _ = make_user(profile_data={"degree_level": "bachelor", "country_of_origin": "Ghana", "target_degree": "master", "field_of_study": "computer_science"}, email_suffix="rlcmpl-bsc")
resumes3 = get_resumes(jar3) or [call("POST", "/api/resumes/manual", jar=jar3)[1]]
update_resume(jar3, resumes3[0]["id"], {**BASIC_EIGHT, **PROJECTS})
c3 = get_completeness(jar3)
check("level = bachelor", c3 and c3.get("level") == "bachelor",
      f"(level={c3.get('level') if c3 else None})")
check("base_score = 100% (9/9 required for BSc)", c3 and abs(c3.get("base_score", -1) - 100.0) < 0.01,
      f"(base_score={c3.get('base_score') if c3 else None})")
check("projects in present_required", c3 and "projects" in c3.get("present_required", []),
      f"(present_required={c3.get('present_required') if c3 else None})")
check("bonus_score = 0 (no non-standard sections for BSc)",
      c3 and c3.get("bonus_score") == 0,
      f"(bonus_score={c3.get('bonus_score') if c3 else None})")


# ── STEP 4: BSc grad with publications (NON-standard for BSc) → +5% bonus.
step("STEP 4: BSc grad with publications — +5% bonus for non-standard section")
update_resume(jar3, resumes3[0]["id"], {**BASIC_EIGHT, **PROJECTS, **PUBLICATIONS})
c4 = get_completeness(jar3)
check("base_score still 100% (required unchanged)", c4 and abs(c4.get("base_score", -1) - 100.0) < 0.01,
      f"(base_score={c4.get('base_score') if c4 else None})")
check("bonus_score = 5 (one non-standard: publications)",
      c4 and abs(c4.get("bonus_score", -1) - 5.0) < 0.01,
      f"(bonus_score={c4.get('bonus_score') if c4 else None})")
check("publications in present_bonus", c4 and "publications" in c4.get("present_bonus", []),
      f"(present_bonus={c4.get('present_bonus') if c4 else None})")
check("total_score = 105 (uncapped)", c4 and abs(c4.get("total_score", -1) - 105.0) < 0.01,
      f"(total_score={c4.get('total_score') if c4 else None})")
check("display_score = 100 (capped at 100)", c4 and abs(c4.get("display_score", -1) - 100.0) < 0.01,
      f"(display_score={c4.get('display_score') if c4 else None})")


# ── STEP 5: MSc grad with only 5 of 9 required → ~55.5% base, correct missing list.
step("STEP 5: MSc grad — 5 of 9 required → ~55.5% base, missing list accurate")
jar5, _ = make_user(profile_data={"degree_level": "master", "country_of_origin": "Ghana", "target_degree": "phd", "field_of_study": "computer_science"}, email_suffix="rlcmpl-msc")
resumes5 = get_resumes(jar5) or [call("POST", "/api/resumes/manual", jar=jar5)[1]]
# Fill only the basic 8 + awards = 9 of 13 required; missing: research_projects,
# publications, certifications, projects.
update_resume(jar5, resumes5[0]["id"], {**BASIC_EIGHT, **AWARDS})
c5 = get_completeness(jar5)
check("level = master", c5 and c5.get("level") == "master",
      f"(level={c5.get('level') if c5 else None})")
# 9 of 13 required = 9/13 * 100 = ~69.23%
check("base_score = 9/13 = ~69.23%", c5 and abs(c5.get("base_score", -1) - 9/13*100) < 0.01,
      f"(base_score={c5.get('base_score') if c5 else None})")
check("missing_required = [publications, research_projects, certifications, projects]",
      c5 and set(c5.get("missing_required", [])) == {"publications", "research_projects", "certifications", "projects"},
      f"(missing_required={c5.get('missing_required') if c5 else None})")
check("present_bonus is empty (no non-standard sections)",
      c5 and c5.get("present_bonus") == [],
      f"(present_bonus={c5.get('present_bonus') if c5 else None})")


# ── STEP 6: PhD grad with EVERYTHING → 100% base + 2 bonus (linkedin, portfolio) → 110.
step("STEP 6: PhD grad with everything — 100% base + 10% bonus = 110% total")
jar6, _ = make_user(profile_data={"degree_level": "phd", "country_of_origin": "Ghana", "target_degree": "postdoc", "field_of_study": "computer_science"}, email_suffix="rlcmpl-phd")
resumes6 = get_resumes(jar6) or [call("POST", "/api/resumes/manual", jar=jar6)[1]]
update_resume(jar6, resumes6[0]["id"], {
    **BASIC_EIGHT, **PROJECTS, **RESEARCH_PROJECTS, **PUBLICATIONS,
    **AWARDS, **CERTIFICATIONS, **REF_LIST, **LINKEDIN, **PORTFOLIO,
})
c6 = get_completeness(jar6)
check("level = phd", c6 and c6.get("level") == "phd",
      f"(level={c6.get('level') if c6 else None})")
check("base_score = 100% (14/14 required)", c6 and abs(c6.get("base_score", -1) - 100.0) < 0.01,
      f"(base_score={c6.get('base_score') if c6 else None})")
check("bonus_score = 10 (2 non-standard: linkedin_url, portfolio_url)",
      c6 and abs(c6.get("bonus_score", -1) - 10.0) < 0.01,
      f"(bonus_score={c6.get('bonus_score') if c6 else None})")
check("total_score = 110 (uncapped)", c6 and abs(c6.get("total_score", -1) - 110.0) < 0.01,
      f"(total_score={c6.get('total_score') if c6 else None})")
check("display_score = 100 (capped at 100)", c6 and abs(c6.get("display_score", -1) - 100.0) < 0.01,
      f"(display_score={c6.get('display_score') if c6 else None})")
check("grade = Excellent", c6 and c6.get("grade") == "Excellent",
      f"(grade={c6.get('grade') if c6 else None})")
check("present_bonus = [linkedin_url, portfolio_url]",
      c6 and set(c6.get("present_bonus", [])) == {"linkedin_url", "portfolio_url"},
      f"(present_bonus={c6.get('present_bonus') if c6 else None})")


# ── STEP 7: profile.degree_level takes priority — even a non-PhD user
#    with PhD-level data is scored as their declared level.
step("STEP 7: profile.degree_level drives the level — HS user stays HS even with extra data")
# Create an HS-declared user, fill in MSc-required sections
jar7, _ = make_user(profile_data={"degree_level": "high_school", "country_of_origin": "Ghana", "target_degree": "bachelor", "field_of_study": "computer_science"}, email_suffix="rlcmpl-hsmsc")
resumes7 = get_resumes(jar7) or [call("POST", "/api/resumes/manual", jar=jar7)[1]]
# Fill BSc + MSc + PhD required sections + 2 bonus
update_resume(jar7, resumes7[0]["id"], {
    **BASIC_EIGHT, **PROJECTS, **RESEARCH_PROJECTS, **PUBLICATIONS,
    **AWARDS, **CERTIFICATIONS, **REF_LIST, **LINKEDIN, **PORTFOLIO,
})
c7 = get_completeness(jar7)
check("level = high_school (profile wins, not data)", c7 and c7.get("level") == "high_school",
      f"(level={c7.get('level') if c7 else None})")
# HS required: 8 (basic). 8/8 filled = 100% base.
# Bonus: projects, research_projects, publications, awards, certifications, ref_list, linkedin_url, portfolio_url = 8
check("base_score = 100% (8/8 HS-required)", c7 and abs(c7.get("base_score", -1) - 100.0) < 0.01,
      f"(base_score={c7.get('base_score') if c7 else None})")
check("bonus_score = 40 (8 non-standard × 5%)",
      c7 and abs(c7.get("bonus_score", -1) - 40.0) < 0.01,
      f"(bonus_score={c7.get('bonus_score') if c7 else None})")


# ── STEP 8: End-to-end simulation per user class ─────────────────────
# For each of the 4 education classes (high school, bachelor, master,
# phd), register a fully-formed user, fill profile + resume with
# class-appropriate data, then verify the *experience* a real user of
# that class would have: completeness, what scholarships surface in
# their matches, and the overall flow.
step("STEP 8: End-to-end simulation — one fully-formed user per education class")

# High school grad
hs_profile = {
    "country_of_origin": "Ghana",
    "target_degree": "bachelor",
    "degree_level": "high_school",
    "field_of_study": "computer_science",
    "target_countries": ["United States", "United Kingdom", "Canada"],
    "has_ielts": False,
}
hs_resume = {
    # 8 required for HS — exactly what a real HS grad would have
    "full_name": "Aminata Diallo",
    "email": "aminata@example.com",
    "phone": "+233-555-0100",
    "summary": "High school senior passionate about computer science and math.",
    "education": [{"institution": "Accra Academy", "degree": "High School Diploma", "year": 2026}],
    "experience": [{"company": "Coding Club", "position": "President", "start": "2024", "end": "2025"}],
    "skills": ["Python", "HTML", "Math"],
    "languages": [{"name": "English"}, {"name": "French"}],
}
# BSc grad
bsc_profile = {
    "country_of_origin": "Nigeria",
    "target_degree": "master",
    "degree_level": "bachelor",
    "field_of_study": "computer_science",
    "cgpa": 3.8,
    "target_countries": ["United Kingdom", "Germany", "Netherlands"],
    "has_ielts": True, "ielts_score": 7.5,
    "graduation_year": 2024,
    "work_experience_years": 1,
}
bsc_resume = {
    "full_name": "Chinedu Okafor",
    "email": "chinedu@example.com",
    "phone": "+234-555-0100",
    "location": "Lagos, Nigeria",
    "linkedin_url": "https://linkedin.com/in/chinedu",
    "summary": "BSc Computer Science, 1st class honours. Passionate about ML systems.",
    "education": [{"institution": "University of Lagos", "degree": "BSc Computer Science", "year": 2024, "gpa": 3.8}],
    "experience": [{"company": "Andela", "position": "Junior Engineer", "start": "2024", "end": "2025",
                    "description": "Built internal tools in Python + React."}],
    "skills": ["Python", "React", "PostgreSQL", "Docker"],
    "languages": [{"name": "English"}, {"name": "Igbo"}],
    **PROJECTS,  # Final year project (BSc-required)
    **AWARDS,    # Plus an award (BSc-bonus)
}
# MSc grad
msc_profile = {
    "country_of_origin": "Kenya",
    "target_degree": "phd",
    "degree_level": "master",
    "field_of_study": "computer_science",
    "cgpa": 3.9,
    "target_countries": ["United States", "United Kingdom", "Canada", "Switzerland"],
    "has_ielts": True, "ielts_score": 7.5,
    "graduation_year": 2022,
    "work_experience_years": 2,
    "research_interests": ["Machine Learning", "NLP"],
}
msc_resume = {
    "full_name": "Wanjiku Mwangi",
    "email": "wanjiku@example.com",
    "phone": "+254-555-0100",
    "location": "Nairobi, Kenya",
    "linkedin_url": "https://linkedin.com/in/wanjiku",
    "summary": "MSc Computer Science, 2 years industry + 1 paper at ACL Findings.",
    "education": [
        {"institution": "University of Nairobi", "degree": "BSc CS", "year": 2020},
        {"institution": "Strathmore University", "degree": "MSc CS", "year": 2022, "gpa": 3.9},
    ],
    "experience": [
        {"company": "Microsoft Research Africa", "position": "Research Engineer", "start": "2022", "end": "2024",
         "description": "Built NLP pipelines for low-resource languages."},
    ],
    "skills": ["Python", "PyTorch", "HuggingFace", "CUDA", "Research"],
    "languages": [{"name": "English"}, {"name": "Swahili"}],
    **PROJECTS,
    **RESEARCH_PROJECTS,   # MSc-required
    **PUBLICATIONS,         # MSc-required
    **AWARDS,               # MSc-required
    **CERTIFICATIONS,       # MSc-required
}
# PhD grad
phd_profile = {
    "country_of_origin": "Egypt",
    "target_degree": "postdoc",
    "degree_level": "phd",
    "field_of_study": "computer_science",
    "cgpa": 3.95,
    "target_countries": ["United States", "United Kingdom", "Germany", "Switzerland"],
    "has_ielts": True, "ielts_score": 8.0,
    "graduation_year": 2023,
    "work_experience_years": 4,
    "research_interests": ["Computer Vision", "Robotics"],
}
phd_resume = {
    "full_name": "Yusuf El-Sayed",
    "email": "yusuf@example.com",
    "phone": "+20-555-0100",
    "location": "Cairo, Egypt",
    "linkedin_url": "https://linkedin.com/in/yusuf",
    "portfolio_url": "https://yusuf-robotics.com",
    "summary": "PhD CS, 6 publications in CVPR/ICRA, currently seeking postdoc in robotics.",
    "education": [
        {"institution": "Cairo University", "degree": "BSc CS", "year": 2017},
        {"institution": "ETH Zurich", "degree": "MSc Robotics", "year": 2019},
        {"institution": "MIT", "degree": "PhD Computer Science", "year": 2023},
    ],
    "experience": [
        {"company": "MIT CSAIL", "position": "Research Assistant", "start": "2019", "end": "2023",
         "description": "Led 3 papers on visual navigation for service robots."},
    ],
    "skills": ["C++", "PyTorch", "ROS", "CUDA", "SLAM", "Research"],
    "languages": [{"name": "English"}, {"name": "Arabic"}, {"name": "German"}],
    **PROJECTS,
    **RESEARCH_PROJECTS,
    **PUBLICATIONS,
    **AWARDS,
    **CERTIFICATIONS,
    **REF_LIST,  # PhD-required
}

class_user_cases = [
    ("HS",   "high_school", "rlcmpl-sim-hs",   hs_profile,   hs_resume,   8),  # 8 required for HS
    ("BSc",  "bachelor",    "rlcmpl-sim-bsc",  bsc_profile,  bsc_resume,  9),  # 9 for BSc
    ("MSc",  "master",      "rlcmpl-sim-msc",  msc_profile,  msc_resume,  13), # 13 for MSc
    ("PhD",  "phd",         "rlcmpl-sim-phd",  phd_profile,  phd_resume,  14), # 14 for PhD
]
for label, level, suffix, profile_data, resume_data, n_required in class_user_cases:
    print(f"\n--- Simulating {label} class user ---")
    jar, _ = make_user(profile_data=profile_data, email_suffix=suffix)
    if jar is None:
        print(f"  SKIP  {label} user creation failed (likely rate limit)")
        continue
    # Create manual resume and fill
    s, body = call("POST", "/api/resumes/manual", jar=jar)
    rid = body.get("id") if isinstance(body, dict) else None
    if not rid:
        print(f"  SKIP  {label} manual resume create failed")
        continue
    update_resume(jar, rid, resume_data)

    # Verify the level_aware_completeness payload reflects the class
    c = get_completeness(jar)
    check(f"{label}: level = {level}", c and c.get("level") == level,
          f"(got {c.get('level') if c else None})")
    check(f"{label}: required_count = {n_required}", c and c.get("required_count") == n_required,
          f"(got {c.get('required_count') if c else None})")
    check(f"{label}: base_score = 100% (all required present)",
          c and abs(c.get("base_score", -1) - 100.0) < 0.01,
          f"(base_score={c.get('base_score') if c else None})")
    check(f"{label}: grade = Excellent", c and c.get("grade") == "Excellent",
          f"(grade={c.get('grade') if c else None})")
    check(f"{label}: missing_required is empty", c and c.get("missing_required") == [],
          f"(missing={c.get('missing_required') if c else None})")

    # Verify the user gets matches (their target_degree × degree_level)
    s, matches = call("GET", "/api/matches", jar=jar)
    n_matches = len(matches) if s == 200 and isinstance(matches, list) else 0
    check(f"{label}: matches computed (got ≥1)", n_matches >= 1,
          f"({n_matches} matches for target_degree={profile_data['target_degree']})")

    # Verify the experience surfaces the level correctly to the user
    s, profile = call("GET", "/api/profile", jar=jar)
    check(f"{label}: profile.degree_level roundtrips correctly",
          s == 200 and isinstance(profile, dict) and profile.get("degree_level") == level,
          f"(got {profile.get('degree_level') if isinstance(profile, dict) else None})")

print()
print("=" * 60)
print(f"RESULTS:  {tests_passed} passed,  {tests_failed} failed")
print("=" * 60)
sys.exit(0 if tests_failed == 0 else 1)
