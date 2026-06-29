"""
Smart scholarship match scoring algorithm.

The score combines broad semantic similarity with explicit eligibility, scholarship
requirements, and resume evidence.  The goal is not just "does the profile text
sound similar?"; it should answer:

1. Is the user eligible? (degree, nationality, field, requirements)
2. Does the resume prove they are competitive? (education, skills, research,
   publications, projects, work experience, languages)
3. Does the opportunity fit their preferences? (target country/start date/cost)

Returned breakdown values are intentionally transparent so Scholara can explain
WHY a match is high/low in tool results and UI cards.
"""

from __future__ import annotations

import re
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any

from app.services.embeddings import cosine_similarity


# Sibling field mappings (fields that are related)
FIELD_SIBLINGS = {
    "computer_science": ["engineering", "mathematics", "data_science", "artificial_intelligence"],
    "engineering": ["computer_science", "natural_sciences", "mathematics"],
    "medicine": ["public_health", "biology", "natural_sciences"],
    "business": ["economics", "management", "finance"],
    "law": ["political_science", "social_sciences"],
    "natural_sciences": ["physics", "chemistry", "biology", "mathematics", "engineering"],
    "social_sciences": ["law", "political_science", "economics", "education"],
    "public_health": ["medicine", "biology", "agriculture"],
    "economics": ["business", "social_sciences", "mathematics"],
    "mathematics": ["computer_science", "physics", "engineering", "economics"],
    "physics": ["mathematics", "natural_sciences", "engineering"],
    "chemistry": ["natural_sciences", "biology", "medicine"],
    "biology": ["natural_sciences", "medicine", "public_health", "agriculture"],
    "agriculture": ["public_health", "biology", "environment"],
    "data_science": ["computer_science", "mathematics", "artificial_intelligence", "statistics"],
    "artificial_intelligence": ["computer_science", "data_science", "mathematics", "engineering"],
}

DEGREE_ORDER = {
    "certificate": 0,
    "diploma": 1,
    "associate": 2,
    "bachelor": 3,
    "undergraduate": 3,
    "masters": 4,
    "master": 4,
    "msc": 4,
    "ma": 4,
    "mba": 4,
    "phd": 5,
    "doctoral": 5,
    "doctorate": 5,
    "postdoc": 6,
    "postdoctoral": 6,
}

STOPWORDS = {
    "the", "and", "for", "with", "that", "this", "from", "your", "you", "are", "will",
    "scholarship", "program", "programme", "students", "student", "study", "studies",
    "degree", "university", "apply", "application", "eligible", "eligibility", "required",
    "requirements", "country", "countries", "field", "fields", "funding", "tuition",
}


# ── Normalization helpers ─────────────────────────────────────────

def _as_list(value: Any) -> list[Any]:
    if not value:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    if isinstance(value, set):
        return list(value)
    return [value]


def _norm(value: Any) -> str:
    return str(value or "").strip().lower().replace("-", "_").replace(" ", "_")


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (list, tuple, set)):
        return " ".join(_clean_text(v) for v in value)
    if isinstance(value, dict):
        return " ".join(_clean_text(v) for v in value.values())
    return str(value)


def _tokens(text: str) -> set[str]:
    words = re.findall(r"[a-zA-Z][a-zA-Z0-9+#.\-]{2,}", (text or "").lower())
    return {w.strip(".-_") for w in words if w not in STOPWORDS and len(w) >= 3}


def _to_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(Decimal(str(value)))
    except (InvalidOperation, ValueError, TypeError):
        return None


def _date_from(value: Any) -> date | None:
    if not value:
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value))
    except ValueError:
        return None


def _degree_rank(value: str | None) -> int | None:
    text = _norm(value)
    if not text:
        return None
    for key, rank in DEGREE_ORDER.items():
        if key in text:
            return rank
    return None


def _resume_text(resume: Any) -> str:
    if not resume:
        return ""
    parts = [
        getattr(resume, "summary", None),
        getattr(resume, "raw_text", None),
        getattr(resume, "skills", None),
        getattr(resume, "education", None),
        getattr(resume, "experience", None),
        getattr(resume, "research_projects", None),
        getattr(resume, "projects", None),
        getattr(resume, "certifications", None),
        getattr(resume, "publications", None),
        getattr(resume, "awards", None),
    ]
    return _clean_text(parts)


def _scholarship_text(scholarship: Any) -> str:
    parts = [
        getattr(scholarship, "name", None),
        getattr(scholarship, "provider", None),
        getattr(scholarship, "host_institution", None),
        getattr(scholarship, "description", None),
        getattr(scholarship, "benefits_summary", None),
        getattr(scholarship, "how_to_apply", None),
        getattr(scholarship, "fields_of_study", None),
        getattr(scholarship, "degree_levels", None),
    ]
    return _clean_text(parts)


# ── Existing eligibility signals, now more nuanced ────────────────

def field_match_score(user_fields: list[str], scholarship_fields: list[str]) -> float:
    """Score field match: +15 exact/all-fields, +11 sibling, +6 text partial, 0 none."""
    if not user_fields or not scholarship_fields:
        return 0

    sch_norm = {_norm(f) for f in scholarship_fields}
    if "all_fields" in sch_norm or "all" in sch_norm or "any_field" in sch_norm:
        return 15

    user_norm = {_norm(f) for f in user_fields}
    if user_norm & sch_norm:
        return 15

    for uf in user_norm:
        siblings = {_norm(s) for s in FIELD_SIBLINGS.get(uf, [])}
        if siblings & sch_norm:
            return 11

    # Catch loose forms like "computer science" vs "computing" or "AI".
    user_tokens = _tokens(" ".join(user_fields).replace("_", " "))
    sch_tokens = _tokens(" ".join(scholarship_fields).replace("_", " "))
    if user_tokens & sch_tokens:
        return 6

    return 0


def country_eligibility_score(user_country: str, eligible_nationalities: list[str]) -> float:
    """Score country eligibility: +10 eligible/unknown-open, -25 clear hard fail."""
    if not eligible_nationalities:
        return 6  # no restriction found; don't punish missing scraped data
    if not user_country:
        return 0

    user_lower = user_country.lower()
    for nat in eligible_nationalities:
        nat_lower = nat.lower()
        if any(term in nat_lower for term in ["all", "any nationality", "international", "worldwide"]):
            return 10
        if user_lower in nat_lower:
            return 10
        if "africa" in nat_lower and _is_african(user_country):
            return 10
        if "developing" in nat_lower and _is_developing(user_country):
            return 10

    return -25  # clear hard fail


def degree_match_score(user_target: str, scholarship_degrees: list[str]) -> float:
    """Score degree match: +12 exact, +7 adjacent/umbrella, -25 clear hard fail."""
    if not scholarship_degrees:
        return 4
    if not user_target:
        return 0

    target = _norm(user_target)
    degree_norms = [_norm(d) for d in scholarship_degrees]
    if target in degree_norms or any(target in d or d in target for d in degree_norms):
        return 12

    target_rank = _degree_rank(user_target)
    sch_ranks = [_degree_rank(d) for d in scholarship_degrees]
    sch_ranks = [r for r in sch_ranks if r is not None]
    if target_rank is not None and sch_ranks:
        if target_rank in sch_ranks:
            return 12
        if any(abs(target_rank - r) == 1 for r in sch_ranks):
            return 7
        return -25

    return 0


def start_date_score(user_target_date: Any, program_start_date: Any) -> float:
    """Score if start date is within user's window."""
    user_date = _date_from(user_target_date)
    program_date = _date_from(program_start_date)
    if not user_date or not program_date:
        return 0

    diff = abs((program_date - user_date).days)
    if diff <= 180:
        return 4
    if diff <= 365:
        return 2
    return 0


def no_ielts_bonus(user_has_ielts: bool, user_ielts_score: Any, scholarship_requires_ielts: bool, min_ielts_score: Any) -> float:
    """Legacy English-requirement scoring, kept for direct callers/tests.

    New code should call `english_test_score(profile, scholarship)` instead
    so the `prior_studies_in_english` waiver and the `accepted_english_tests`
    list are honored.
    """
    min_score = _to_float(min_ielts_score)
    user_score = _to_float(user_ielts_score)

    if not scholarship_requires_ielts:
        return 6
    if user_has_ielts and min_score is not None and user_score is not None:
        return 8 if user_score >= min_score else -8
    if user_has_ielts:
        return 6
    return -8


def english_test_score(profile: Any, scholarship: Any) -> float:
    """Score the English-language test requirement.

    Replaces `no_ielts_bonus`. Considers THREE signals:

    1. `scholarship.requires_ielts` (legacy boolean) OR
       `scholarship.accepted_english_tests` (new list, auto-derived from
       host country when empty). The requirement is "any test from this
       list" — no test is needed if both are empty.
    2. `profile.has_ielts` + `profile.ielts_score` (user's actual test).
    3. `profile.prior_studies_in_english` (waiver signal — user attests
       that their prior degree was taught in English). Most universities
       accept a Medium-of-Instruction letter as proof of proficiency, so
       this grants partial or full credit depending on context.

    Score ranges from -8 (hard fail) to +8 (full credit).

    Decision table:
      | requires_any | has_ielts | in_accepted | prior_eng | score | why                              |
      | ------------ | --------- | ----------- | --------- | ----- | -------------------------------- |
      | False        | *         | *           | *         |  +6   | no English test required         |
      | True         | True      | True/None   | *         |  +8   | has accepted test, ≥ min (or n/a) |
      | True         | True      | True/None   | *         |  -8   | has accepted test, < min         |
      | True         | True      | False       | True      |  +4   | wrong test, but prior English    |
      | True         | True      | False       | False     |  -8   | wrong test, no fallback          |
      | True         | False     | *           | True      |  +5   | no test, prior English (waiver)  |
      | True         | False     | *           | False     |  -8   | no test, no fallback             |
    """
    accepted_raw = getattr(scholarship, "accepted_english_tests", None) or []
    accepted = {str(t).upper() for t in accepted_raw}
    requires_ielts = bool(getattr(scholarship, "requires_ielts", False))
    requires_any = requires_ielts or bool(accepted)

    if not requires_any:
        # No English test required — small reward (encourages filling profile)
        return 6

    user_has_ielts = bool(getattr(profile, "has_ielts", False))
    user_score = _to_float(getattr(profile, "ielts_score", None))
    min_score = _to_float(getattr(scholarship, "min_ielts_score", None))
    prior_english = bool(getattr(profile, "prior_studies_in_english", False))

    # Case: user has IELTS
    if user_has_ielts:
        # If the scholarship has an explicit accepted list and IELTS isn't
        # on it (e.g. wants TOEFL), the user's IELTS doesn't count on its
        # own — but prior English study gives a partial waiver.
        if accepted and "IELTS" not in accepted:
            return 4 if prior_english else -8

        # IELTS is accepted (or no specific list). Apply standard scoring.
        if min_score is not None and user_score is not None:
            return 8 if user_score >= min_score else -8
        return 6

    # Case: user has no IELTS. Prior English study acts as a full waiver.
    if prior_english:
        return 5

    # No test, no waiver, requirement active → hard fail.
    return -8


def fee_penalty(requires_fee: bool) -> float:
    """Small cost signal: no fee helps, fee hurts."""
    return -5 if requires_fee else 3


# ── New resume-aware and requirement-aware signals ────────────────

def academic_requirement_score(profile: Any, resume: Any, scholarship: Any) -> float:
    """Score CGPA/min academic requirement using profile first, then resume education text."""
    min_cgpa = _to_float(getattr(scholarship, "min_cgpa", None))
    user_cgpa = _to_float(getattr(profile, "cgpa", None))
    if min_cgpa is None:
        # No explicit minimum; give credit for having education data.
        if getattr(profile, "degree_level", None) or (resume and getattr(resume, "education", None)):
            return 8
        return 3

    if user_cgpa is not None:
        scale = _to_float(getattr(profile, "cgpa_scale", None)) or 4.0
        normalized = user_cgpa
        # Normalize common 5.0 scale to 4.0 if scholarship minimum looks 4-scale.
        if scale and scale > 4.1 and min_cgpa <= 4.0:
            normalized = (user_cgpa / scale) * 4.0
        if normalized >= min_cgpa:
            return 10
        if normalized >= (min_cgpa - 0.25):
            return 5
        return -12

    # If no numeric CGPA, degree class can still prove academic strength.
    degree_class = _clean_text(getattr(profile, "degree_class", "")).lower()
    if any(term in degree_class for term in ["first", "distinction", "excellent", "a", "upper"]):
        return 7

    return -3


def resume_keyword_score(resume: Any, scholarship: Any, profile: Any) -> tuple[float, dict[str, Any]]:
    """Compare resume evidence against scholarship description/field requirement keywords."""
    if not resume:
        return 0, {"overlap": [], "coverage": 0, "message": "No resume available"}

    resume_tokens = _tokens(_resume_text(resume))
    required_text = _scholarship_text(scholarship)
    sch_tokens = _tokens(required_text)

    # Give explicit fields/provider words extra weight because scraped descriptions are noisy.
    field_tokens = _tokens(_clean_text(getattr(scholarship, "fields_of_study", [])).replace("_", " "))
    target_tokens = _tokens(_clean_text(getattr(profile, "target_fields", [])).replace("_", " "))
    important = (sch_tokens | field_tokens | target_tokens) - STOPWORDS

    if not important:
        return 4, {"overlap": [], "coverage": 0, "message": "Not enough scholarship keywords"}

    overlap = sorted(resume_tokens & important)
    coverage = min(1.0, len(overlap) / max(4, min(len(important), 18)))
    score = round(coverage * 12, 2)

    # Direct field evidence bonus: if resume skills/projects mention scholarship fields.
    if resume_tokens & field_tokens:
        score = min(12, score + 3)

    return score, {"overlap": overlap[:12], "coverage": round(coverage, 2)}


def research_experience_score(profile: Any, resume: Any, scholarship: Any) -> tuple[float, dict[str, Any]]:
    """Score research/projects/publications/work evidence relevant to competitive scholarships."""
    profile_years = getattr(profile, "work_experience_years", None) or 0
    research_projects = _as_list(getattr(resume, "research_projects", None) if resume else [])
    projects = _as_list(getattr(resume, "projects", None) if resume else [])
    publications = _as_list(getattr(resume, "publications", None) if resume else [])
    experience = _as_list(getattr(resume, "experience", None) if resume else [])
    awards = _as_list(getattr(resume, "awards", None) if resume else [])

    text = _scholarship_text(scholarship).lower()
    scholarship_degree_ranks = [
        rank for rank in (_degree_rank(d) for d in _as_list(getattr(scholarship, "degree_levels", [])))
        if rank is not None
    ]
    is_research_or_grad = any(
        term in text for term in ["research", "phd", "doctoral", "thesis", "publication", "master", "graduate"]
    ) or any(rank >= 4 for rank in scholarship_degree_ranks)

    score = 0.0
    reasons: list[str] = []

    if research_projects or projects:
        score += 4
        reasons.append("projects/research")
    if publications:
        score += 3
        reasons.append("publications")
    if experience or profile_years:
        score += 2 if profile_years and profile_years >= 2 else 1.5
        reasons.append("work experience")
    if awards:
        score += 1.5
        reasons.append("awards")

    if is_research_or_grad and (research_projects or publications):
        score += 2
        reasons.append("research-fit bonus")

    return min(10, round(score, 2)), {"signals": reasons, "research_or_grad_program": is_research_or_grad}


def funding_fit_score(scholarship: Any) -> float:
    score = 0.0
    if getattr(scholarship, "covers_tuition", False):
        score += 2
    if getattr(scholarship, "covers_living", False):
        score += 2
    if getattr(scholarship, "covers_flight", False):
        score += 1
    if getattr(scholarship, "covers_health", False):
        score += 1
    if _norm(getattr(scholarship, "funding_type", "")) in {"full", "fully_funded", "full_funding"}:
        score += 2
    return min(6, score)


def target_country_score(profile: Any, scholarship: Any) -> float:
    targets = {_norm(c) for c in _as_list(getattr(profile, "target_countries", []))}
    host = _norm(getattr(scholarship, "host_country", ""))
    if not targets or not host:
        return 0
    return 4 if host in targets else 0


# ── Main API ──────────────────────────────────────────────────────

def compute_match_score(profile: Any, scholarship: Any, resume: Any = None) -> dict:
    """
    Compute match score between a user profile/resume and scholarship.

    Returns: {"score": float, "breakdown": {...}}
    """
    semantic = 0.0
    if getattr(profile, "embedding", None) is not None and getattr(scholarship, "embedding", None) is not None:
        semantic = max(0.0, cosine_similarity(profile.embedding, scholarship.embedding)) * 30

    keyword_score, keyword_details = resume_keyword_score(resume, scholarship, profile)
    research_score, research_details = research_experience_score(profile, resume, scholarship)

    bonuses = {
        "semantic": round(semantic, 2),
        "field": field_match_score(
            _as_list(getattr(profile, "target_fields", None)) or _as_list(getattr(profile, "field_of_study", None)),
            _as_list(getattr(scholarship, "fields_of_study", None)),
        ),
        # Country eligibility is now a boolean gate (passes_country_gate)
        # evaluated BEFORE compute_match_score. Scholarships that fail the
        # gate are skipped entirely and never reach this function. This 0
        # is a placeholder for breakdown compatibility.
        "country": 0,
        "degree": degree_match_score(
            getattr(profile, "target_degree", "") or getattr(profile, "degree_level", "") or "",
            _as_list(getattr(scholarship, "degree_levels", None)),
        ),
        "academic": academic_requirement_score(profile, resume, scholarship),
        "language": english_test_score(profile, scholarship),
        "resume_keywords": keyword_score,
        "research_experience": research_score,
        "funding_fit": funding_fit_score(scholarship),
        "target_country": target_country_score(profile, scholarship),
        "start_date": start_date_score(
            getattr(profile, "target_start_date", None),
            getattr(scholarship, "program_start_date", None),
        ),
        "fee": fee_penalty(bool(getattr(scholarship, "requires_application_fee", False))),
    }

    total = sum(v for v in bonuses.values() if isinstance(v, (int, float)))

    # Hard flags — country gate is no longer here (it's a pass/fail gate
    # in match_auto before this function is called).
    hard_flags = []
    if bonuses["degree"] <= -25:
        hard_flags.append("degree_level_mismatch")
    if bonuses["academic"] <= -12:
        hard_flags.append("below_min_cgpa")
    if bonuses["language"] <= -8:
        hard_flags.append("ielts_requirement_not_met")

    score = min(100, max(0, total))
    if hard_flags:
        score = min(score, 59)  # likely not eligible; show as weak match even if semantically close

    return {
        "score": round(score, 2),
        "breakdown": {
            **{k: round(v, 2) if isinstance(v, float) else v for k, v in bonuses.items()},
            "resume_keyword_details": keyword_details,
            "research_experience_details": research_details,
            "hard_flags": hard_flags,
            "scoring_version": "country_gate_v1",
        },
    }


# ── Country helpers ───────────────────────────────────────────────

def _is_african(country: str) -> bool:
    african_countries = {
        "nigeria", "ghana", "kenya", "south africa", "ethiopia", "tanzania",
        "uganda", "egypt", "morocco", "senegal", "cameroon", "rwanda",
        "ivory coast", "democratic republic of congo", "mozambique", "angola",
        "madagascar", "zimbabwe", "zambia", "malawi", "botswana", "namibia",
        "lesotho", "eswatini", "mauritius", "seychelles", "djibouti",
        "eritrea", "somalia", "sudan", "south sudan", "libya", "tunisia",
        "algeria", "burkina faso", "mali", "niger", "chad", "central african republic",
        "gabon", "equatorial guinea", "congo", "guinea", "sierra leone", "liberia",
        "togo", "benin", "gambia", "guinea-bissau", "cape verde", "comoros",
        "mauritania", "sao tome and principe", "burundi",
    }
    return country.lower() in african_countries


def _is_developing(country: str) -> bool:
    developed = {
        "united states", "united kingdom", "canada", "australia", "japan",
        "germany", "france", "italy", "spain", "netherlands", "sweden",
        "norway", "denmark", "finland", "switzerland", "austria", "belgium",
        "ireland", "new zealand", "singapore", "south korea", "israel",
        "iceland", "luxembourg", "liechtenstein", "monaco", "andorra",
    }
    return country.lower() not in developed
