"""
Deterministic CV/Resume scoring engine.
Calculates score 0-100 based on filled fields and data quality.
No AI prompt — pure backend logic, updates on every save.
"""


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
                 "background", "proficient", "dedicated", "results-driven"]
    found = sum(1 for kw in keywords if kw.lower() in summary.lower())
    if found >= 2:
        score += 2
    elif found >= 1:
        score += 1
    
    return min(score, max_score), max_score, issues


def _score_education(resume: dict) -> tuple[int, int, list[str]]:
    """Score education (0-15)."""
    max_score = 15
    edu_list = resume.get("education", [])
    issues = []
    
    if not edu_list:
        return 0, max_score, ["No education listed"]
    
    score = 0
    
    # Has entries
    score += 3
    
    for edu in edu_list:
        # Degree present
        if edu.get("degree"):
            score += 2
        else:
            issues.append("Education missing degree name")
        
        # Institution present
        if edu.get("institution"):
            score += 2
        else:
            issues.append("Education missing institution name")
        
        # Dates present
        if edu.get("start_date") or edu.get("date"):
            score += 2
        else:
            issues.append("Education missing dates")
        
        # GPA or details
        if edu.get("gpa") or edu.get("description"):
            score += 2
        
        # Field of study / courses
        if edu.get("field_of_study") or (edu.get("description") and "course" in edu.get("description", "").lower()):
            score += 2
        
        break  # Score based on first (highest) education
    
    # Bonus for multiple degrees
    if len(edu_list) > 1:
        score += 2
    
    return min(score, max_score), max_score, issues


def _score_experience(resume: dict) -> tuple[int, int, list[str]]:
    """Score work experience (0-20)."""
    max_score = 20
    exp_list = resume.get("experience", [])
    issues = []
    
    if not exp_list:
        return 0, max_score, ["No work experience listed"]
    
    score = 0
    
    # Has entries
    score += 3
    
    # Count bonus
    if len(exp_list) >= 3:
        score += 3
    elif len(exp_list) >= 2:
        score += 2
    elif len(exp_list) >= 1:
        score += 1
    
    for exp in exp_list:
        entry_score = 0
        
        # Position/title
        if exp.get("position") or exp.get("title"):
            entry_score += 1
        
        # Company
        if exp.get("company"):
            entry_score += 1
        
        # Dates
        if exp.get("start_date"):
            entry_score += 1
        
        # Description
        desc = exp.get("description", "")
        if desc and len(desc) > 20:
            entry_score += 1
        
        # Achievements
        achievements = exp.get("achievements", [])
        if achievements:
            entry_score += min(len(achievements), 3)
        
        score += entry_score
    
    # Check for quantified results
    all_text = " ".join([
        exp.get("description", "") + " " + " ".join(exp.get("achievements", []))
        for exp in exp_list
    ])
    import re
    numbers = re.findall(r'\d+[%+]|\d+\s*(users|customers|projects|team|employees|revenue|profit|efficiency)', all_text.lower())
    if numbers:
        score += 2
    else:
        issues.append("Add quantified achievements (e.g., 'improved by 30%')")
    
    return min(score, max_score), max_score, issues


def _score_research(resume: dict) -> tuple[int, int, list[str]]:
    """Score research & projects (0-15)."""
    max_score = 15
    rp_list = resume.get("research_projects", [])
    issues = []
    
    if not rp_list:
        return 0, max_score, ["No research or projects listed"]
    
    score = 0
    
    # Has entries
    score += 3
    
    # Count bonus
    if len(rp_list) >= 3:
        score += 3
    elif len(rp_list) >= 2:
        score += 2
    elif len(rp_list) >= 1:
        score += 1
    
    for rp in rp_list:
        entry_score = 0
        
        # Title
        if rp.get("title"):
            entry_score += 1
        
        # Description
        desc = rp.get("description", "")
        if desc and len(desc) > 20:
            entry_score += 1
        
        # Technologies
        if rp.get("technologies"):
            entry_score += 1
        
        # Outcomes
        if rp.get("outcomes"):
            entry_score += 1
        
        score += entry_score
    
    # Bonus for publications
    pubs = resume.get("publications", [])
    if pubs:
        score += 2
    
    return min(score, max_score), max_score, issues


def _score_skills(resume: dict) -> tuple[int, int, list[str]]:
    """Score skills (0-10)."""
    max_score = 10
    skills = resume.get("skills", [])
    issues = []
    
    if not skills:
        return 0, max_score, ["No skills listed"]
    
    score = 0
    
    # Count
    if len(skills) >= 7:
        score += 5
    elif len(skills) >= 5:
        score += 4
    elif len(skills) >= 3:
        score += 3
    else:
        score += 2
        issues.append("Add more relevant skills (aim for 5+)")
    
    # Variety check
    tech_keywords = ["python", "java", "javascript", "sql", "react", "node", "machine learning",
                     "data", "ai", "ml", "nlp", "flask", "django", "aws", "docker", "git"]
    found = sum(1 for s in skills for kw in tech_keywords if kw.lower() in str(s).lower())
    if found >= 3:
        score += 3
    elif found >= 1:
        score += 2
    
    # Soft skills
    soft_keywords = ["communication", "leadership", "teamwork", "problem-solving",
                     "management", "analytical", "detail", "remote"]
    found_soft = sum(1 for s in skills for kw in soft_keywords if kw.lower() in str(s).lower())
    if found_soft >= 2:
        score += 2
    elif found_soft >= 1:
        score += 1
    
    return min(score, max_score), max_score, issues


def _score_certifications(resume: dict) -> tuple[int, int, list[str]]:
    """Score certifications (0-10)."""
    max_score = 10
    certs = resume.get("certifications", [])
    issues = []
    
    if not certs:
        return 0, max_score, ["No certifications listed"]
    
    score = 0
    
    if len(certs) >= 3:
        score += 6
    elif len(certs) >= 2:
        score += 4
    elif len(certs) >= 1:
        score += 3
    
    for cert in certs:
        if cert.get("name"):
            score += 1
        if cert.get("issuer"):
            score += 1
        if cert.get("date"):
            score += 0.5
        break  # Check first cert details
    
    return min(int(score), max_score), max_score, issues


def _score_publications(resume: dict) -> tuple[int, int, list[str]]:
    """Score publications (0-10)."""
    max_score = 10
    pubs = resume.get("publications", [])
    issues = []
    
    if not pubs:
        return 0, max_score, []
    
    score = 0
    
    if len(pubs) >= 3:
        score += 7
    elif len(pubs) >= 2:
        score += 5
    elif len(pubs) >= 1:
        score += 3
    
    for pub in pubs:
        if pub.get("title"):
            score += 1
        if pub.get("journal"):
            score += 1
        if pub.get("doi"):
            score += 1
        break
    
    return min(score, max_score), max_score, issues


def _score_languages(resume: dict) -> tuple[int, int, list[str]]:
    """Score languages (0-5)."""
    max_score = 5
    langs = resume.get("languages", [])
    issues = []
    
    if not langs:
        return 0, max_score, ["No languages listed"]
    
    score = 0
    
    if len(langs) >= 3:
        score += 4
    elif len(langs) >= 2:
        score += 3
    elif len(langs) >= 1:
        score += 2
    
    # Check for proficiency levels
    has_proficiency = any(
        lang.get("proficiency") or 
        any(kw in str(lang).lower() for kw in ["fluent", "native", "intermediate", "beginner", "advanced"])
        for lang in langs
    )
    if has_proficiency:
        score += 1
    
    return min(score, max_score), max_score, issues


def calculate_resume_score(resume: dict) -> dict:
    """
    Calculate deterministic resume score based on data completeness.
    Returns: { overall_score, section_scores, issues, max_score }
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
