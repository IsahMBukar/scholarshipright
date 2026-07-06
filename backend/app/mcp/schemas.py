"""
MCP tool schemas for ScholarshipRight.

Defines the input/output schemas for each tool the MCP server exposes.
These mirror the existing backend scholarship model fields.
"""

# Fields that agents can set when adding/updating a scholarship.
# Matches AdminScholarshipCreate from the backend.
SCHOLARSHIP_FIELDS = {
    # Required
    "name": {"type": "string", "description": "Full scholarship name", "required": True},
    "host_country": {"type": "string", "description": "Country where scholarship is offered", "required": True},
    "funding_type": {
        "type": "string",
        "enum": ["fully_funded", "partially_funded", "tuition_only", "self_funded", "loan"],
        "description": "Type of funding",
        "required": True,
    },
    "deadline": {"type": "string", "description": "Application deadline (YYYY-MM-DD)", "required": True},
    "official_url": {"type": "string", "description": "Official scholarship URL", "required": True},

    # Optional — Identity
    "slug": {"type": "string", "description": "URL-friendly identifier (auto-generated if omitted)"},
    "host_institution": {"type": "string", "description": "University or institution name"},
    "provider": {"type": "string", "description": "Organization providing the scholarship"},

    # Optional — Scope
    "degree_levels": {
        "type": "array",
        "items": {"type": "string", "enum": ["bachelor", "master", "phd", "doctoral", "postdoc"]},
        "description": "Degree levels covered",
    },
    "fields_of_study": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Fields of study (e.g. ['engineering', 'medicine', 'all_fields'])",
    },
    "eligible_nationalities": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Eligible nationalities or groups (e.g. ['All countries', 'Commonwealth'])",
    },
    "eligible_regions": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Eligible regions (e.g. ['Africa', 'Asia', 'All regions'])",
    },

    # Optional — Funding
    "covers_tuition": {"type": "boolean", "description": "Covers tuition fees"},
    "covers_living": {"type": "boolean", "description": "Covers living expenses"},
    "covers_flight": {"type": "boolean", "description": "Covers flight/airfare"},
    "covers_health": {"type": "boolean", "description": "Covers health insurance"},
    "monthly_stipend_usd": {"type": "integer", "description": "Monthly stipend amount in USD"},

    # Optional — Requirements
    "requires_ielts": {"type": "boolean", "description": "Requires IELTS or equivalent"},
    "min_ielts_score": {"type": "number", "description": "Minimum IELTS score (e.g. 6.5)"},
    "requires_gre": {"type": "boolean", "description": "Requires GRE"},
    "requires_application_fee": {"type": "boolean", "description": "Has application fee"},
    "min_cgpa": {"type": "number", "description": "Minimum CGPA (e.g. 3.0)"},
    "language_of_instruction": {"type": "string", "description": "Language of instruction (default: English)"},

    # Optional — Dates
    "open_date": {"type": "string", "description": "Application opening date (YYYY-MM-DD)"},
    "program_start_date": {"type": "string", "description": "Program start date (YYYY-MM-DD)"},
    "duration_months": {"type": "integer", "description": "Program duration in months"},

    # Optional — Content
    "description": {"type": "string", "description": "Scholarship description"},
    "benefits_summary": {"type": "string", "description": "Summary of benefits"},
    "how_to_apply": {"type": "string", "description": "Application instructions"},
    "logo_url": {"type": "string", "description": "URL to scholarship logo image"},

    # Optional — Status
    "is_active": {"type": "boolean", "description": "Whether scholarship is active (default: true)"},
    "is_verified": {"type": "boolean", "description": "Whether scholarship is verified (default: false)"},
    "source": {"type": "string", "description": "Data source (e.g. 'chevening.org')"},

    # Accepted English tests
    "accepted_english_tests": {
        "type": "array",
        "items": {"type": "string", "enum": ["IELTS", "TOEFL", "PTE", "Duolingo", "Cambridge"]},
        "description": "English tests accepted (e.g. ['IELTS', 'TOEFL'])",
    },

    # Required documents
    "previous_degree_required": {
        "type": "string",
        "enum": ["high_school_diploma", "bachelor_degree", "master_degree", "none"],
        "description": "Previous degree certificate required to apply",
    },
    "recommendation_letters_count": {"type": "integer", "description": "Number of recommendation letters required (e.g. 2 or 3)"},
    "research_proposal_required": {"type": "boolean", "description": "Whether a research proposal is required"},
    "writing_sample_required": {"type": "boolean", "description": "Whether a writing sample is required"},
    "standardized_test": {
        "type": "string",
        "enum": ["none", "sat_act", "gre_gmat", "gre", "gmat"],
        "description": "Standardized test required",
    },
    "additional_required_documents": {"type": "string", "description": "Any extra required documents (free text, e.g. '2-min video essay')"},
    "req_transcripts": {"type": "boolean", "description": "Transcripts required"},
    "req_cv_resume": {"type": "boolean", "description": "CV/Resume required"},
    "req_sop_motivation_letter": {"type": "boolean", "description": "Statement of purpose / motivation letter required"},
    "req_recommendation_letters": {"type": "boolean", "description": "Recommendation letters required"},
    "req_english_test": {"type": "boolean", "description": "English test score required"},
    "req_passport_or_id": {"type": "boolean", "description": "Passport or ID required"},
    "req_financial_proof": {"type": "boolean", "description": "Financial proof required"},
    "req_photo": {"type": "boolean", "description": "Photo required"},

    # Eligibility
    "eligibility_display": {"type": "string", "description": "Human-readable eligibility text (e.g. 'All Commonwealth countries except Pakistan')"},
    "eligibility_basis": {
        "type": "string",
        "enum": ["citizenship", "residency", "either"],
        "description": "What eligibility gates on",
    },
    "included_groups": {"type": "array", "items": {"type": "string"}, "description": "Country groups to include (e.g. ['commonwealth', 'african_union'])"},
    "included_countries": {"type": "array", "items": {"type": "string"}, "description": "Specific country codes to include (ISO alpha-2, e.g. ['NG', 'KE'])"},
    "excluded_groups": {"type": "array", "items": {"type": "string"}, "description": "Country groups to exclude"},
    "excluded_countries": {"type": "array", "items": {"type": "string"}, "description": "Specific country codes to exclude (ISO alpha-2)"},
}


def get_tool_schemas() -> dict:
    """Return MCP tool input schemas."""
    required_fields = [k for k, v in SCHOLARSHIP_FIELDS.items() if v.get("required")]
    properties = {}
    for name, spec in SCHOLARSHIP_FIELDS.items():
        prop = {"type": spec["type"], "description": spec.get("description", "")}
        if "enum" in spec:
            prop["enum"] = spec["enum"]
        if "items" in spec:
            prop["items"] = spec["items"]
        properties[name] = prop

    return {
        "add_scholarship": {
            "description": "Add a new scholarship to the review queue. Submissions are reviewed by an admin before going live.",
            "inputSchema": {
                "type": "object",
                "properties": properties,
                "required": required_fields,
            },
        },
        "list_scholarships": {
            "description": "List existing scholarships (to check for duplicates before adding).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "search": {"type": "string", "description": "Search query (name, country)"},
                    "limit": {"type": "integer", "description": "Max results (default 10)"},
                },
            },
        },
        "get_scholarship": {
            "description": "Get details of a specific scholarship by ID or slug.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id_or_slug": {"type": "string", "description": "Scholarship ID (UUID) or slug"},
                },
                "required": ["id_or_slug"],
            },
        },
        "edit_scholarship": {
            "description": "Edit an existing scholarship. Only pass the fields you want to change — omitted fields stay unchanged.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id_or_slug": {"type": "string", "description": "Scholarship ID (UUID) or slug to edit"},
                    **{k: v for k, v in properties.items() if k != "id_or_slug"},
                },
                "required": ["id_or_slug"],
            },
        },
    }
