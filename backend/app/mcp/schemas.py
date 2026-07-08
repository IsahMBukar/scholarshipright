"""
MCP tool schemas for ScholarshipRight.

Defines the input/output schemas for each tool the MCP server exposes.
These mirror the existing backend scholarship and blog model fields.
"""

# ── Scholarship fields ─────────────────────────────────────────────

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
        "items": {"type": "string", "enum": ["bachelor", "master", "phd", "direct_phd", "postdoc", "certificate", "diploma", "associate", "other"]},
        "description": "Degree levels covered. Use 'direct_phd' for BSc→PhD programs.",
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

    # Flat required document fields (legacy — prefer degree_documents for per-level control)
    "previous_degree_required": {
        "type": "string",
        "enum": ["high_school_diploma", "bachelor_degree", "master_degree", "phd_degree", "none"],
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

    # Per-degree-level document overrides (inline with add/edit).
    # Each entry sets the doc requirements for one degree level.
    # Omitted levels use auto-derived defaults. When provided, these
    # override the flat fields above for the specified levels.
    "degree_documents": {
        "type": "array",
        "description": "Per-degree-level document configs. Each sets req toggles + cement/flexible fields for one level. Auto-derived defaults fill any gaps. Example: [{\"degree_level\": \"phd\", \"recommendation_letters_count\": 3, \"research_proposal_required\": true}]",
        "items": {
            "type": "object",
            "properties": {
                "degree_level": {"type": "string", "enum": ["bachelor", "master", "phd", "direct_phd", "postdoc"], "description": "Degree level"},
                "req_transcripts": {"type": "boolean", "description": "Transcripts required (default: true)"},
                "req_cv_resume": {"type": "boolean", "description": "CV/Resume required (default: true)"},
                "req_sop_motivation_letter": {"type": "boolean", "description": "Statement of purpose required (default: true)"},
                "req_recommendation_letters": {"type": "boolean", "description": "Recommendation letters required (default: true)"},
                "req_english_test": {"type": "boolean", "description": "English test required (default: true)"},
                "req_passport_or_id": {"type": "boolean", "description": "Passport/ID required (default: true)"},
                "req_financial_proof": {"type": "boolean", "description": "Financial proof required (default: false)"},
                "req_photo": {"type": "boolean", "description": "Photo required (default: false)"},
                "previous_degree_required": {"type": "string", "enum": ["high_school_diploma", "bachelor_degree", "master_degree", "phd_degree", "none"], "description": "Previous degree required (auto-derived if omitted)"},
                "recommendation_letters_count": {"type": "integer", "description": "Number of recommendation letters (auto-derived if omitted)"},
                "research_proposal_required": {"type": "boolean", "description": "Research proposal required (auto-derived if omitted)"},
                "writing_sample_required": {"type": "boolean", "description": "Writing sample required (auto-derived if omitted)"},
                "standardized_test": {"type": "string", "enum": ["none", "sat_act", "gre_gmat", "gre", "gmat"], "description": "Standardized test required (auto-derived if omitted)"},
            },
            "required": ["degree_level"],
        },
    },

    # Custom/flexible document requirements (inline with add/edit).
    # For anything not covered by the standard toggles — portfolio, video
    # essay, workshop certificate, etc.
    "custom_documents": {
        "type": "array",
        "description": "Custom document requirements. For documents not covered by standard fields — portfolio, video essay, certificate, etc. Example: [{\"name\": \"Portfolio\", \"description\": \"5-10 pieces\", \"required\": true}]",
        "items": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Document name (e.g. 'Portfolio', 'Video essay')"},
                "description": {"type": "string", "description": "What to submit (e.g. '5-10 pieces of original work')"},
                "required": {"type": "boolean", "description": "Whether required (default: true)"},
                "degree_level": {"type": "string", "description": "If set, only for this degree level. Omit for all levels."},
            },
            "required": ["name"],
        },
    },

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


# ── Blog fields ────────────────────────────────────────────────────

BLOG_FIELDS = {
    "title": {"type": "string", "description": "Blog post title (3-300 chars)", "required": True},
    "body": {"type": "string", "description": "Post content in Markdown. Use @[scholarship:slug] to embed scholarship cards inline.", "required": True},
    "excerpt": {"type": "string", "description": "Short summary shown in the blog list (optional, auto-generated if omitted)"},
    "cover_image_url": {"type": "string", "description": "URL to the cover/hero image"},
    "category": {
        "type": "string",
        "enum": ["general", "guides", "tips", "success-stories", "application-help", "essay-writing", "interview-prep", "funding", "study-abroad"],
        "description": "Post category (default: general)",
    },
    "tags": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Tags for the post (e.g. ['tips', 'chevening', 'uk-scholarships'])",
    },
    "status": {
        "type": "string",
        "enum": ["draft", "published", "pending_review"],
        "description": "Post status. AI submissions default to pending_review for admin approval.",
    },
}


# ── Tool schema builder ───────────────────────────────────────────

def _build_properties(fields: dict) -> dict:
    """Convert field defs to JSON Schema properties (strip 'required' key)."""
    properties = {}
    for name, spec in fields.items():
        prop = {"type": spec["type"], "description": spec.get("description", "")}
        if "enum" in spec:
            prop["enum"] = spec["enum"]
        if "items" in spec:
            prop["items"] = spec["items"]
        properties[name] = prop
    return properties


def get_tool_schemas() -> dict:
    """Return MCP tool input schemas."""
    # ── Scholarship tools ──────────────────────────────────────────
    sch_properties = _build_properties(SCHOLARSHIP_FIELDS)
    sch_required = [k for k, v in SCHOLARSHIP_FIELDS.items() if v.get("required")]

    # ── Blog tools ─────────────────────────────────────────────────
    blog_properties = _build_properties(BLOG_FIELDS)
    blog_required = [k for k, v in BLOG_FIELDS.items() if v.get("required")]

    return {
        # Scholarship tools
        "add_scholarship": {
            "description": "Add a new scholarship to the review queue. Submissions are reviewed by an admin before going live. Use degree_documents for per-level doc configs and custom_documents for non-standard requirements (portfolio, video essay, etc.).",
            "inputSchema": {
                "type": "object",
                "properties": sch_properties,
                "required": sch_required,
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
            "description": "Get details of a specific scholarship by ID or slug. Returns all fields including per-degree document overrides and custom documents.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id_or_slug": {"type": "string", "description": "Scholarship ID (UUID) or slug"},
                },
                "required": ["id_or_slug"],
            },
        },
        "edit_scholarship": {
            "description": "Edit an existing scholarship. Only pass the fields you want to change — omitted fields stay unchanged. Use degree_documents to set per-level doc configs (replaces existing for specified levels) and custom_documents to replace all custom docs.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id_or_slug": {"type": "string", "description": "Scholarship ID (UUID) or slug to edit"},
                    **{k: v for k, v in sch_properties.items() if k != "id_or_slug"},
                },
                "required": ["id_or_slug"],
            },
        },
        # Blog tools
        "create_blog_post": {
            "description": "Create a new blog post. AI submissions go to pending_review for admin approval before publishing. Use @[scholarship:slug] in the body to embed scholarship cards inline.",
            "inputSchema": {
                "type": "object",
                "properties": blog_properties,
                "required": blog_required,
            },
        },
        "list_blog_posts": {
            "description": "List published blog posts. Filter by category or tag.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "search": {"type": "string", "description": "Search in post titles"},
                    "category": {"type": "string", "description": "Filter by category slug"},
                    "tag": {"type": "string", "description": "Filter by tag"},
                    "page": {"type": "integer", "description": "Page number (default 1)"},
                    "limit": {"type": "integer", "description": "Results per page (default 10, max 50)"},
                },
            },
        },
        "get_blog_post": {
            "description": "Get a blog post by slug or ID. Returns full content including markdown body and rendered HTML.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "slug_or_id": {"type": "string", "description": "Blog post slug or UUID"},
                },
                "required": ["slug_or_id"],
            },
        },
        "edit_blog_post": {
            "description": "Edit an existing blog post. Only pass the fields you want to change. Use post_id (UUID) from get_blog_post or list_blog_posts.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "post_id": {"type": "string", "description": "Blog post UUID to edit"},
                    **{k: v for k, v in blog_properties.items() if k not in ("status",)},
                    "status": {
                        "type": "string",
                        "enum": ["draft", "published", "pending_review", "archived"],
                        "description": "Change post status (e.g. publish a draft, archive a post)",
                    },
                },
                "required": ["post_id"],
            },
        },
        "list_blog_categories": {
            "description": "List all blog categories that have published posts.",
            "inputSchema": {
                "type": "object",
                "properties": {},
            },
        },
    }
