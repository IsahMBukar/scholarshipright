"""
Match scoring algorithm.

Score = semantic_score (0-60) + rule_bonuses (0-40)

Rule bonuses:
  +15  field_of_study exact or sibling match
  +10  country eligibility confirmed
  +8   degree_level match
  +5   start_date within user's window (±6 months)
  +5   no_ielts required and user has no IELTS
  -20  hard fail: degree level mismatch (ineligible)
  -15  hard fail: nationality not eligible
  -10  requires application fee (penalize for target user)
"""
from datetime import date, timedelta
from typing import Optional
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
}


def field_match_score(user_fields: list[str], scholarship_fields: list[str]) -> float:
    """Score field match: +15 exact, +10 sibling, +5 partial, 0 none."""
    if not user_fields or not scholarship_fields:
        return 0

    # Check "all_fields" in scholarship
    if "all_fields" in scholarship_fields:
        return 15

    user_set = set(f.lower() for f in user_fields)
    sch_set = set(f.lower() for f in scholarship_fields)

    # Exact match
    if user_set & sch_set:
        return 15

    # Sibling match
    for uf in user_set:
        siblings = set(FIELD_SIBLINGS.get(uf, []))
        if siblings & sch_set:
            return 10

    return 0


def country_eligibility_score(user_country: str, eligible_nationalities: list[str]) -> float:
    """Score country eligibility: +10 eligible, -15 hard fail."""
    if not user_country or not eligible_nationalities:
        return 0

    user_lower = user_country.lower()
    for nat in eligible_nationalities:
        nat_lower = nat.lower()
        if "all" in nat_lower or user_lower in nat_lower:
            return 10
        if "africa" in nat_lower and _is_african(user_country):
            return 10
        if "developing" in nat_lower and _is_developing(user_country):
            return 10

    return -15  # Hard fail


def degree_match_score(user_target: str, scholarship_degrees: list[str]) -> float:
    """Score degree match: +8 match, -20 hard fail."""
    if not user_target or not scholarship_degrees:
        return 0

    if user_target.lower() in [d.lower() for d in scholarship_degrees]:
        return 8

    return -20  # Hard fail


def start_date_score(user_target_date, program_start_date) -> float:
    """Score if start date is within user's window (±6 months)."""
    if not user_target_date or not program_start_date:
        return 0

    if isinstance(user_target_date, str):
        user_target_date = date.fromisoformat(user_target_date)
    if isinstance(program_start_date, str):
        program_start_date = date.fromisoformat(program_start_date)

    diff = abs((program_start_date - user_target_date).days)
    if diff <= 180:  # 6 months
        return 5
    return 0


def no_ielts_bonus(user_has_ielts: bool, scholarship_requires_ielts: bool) -> float:
    """+5 if scholarship doesn't require IELTS and user doesn't have it."""
    if not user_has_ielts and not scholarship_requires_ielts:
        return 5
    return 0


def fee_penalty(requires_fee: bool) -> float:
    """-10 if scholarship requires application fee."""
    if requires_fee:
        return -10
    return 0


def compute_match_score(profile, scholarship) -> dict:
    """
    Compute match score between a profile and scholarship.

    Returns: {"score": float, "breakdown": {"semantic": float, "field": float, ...}}
    """
    # 1. Semantic similarity
    semantic = 0.0
    if profile.embedding is not None and scholarship.embedding is not None:
        semantic = cosine_similarity(profile.embedding, scholarship.embedding) * 60

    # 2. Rule-based adjustments
    bonuses = {}
    bonuses["field"] = field_match_score(
        profile.target_fields or [],
        scholarship.fields_of_study or []
    )
    bonuses["country"] = country_eligibility_score(
        profile.country_of_origin or "",
        scholarship.eligible_nationalities or []
    )
    bonuses["degree"] = degree_match_score(
        profile.target_degree or "",
        scholarship.degree_levels or []
    )
    bonuses["start_date"] = start_date_score(
        profile.target_start_date,
        scholarship.program_start_date
    )
    bonuses["no_ielts"] = no_ielts_bonus(
        profile.has_ielts or False,
        scholarship.requires_ielts or False
    )
    bonuses["fee_penalty"] = fee_penalty(
        scholarship.requires_application_fee or False
    )

    total = min(100, max(0, semantic + sum(bonuses.values())))
    return {
        "score": round(total, 2),
        "breakdown": {"semantic": round(semantic, 2), **bonuses}
    }


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
    # Simplified — most African, Asian, Latin American countries are developing
    developed = {
        "united states", "united kingdom", "canada", "australia", "japan",
        "germany", "france", "italy", "spain", "netherlands", "sweden",
        "norway", "denmark", "finland", "switzerland", "austria", "belgium",
        "ireland", "new zealand", "singapore", "south korea", "israel",
        "iceland", "luxembourg", "liechtenstein", "monaco", "andorra",
    }
    return country.lower() not in developed
