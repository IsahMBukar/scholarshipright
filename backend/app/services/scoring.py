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
