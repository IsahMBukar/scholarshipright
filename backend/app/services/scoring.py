"""
Deterministic CV/Resume scoring engine.
Calculates score 0-100 based on filled fields and data quality.
No AI prompt — pure backend logic, updates on every save.

Design principle: 1 well-filled entry should score 80%+ in any section.
Quantity bonuses are small (10-20%).
"""

import re


def _score_contact(resume: dict) -> tuple[int, int, list[str]]:
    """Score contact info (0-10)."""
    max_score = 10
    score = 0
    issues = []

    if resume.get("email"):
        score += 3
    else:
        issues.append("Missing email address")

    if resume.get("phone"):
        score += 3
    else:
        issues.append("Missing phone number")

    if resume.get("location"):
        score += 2

    if resume.get("linkedin_url"):
        score += 2
    else:
        issues.append("Add LinkedIn profile URL")

    return min(score, max_score), max_score, issues


def _score_summary(resume: dict) -> tuple[int, int, list[str]]:
    """Score professional summary (0-5)."""
    max_score = 5
    summary = resume.get("summary", "")

    if not summary:
        return 0, max_score, ["Missing professional summary"]

    score = 0
    issues = []

    # Length check
    words = len(summary.split())
    if words >= 30:
        score += 3
    elif words >= 15:
        score += 2
    else:
        score += 1
        issues.append("Summary is too short (aim for 30+ words)")

    # Keyword presence
    keywords = ["experience", "skilled", "passionate", "proficient", "expertise",
                 "background", "dedicated", "results-driven", "research", "developing"]
    found = sum(1 for kw in keywords if kw.lower() in summary.lower())
    if found >= 2:
        score += 2
    elif found >= 1:
        score += 1

    return min(score, max_score), max_score, issues


def _score_education(resume: dict) -> tuple[int, int, list[str]]:
    """Score education (0-15).
    
    Scoring: 1 complete entry = 13/15. 2+ entries = 15/15.
    """
    max_score = 15
    edu_list = resume.get("education", [])
    issues = []

    if not edu_list:
        return 0, max_score, ["No education listed"]

    score = 0

    # Has entries
    score += 2

    # Score first entry in detail (up to 11 points)
    edu = edu_list[0]
    if edu.get("degree"):
        score += 2
    else:
        issues.append("Education missing degree name")

    if edu.get("institution"):
        score += 2
    else:
        issues.append("Education missing institution name")

    if edu.get("start_date") or edu.get("date") or edu.get("end_date"):
        score += 2
    else:
        issues.append("Education missing dates")

    field = edu.get("field") or edu.get("field_of_study")
    if field:
        score += 2

    if edu.get("gpa") or edu.get("description"):
        score += 2

    # Small bonus for additional entries
    if len(edu_list) > 1:
        score += 1

    return min(score, max_score), max_score, issues


def _score_experience(resume: dict) -> tuple[int, int, list[str]]:
    """Score work experience (0-20).
    
    Scoring: 1 complete entry with achievements = 17/20. 2+ entries = 20/20.
    """
    max_score = 20
    exp_list = resume.get("experience", [])
    issues = []

    if not exp_list:
        return 0, max_score, ["No work experience listed"]

    score = 0

    # Has entries
    score += 2

    # Score ALL entries (up to 4), max 13 points from entries
    total_entry_score = 0
    for exp in exp_list[:4]:
        entry_score = 0

        if exp.get("position") or exp.get("title"):
            entry_score += 1
        if exp.get("company"):
            entry_score += 1
        if exp.get("start_date"):
            entry_score += 1
        if exp.get("end_date"):
            entry_score += 1

        desc = exp.get("description", "")
        if desc and len(desc) > 20:
            entry_score += 2

        achievements = exp.get("achievements", [])
        if achievements:
            entry_score += min(len(achievements), 3)

        total_entry_score += entry_score

    score += min(total_entry_score, 13)

    # Count bonus (small)
    if len(exp_list) >= 3:
        score += 2
    elif len(exp_list) >= 2:
        score += 1

    # Quantified results check (flexible regex)
    all_text = " ".join([
        (exp.get("description", "") or "") + " " + " ".join(exp.get("achievements", []) or [])
        for exp in exp_list
    ])
    # Matches: 30%, 5-person team, 10 users, improved by 20%, supervised 5-person, etc.
    quantified = re.findall(
        r'\d+[%+]|\d+[\w-]*\s*(?:users|customers|projects|team|employees|revenue|profit|efficiency|clients|members|people|stakeholders|processes|systems|applications|products|person)',
        all_text.lower()
    )
    impact_verbs = re.findall(
        r'(?:improved|reduced|increased|grew|decreased|boosted|cut|saved|generated|managed|supervised|led)\s+(?:\w+\s+){0,3}\d+',
        all_text.lower()
    )
    if quantified or impact_verbs:
        score += 3
    else:
        issues.append("Add quantified achievements (e.g., 'improved efficiency by 30%')")

    return min(score, max_score), max_score, issues


def _score_research(resume: dict) -> tuple[int, int, list[str]]:
    """Score research & projects (0-15).
    
    Scoring: 1 complete entry = 13/15. 2+ = 15/15.
    """
    max_score = 15
    rp_list = resume.get("research_projects", [])
    issues = []

    if not rp_list:
        return 0, max_score, ["No research or projects listed"]

    score = 0

    # Has entries
    score += 2

    # Score ALL entries (up to 3), max 11 from entries
    total_entry_score = 0
    for rp in rp_list[:3]:
        entry_score = 0

        if rp.get("title"):
            entry_score += 2
        desc = rp.get("description", "")
        if desc and len(desc) > 20:
            entry_score += 2
        if rp.get("technologies"):
            entry_score += 2
        if rp.get("outcomes"):
            entry_score += 1
        if rp.get("organization") or rp.get("role"):
            entry_score += 1

        total_entry_score += entry_score

    score += min(total_entry_score, 11)

    # Small bonus for multiple
    if len(rp_list) > 1:
        score += 1

    # Bonus for publications
    pubs = resume.get("publications", [])
    if pubs:
        score += 1

    return min(score, max_score), max_score, issues


def _score_skills(resume: dict) -> tuple[int, int, list[str]]:
    """Score skills (0-10).
    
    Scoring: 5+ skills with variety = 10/10.
    """
    max_score = 10
    skills = resume.get("skills", [])
    issues = []

    if not skills:
        return 0, max_score, ["No skills listed"]

    score = 0

    # Count (generous)
    if len(skills) >= 7:
        score += 4
    elif len(skills) >= 5:
        score += 3
    elif len(skills) >= 3:
        score += 2
    else:
        score += 1
        issues.append("Add more relevant skills (aim for 5+)")

    # Technical variety
    tech_keywords = [
        "python", "java", "javascript", "sql", "react", "node", "machine learning",
        "data", "ai", "ml", "nlp", "flask", "django", "aws", "docker", "git",
        "tensorflow", "pytorch", "c++", "go", "rust", "typescript", "angular",
        "vue", "kubernetes", "linux", "matlab", "r", "spark", "hadoop",
        "flutter", "swift", "kotlin", "php", "ruby", "scala", "perl",
        "keras", "scikit", "pandas", "numpy", "opencv", "transformers",
        "hugging", "llm", "deep learning", "computer vision", "distributed",
        "ocr", "seq2seq", "tesseract", "express",
    ]
    found = sum(1 for s in skills for kw in tech_keywords if kw.lower() in str(s).lower())
    if found >= 3:
        score += 3
    elif found >= 1:
        score += 2

    # Domain / soft skills
    soft_keywords = [
        "communication", "leadership", "teamwork", "problem-solving",
        "management", "analytical", "detail", "remote", "research",
        "writing", "presentation", "critical thinking", "project management",
        "systems", "translation", "speech", "nlp", "ocr",
    ]
    found_soft = sum(1 for s in skills for kw in soft_keywords if kw.lower() in str(s).lower())
    if found_soft >= 2:
        score += 3
    elif found_soft >= 1:
        score += 2

    return min(score, max_score), max_score, issues


def _score_certifications(resume: dict) -> tuple[int, int, list[str]]:
    """Score certifications (0-10).
    
    Scoring: 1 complete cert = 8/10. 2+ = 10/10.
    """
    max_score = 10
    certs = resume.get("certifications", [])
    issues = []

    if not certs:
        return 0, max_score, ["No certifications listed"]

    score = 0

    # Has entries
    score += 2

    # Score ALL certs (up to 3), max 6 from details
    total_detail = 0
    for cert in certs[:3]:
        detail = 0
        if cert.get("name"):
            detail += 2
        if cert.get("issuer"):
            detail += 1
        if cert.get("date"):
            detail += 1
        total_detail += detail

    score += min(total_detail, 6)

    # Small bonus for multiple
    if len(certs) > 1:
        score += 2

    return min(score, max_score), max_score, issues


def _score_publications(resume: dict) -> tuple[int, int, list[str]]:
    """Score publications (0-10).
    
    Scoring: 1 complete pub = 8/10. 2+ = 10/10.
    """
    max_score = 10
    pubs = resume.get("publications", [])
    issues = []

    if not pubs:
        return 0, max_score, []

    score = 0

    # Has entries
    score += 2

    # Score ALL pubs (up to 3), max 6 from details
    total_detail = 0
    for pub in pubs[:3]:
        detail = 0
        if pub.get("title"):
            detail += 2
        if pub.get("journal"):
            detail += 1
        if pub.get("doi"):
            detail += 1
        if pub.get("date"):
            detail += 0.5
        total_detail += detail

    score += min(int(total_detail), 6)

    # Small bonus for multiple
    if len(pubs) > 1:
        score += 2

    return min(score, max_score), max_score, issues


def _score_languages(resume: dict) -> tuple[int, int, list[str]]:
    """Score languages (0-5).
    
    Scoring: 2 langs with proficiency = 5/5.
    """
    max_score = 5
    langs = resume.get("languages", [])
    issues = []

    if not langs:
        return 0, max_score, ["No languages listed"]

    score = 0

    # Count
    if len(langs) >= 3:
        score += 3
    elif len(langs) >= 2:
        score += 2
    elif len(langs) >= 1:
        score += 1

    # Proficiency levels
    has_proficiency = any(
        lang.get("proficiency") or
        any(kw in str(lang).lower() for kw in ["fluent", "native", "intermediate", "beginner", "advanced", "proficient", "basic"])
        for lang in langs
    )
    if has_proficiency:
        score += 2

    return min(score, max_score), max_score, issues


def calculate_resume_score(resume: dict) -> dict:
    """
    Calculate deterministic resume score based on data completeness.
    Returns: { overall_score, section_scores, issues, total_score, total_max, grade }
    """
    sections = {
        "contact": _score_contact(resume),
        "summary": _score_summary(resume),
        "education": _score_education(resume),
        "experience": _score_experience(resume),
        "research_projects": _score_research(resume),
        "skills": _score_skills(resume),
        "certifications": _score_certifications(resume),
        "publications": _score_publications(resume),
        "languages": _score_languages(resume),
    }

    total_score = 0
    total_max = 0
    all_issues = []
    section_scores = {}

    for section, (score, max_score, issues) in sections.items():
        total_score += score
        total_max += max_score
        section_scores[section] = {
            "score": score,
            "max": max_score,
            "percentage": round((score / max_score * 100)) if max_score > 0 else 0
        }
        all_issues.extend(issues)

    # Normalize to 0-100
    overall = round((total_score / total_max) * 100) if total_max > 0 else 0

    return {
        "overall_score": overall,
        "total_score": total_score,
        "total_max": total_max,
        "section_scores": section_scores,
        "issues": all_issues,
        "grade": (
            "A+" if overall >= 90 else
            "A" if overall >= 80 else
            "B+" if overall >= 70 else
            "B" if overall >= 60 else
            "C" if overall >= 50 else
            "D" if overall >= 40 else
            "F"
        )
    }


# ─── Level-aware completeness scoring ──────────────────────────────────────
#
# The "calculate_resume_score" above treats every section the same — a
# high school graduate with no publications gets penalized equally to a
# PhD applicant with none. That's wrong: a high school grad isn't
# *supposed* to have publications, and a PhD applicant who doesn't is
# weak.
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
    """
    value = resume.get(section)
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
