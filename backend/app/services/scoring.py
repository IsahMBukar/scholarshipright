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
