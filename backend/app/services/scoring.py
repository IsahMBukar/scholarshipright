"""
Level-aware CV/Resume scoring engine.
Scores resume completeness relative to the user's education level.
No AI prompt — pure backend logic, updates on every save.
"""

import re


# ─── Level-aware completeness scoring ──────────────────────────────────────
#
# `calculate_level_aware_completeness` takes the user's CURRENT education
# level (from `profile.degree_level`) and splits the resume sections
# into **required** (must be present for this level) and **bonus**
# (non-required for this level, so their presence adds extra points).
#
# Required sections are weighted to sum to 100%. Each bonus section
# is worth +5% on top, UNCAPPED — a BSc with multiple publications
# genuinely is more complete than a BSc without, and the score
# reflects that.

# All resume sections that the model knows about.  Listed in the order
# they appear on the resume form.
ALL_RESUME_SECTIONS: tuple[str, ...] = (
    "full_name", "email", "phone", "location", "linkedin_url", "portfolio_url",
    "summary", "education", "experience", "skills", "languages",
    "projects", "research_projects", "publications",
    "awards", "certifications", "ref_list",
)

# Per-level requirements.  A "required" section is one that a
# competitive applicant at this level should always have.  A "bonus"
# section is non-standard for this level — its presence earns extra
# points.
LEVEL_REQUIREMENTS: dict[str, dict[str, object]] = {
    "high_school": {
        "label": "High school graduate",
        "required": [
            "full_name", "email", "phone", "summary",
            "education", "experience", "skills", "languages",
        ],
        "bonus": [
            "projects", "research_projects", "publications",
            "awards", "certifications", "linkedin_url",
            "portfolio_url", "ref_list",
        ],
        "hint": (
            "For a high school applicant, focus on a strong summary, "
            "clear contact details, and any extracurricular achievements. "
            "School projects, competitions, and volunteer work are a "
            "great bonus."
        ),
    },
    "bachelor": {
        "label": "BSc / Bachelor's",
        "required": [
            "full_name", "email", "phone", "summary",
            "education", "experience", "skills", "languages",
            "projects",
        ],
        "bonus": [
            "research_projects", "publications", "awards",
            "certifications", "linkedin_url", "portfolio_url", "ref_list",
        ],
        "hint": (
            "For a BSc applicant, a final-year project is required. Add "
            "your thesis, capstone, or side projects, plus any academic "
            "awards. Publications are uncommon at this level but a "
            "strong bonus."
        ),
    },
    "master": {
        "label": "MSc / Master's",
        "required": [
            "full_name", "email", "phone", "summary",
            "education", "experience", "skills", "languages",
            "projects", "research_projects", "publications",
            "awards", "certifications",
        ],
        "bonus": [
            "linkedin_url", "portfolio_url", "ref_list",
        ],
        "hint": (
            "For an MSc applicant, research projects and at least one "
            "publication are expected. Conferences, awards, and "
            "professional certifications significantly strengthen your "
            "profile."
        ),
    },
    "phd": {
        "label": "PhD / Doctorate",
        "required": [
            "full_name", "email", "phone", "summary",
            "education", "experience", "skills", "languages",
            "projects", "research_projects", "publications",
            "awards", "certifications", "ref_list",
        ],
        "bonus": [
            "linkedin_url", "portfolio_url",
        ],
        "hint": (
            "For a PhD applicant, a strong publication record and "
            "references are required. Aim for multiple peer-reviewed "
            "papers, active research collaborations, and named referees."
        ),
    },
}

# If the user's profile doesn't tell us their level, we fall back to
# "bachelor" — the most common case.
DEFAULT_LEVEL = "bachelor"

# Each bonus section is worth this many percentage points (uncapped).
BONUS_POINTS_PER_SECTION = 5.0


def _is_section_present(resume: dict, section: str) -> bool:
    """True iff the given section is meaningfully filled.

    - For scalar / text fields: truthy and non-empty after stripping
    - For JSONB list fields (`education`, `experience`, `projects`, …):
      at least one entry
    - For `skills` (ARRAY of strings): at least one entry

    Special case: `projects` is also satisfied when `research_projects`
    has entries, because the resume analyzer puts all project types
    (personal, software, capstone, research) into `research_projects`.
    """
    value = resume.get(section)

    # Special case: projects can be satisfied by research_projects
    if section == "projects" and not value:
        rp = resume.get("research_projects")
        if isinstance(rp, (list, tuple)) and len(rp) > 0:
            return True

    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, tuple)):
        return len(value) > 0
    if isinstance(value, dict):
        return len(value) > 0
    return bool(value)


def calculate_level_aware_completeness(
    resume: dict,
    degree_level: str | None = None,
) -> dict:
    """Score a resume relative to the user's current education level.

    Parameters
    ----------
    resume
        A dict-shaped resume (or ORM model with `__dict__`) that
        exposes the standard resume sections as top-level keys.
    degree_level
        One of `"high_school"`, `"bachelor"`, `"master"`, `"phd"`,
        or `None` (defaults to `bachelor`).

    Returns
    -------
    dict with the following keys:

    - `level`: the normalised level used for scoring
    - `level_label`: human-readable label of the level
    - `base_score`: 0-100, the percentage of required sections present
      (each required section weighted equally)
    - `bonus_score`: float, sum of bonus points (5 per bonus section)
    - `total_score`: `base_score + bonus_score` (uncapped — can exceed 100)
    - `display_score`: `min(total_score, 100)` for the headline number
    - `grade`: "Excellent" / "Strong" / "Fair" / "Incomplete" based on
      `display_score`
    - `present_required`: list of required sections that are filled
    - `missing_required`: list of required sections that are empty
    - `present_bonus`: list of bonus sections that are filled
    - `present_bonus_count`: int
    - `required_count`: total number of required sections
    - `hint`: a per-level coaching hint string
    """
    # Normalise the level (fall back to the most permissive default)
    level = (degree_level or "").lower().strip()
    if level not in LEVEL_REQUIREMENTS:
        level = DEFAULT_LEVEL
    cfg = LEVEL_REQUIREMENTS[level]
    required: list[str] = list(cfg["required"])  # type: ignore[arg-type]
    bonus: list[str] = list(cfg["bonus"])  # type: ignore[arg-type]

    # Score the required sections (equal-weight to sum to 100%)
    present_required = [s for s in required if _is_section_present(resume, s)]
    missing_required = [s for s in required if s not in present_required]
    per_section = 100.0 / len(required) if required else 0.0
    base_score = round(per_section * len(present_required), 2)

    # Score the bonus sections (+5 each, uncapped)
    present_bonus = [s for s in bonus if _is_section_present(resume, s)]
    bonus_score = round(BONUS_POINTS_PER_SECTION * len(present_bonus), 2)

    total_score = round(base_score + bonus_score, 2)
    display_score = min(total_score, 100.0)

    if display_score >= 90:
        grade = "Excellent"
    elif display_score >= 75:
        grade = "Strong"
    elif display_score >= 50:
        grade = "Fair"
    else:
        grade = "Incomplete"

    return {
        "level": level,
        "level_label": cfg["label"],
        "base_score": base_score,
        "bonus_score": bonus_score,
        "total_score": total_score,
        "display_score": display_score,
        "grade": grade,
        "present_required": present_required,
        "missing_required": missing_required,
        "present_bonus": present_bonus,
        "present_bonus_count": len(present_bonus),
        "required_count": len(required),
        "hint": cfg["hint"],
    }


# ─── Deterministic issue highlighting ──────────────────────────────────────
#
# Unlike the LLM analyzer (which comments on style/impact in free text),
# these rules run on the resume STRUCTURE and are guaranteed to fire for
# every resume, uploaded or hand-built. Every issue is one of three
# severity classes, matching the frontend `SEVERITY_CONFIG`:
#
#   urgent — blocks the application from being evaluated
#            (no name, no usable email, malformed email)
#   severe — a REQUIRED section at the user's degree level is missing,
#            or a filled section is structurally broken (no dates,
#            no institution/company, ...)
#   likely — a BONUS section is missing, or the section exists but is
#            too thin to compete (short summary, sparse skills, ...)
#
# The engine is intentionally conservative: only empty/malformed data
# triggers a rule, never opinions about quality of prose.

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Human-readable names for every section (used in issue messages).
SECTION_LABELS: dict[str, str] = {
    "full_name": "full name",
    "email": "email address",
    "phone": "phone number",
    "location": "location",
    "summary": "professional summary",
    "education": "education history",
    "experience": "work experience",
    "skills": "skills",
    "languages": "languages",
    "projects": "projects",
    "research_projects": "research projects",
    "publications": "publications",
    "awards": "awards",
    "certifications": "certifications",
    "ref_list": "references",
    "linkedin_url": "LinkedIn profile",
    "portfolio_url": "portfolio link",
}

# Sections whose presence is a STRUCTURAL requirement at every level.
# Missing these is always urgent (a reviewer cannot act on the resume).
IDENTITY_REQUIRED = ("full_name", "email")


def _issue(field: str, severity: str, message: str, suggestion: str | None = None) -> dict:
    return {
        "field": field,
        "severity": severity,
        "message": message,
        "suggestion": suggestion,
    }


def _section_has_dates(entries: list) -> bool:
    """True iff every entry carries at least one usable date field."""
    for e in entries if isinstance(entries, list) else []:
        if not isinstance(e, dict):
            continue
        if not any(str(e.get(k) or "").strip() for k in ("start_date", "end_date", "date")):
            return False
    return True


def _edate(entry: dict) -> str:
    """Best available graduation/completion date for an entry."""
    for k in ("end_date", "date", "start_date"):
        v = str(entry.get(k) or "").strip()
        if v:
            return v
    return ""


def generate_deterministic_issues(
    resume: dict,
    degree_level: str | None = None,
) -> list[dict]:
    """Rule-based resume issues in three severity classes (urgent/severe/likely).

    Level-aware: a section missing at a level where it is REQUIRED is
    severe, while the same section missing where it is only BONUS is
    likely. Identity/contact fields (full_name, email) are urgent at
    every level.
    """
    level = (degree_level or "").lower().strip()
    if level not in LEVEL_REQUIREMENTS:
        level = DEFAULT_LEVEL
    cfg = LEVEL_REQUIREMENTS[level]
    required: list[str] = [c for c in cfg["required"] if isinstance(c, str) and c not in IDENTITY_REQUIRED]  # type: ignore[union-attr]
    bonus: list[str] = [c for c in cfg["bonus"] if isinstance(c, str)]  # type: ignore[union-attr]

    issues: list[dict] = []

    def present(section: str) -> bool:
        return _is_section_present(resume, section)

    # ── URGENT: identity & contactability ─────────────────────────────
    if not present("full_name"):
        issues.append(_issue(
            "full_name", "urgent",
            "Full name is missing — reviewers can't tell who this resume belongs to.",
            "Add your full legal name, exactly as it appears on your passport.",
        ))
    email = str(resume.get("email") or "").strip()
    if not email:
        issues.append(_issue(
            "email", "urgent",
            "Email address is missing — scholarship offices can't contact you.",
            "Add the email address you check most often.",
        ))
    elif not EMAIL_RE.match(email):
        issues.append(_issue(
            "email", "urgent",
            f"Email address '{email}' looks invalid.",
            "Check for typos — it should look like name@domain.com.",
        ))

    # ── SEVERE: missing required sections at this level ───────────────
    for section in required:
        if present(section):
            continue
        label = SECTION_LABELS.get(section, section.replace("_", " "))
        issues.append(_issue(
            section, "severe",
            f"Missing {label}.",
            f"Add {label} in the editor — it's expected for a {cfg['label']} application.",
        ))

    # ── SEVERE: filled sections with broken structure ─────────────────
    education = resume.get("education") or []
    experience = resume.get("experience") or []
    research = resume.get("research_projects") or []

    if education and not _section_has_dates(education):
        issues.append(_issue(
            "education.dates", "severe",
            "An education entry is missing its dates — reviewers need a timeline.",
            "Add a start and end (or expected graduation) date for every entry.",
        ))
    for entry in education:
        if not isinstance(entry, dict):
            continue
        if not str(entry.get("institution") or "").strip():
            issues.append(_issue(
                "education.institution", "severe",
                "An education entry is missing its institution.",
                "Add the university/school name to every education entry.",
            ))
            break
    for entry in education:
        if not isinstance(entry, dict):
            continue
        if not str(entry.get("degree") or "").strip() and not str(entry.get("field") or "").strip():
            issues.append(_issue(
                "education.degree", "severe",
                "An education entry is missing its degree and field of study.",
                "Add the degree name (e.g. BSc Computer Science).",
            ))
            break

    if experience:
        for entry in experience:
            if not isinstance(entry, dict):
                continue
            if not str(entry.get("company") or "").strip():
                issues.append(_issue(
                    "experience.company", "severe",
                    "A work experience entry is missing its employer.",
                    "Add the company or organization name to every entry.",
                ))
                break
        for entry in experience:
            if not isinstance(entry, dict):
                continue
            if not (str(entry.get("position") or "").strip() or str(entry.get("title") or "").strip()):
                issues.append(_issue(
                    "experience.position", "severe",
                    "A work experience entry is missing the job title.",
                    "Add the position you held at each company.",
                ))
                break
        if not _section_has_dates(experience):
            issues.append(_issue(
                "experience.dates", "severe",
                "A work experience entry is missing its dates.",
                "Add a start and end date (or 'Present') for every job.",
            ))

    if research and not _section_has_dates(research):
        issues.append(_issue(
            "research_projects.dates", "severe",
            "A project is missing its dates.",
            "Add a start and end date for every research project.",
        ))

    # ── LIKELY: missing bonus sections at this level ──────────────────
    for section in bonus:
        if present(section):
            continue
        label = SECTION_LABELS.get(section, section.replace("_", " "))
        issues.append(_issue(
            section, "likely",
            f"No {label} listed.",
            f"Add your {label} — not required at your level, but it makes the application more competitive.",
        ))

    # ── LIKELY: thin but existing sections ────────────────────────────
    summary = str(resume.get("summary") or "").strip()
    if summary and len(summary) < 120:
        issues.append(_issue(
            "summary", "likely",
            "Your summary is very short.",
            "Expand it to 2–3 sentences: who you are, what you want to study, and why.",
        ))

    skills = resume.get("skills") or []
    if isinstance(skills, (list, tuple)) and skills and len(skills) < 3:
        issues.append(_issue(
            "skills", "likely",
            f"Only {len(skills)} skills listed.",
            "Add 5–8 relevant skills — committees and reviewers filter by keywords.",
        ))

    if experience:
        thin = [
            e for e in experience if isinstance(e, dict)
            and not str(e.get("description") or "").strip()
            and not e.get("achievements")
        ]
        if thin:
            issues.append(_issue(
                "experience.description", "likely",
                "Some work experience entries have no bullet points.",
                "Add 2–3 achievements per role, starting with strong action verbs.",
            ))

    return issues
