"""Auto-derivation for the 5 "cement + flexible" required-documents fields.

The Scholarship model stores these as nullable columns. When the column
is NULL, we compute the value from the scholarship's ``degree_levels``
list. When the column has a value, that's the admin's explicit override
and it wins.

This separation lets admins override any field without us having to
backfill the 16 existing scholarships — they all get sensible defaults
at read time, and an admin can flip any of them later via the Create
or Edit drawer.

Rules (chosen by the user during planning):
    ┌─────────────────────┬────────────┬────────┬──────────┬──────────────┐
    │ degree_levels       │ cement     │ recs   │ research │ standardized │
    │                     │            │ count  │ proposal │ test         │
    ├─────────────────────┼────────────┼────────┼──────────┼──────────────┤
    │ bachelor only       │ high_school│   2    │ false    │ sat_act      │
    │ master only         │ bachelor   │   2    │ false    │ gre_gmat     │
    │ phd / doctoral      │ master     │   3    │ true     │ gre          │
    │ multi-level         │ highest    │   3    │ true     │ gre          │
    │ empty               │ high_school│   2    │ false    │ none         │
    └─────────────────────┴────────────┴────────┴──────────┴──────────────┘

The "cement" maps to the previous-degree certificate required to apply:
    high_school_diploma  → for a Bachelor's scholarship
    bachelor_degree      → for a Master's scholarship
    master_degree        → for a PhD scholarship
    none                 → no previous-degree requirement (rare)

For the boolean fields, we use the most-restrictive option when there
are multiple degree levels (PhD adds research proposal → if any level
is PhD, we default research_proposal=True).
"""

from __future__ import annotations

from typing import Any, Iterable


# ── Public constants used by both the API and the frontend ───────────
# Keep in sync with the frontend type definition in
# frontend/src/lib/admin/types.ts and the UI in CreateScholarshipDrawer.

PREVIOUS_DEGREE_OPTIONS: list[str] = [
    "high_school_diploma",
    "bachelor_degree",
    "master_degree",
    "none",
]
"""Valid values for ``previous_degree_required``."""

STANDARDIZED_TEST_OPTIONS: list[str] = [
    "none",
    "sat_act",
    "gre_gmat",
    "gre",
    "gmat",
]
"""Valid values for ``standardized_test``."""


# ── Detection helpers ────────────────────────────────────────────────

def _is_phd(level: str) -> bool:
    """Return True for any PhD/doctoral level, regardless of casing
    or naming convention used in our data ('PhD', 'Doctorate', 'Doctoral', etc.).
    """
    s = (level or "").lower()
    return "phd" in s or "doctoral" in s or "doctorate" in s


def _is_master(level: str) -> bool:
    s = (level or "").lower()
    return "master" in s or "msc" in s or "mba" in s or "meng" in s or "mfa" in s or "mphil" in s


def _is_bachelor(level: str) -> bool:
    s = (level or "").lower()
    return "bachelor" in s or "undergrad" in s or "b.sc" in s or "bsc" in s or "ba/" in s


def _classify_levels(degree_levels: Iterable[str] | None) -> dict[str, bool]:
    """Return a {bachelor, master, phd} dict of which levels are present.

    Honours the "highest wins" rule: a multi-level scholarship (e.g.
    ['Master', 'PhD']) is classified as the most-restrictive level
    (PhD) so the auto-defaults are conservative.
    """
    levels = list(degree_levels or [])
    has_phd = any(_is_phd(l) for l in levels)
    has_master = any(_is_master(l) for l in levels)
    has_bachelor = any(_is_bachelor(l) for l in levels)
    return {"bachelor": has_bachelor, "master": has_master, "phd": has_phd}


# ── The pure functions ───────────────────────────────────────────────

def derive_defaults(degree_levels: Iterable[str] | None) -> dict[str, Any]:
    """Compute the auto-default values for the 5 "cement + flexible" fields.

    Returns a dict with keys: ``previous_degree_required``,
    ``recommendation_letters_count``, ``research_proposal_required``,
    ``writing_sample_required``, ``standardized_test``. Each is what
    the column should hold if the admin left it NULL.

    This is a pure function — same input, same output, no side effects.
    Unit-testable without a DB.
    """
    cls = _classify_levels(degree_levels)
    any_level = cls["bachelor"] or cls["master"] or cls["phd"]

    # Cement — the previous-degree cert required. PhD needs master's,
    # master's needs bachelor's, bachelor's needs high school.
    # If multiple levels are present, use the highest (most restrictive).
    if cls["phd"]:
        cement = "master_degree"
    elif cls["master"]:
        cement = "bachelor_degree"
    elif cls["bachelor"]:
        cement = "high_school_diploma"
    else:
        # No levels set (or unrecognised) — default to the safest
        # assumption (high school), matching what the old static UI
        # effectively showed.
        cement = "high_school_diploma"

    # Recommendation letters — 3 for PhD (universally academic-heavy
    # and needs 3 strong academic refs), 2 for everything else.
    rec_count = 3 if cls["phd"] else 2

    # Research proposal — required for PhD. For master's it's optional
    # (some research-track programs want one, most don't), so we
    # default False and let admins flip it.
    research_proposal = bool(cls["phd"])

    # Writing sample — no auto-default. Always admin-only decision.
    writing_sample = False

    # Standardized test — most common by level.
    if cls["phd"]:
        test = "gre"
    elif cls["master"]:
        test = "gre_gmat"
    elif cls["bachelor"]:
        test = "sat_act"
    else:
        test = "none"

    # Suppress the "any_level" branch — kept for future use when we
    # have more nuanced rules (e.g. "no levels" → conservative).
    _ = any_level

    return {
        "previous_degree_required": cement,
        "recommendation_letters_count": rec_count,
        "research_proposal_required": research_proposal,
        "writing_sample_required": writing_sample,
        "standardized_test": test,
    }


def apply_auto_defaults(scholarship: Any) -> Any:
    """Mutate a Scholarship-like object in place, filling in any NULL
    "cement + flexible" fields with the auto-derived value.

    Pass any object with these attributes (set or None):
        degree_levels, previous_degree_required, recommendation_letters_count,
        research_proposal_required, writing_sample_required, standardized_test.

    After this call, every "cement + flexible" attribute is guaranteed
    to be a non-None concrete value. The 8 required-doc booleans are
    left alone (they have DB defaults).

    `accepted_english_tests` is ALSO auto-derived here when empty —
    using `_infer_english_tests(host_country)` from the scholarship
    model. Lazy import to avoid a circular reference at module load
    (document_defaults is imported by app.api.scholarships which
    transitively imports the Scholarship model).

    This is the read-side materialiser — called by:
        - admin_scholarships.get_scholarship() (admin GET single)
        - admin_scholarships.list_scholarships() (admin list)
        - admin_scholarships.create_scholarship() (admin POST)
        - admin_scholarships.patch_scholarship() (admin PATCH)
        - scholarships.get_scholarship() (public detail page)
    """
    defaults = derive_defaults(getattr(scholarship, "degree_levels", None))

    if getattr(scholarship, "previous_degree_required", None) is None:
        scholarship.previous_degree_required = defaults["previous_degree_required"]

    if getattr(scholarship, "recommendation_letters_count", None) is None:
        scholarship.recommendation_letters_count = defaults["recommendation_letters_count"]

    if getattr(scholarship, "research_proposal_required", None) is None:
        scholarship.research_proposal_required = defaults["research_proposal_required"]

    if getattr(scholarship, "writing_sample_required", None) is None:
        scholarship.writing_sample_required = defaults["writing_sample_required"]

    if getattr(scholarship, "standardized_test", None) is None:
        scholarship.standardized_test = defaults["standardized_test"]

    # Auto-derive accepted_english_tests from host_country when the
    # admin didn't explicitly set any. Mirrors the backfill logic in
    # ensure_scholarship_schema_columns() so newly-created rows match
    # the behaviour of legacy rows after the migration.
    current_tests = getattr(scholarship, "accepted_english_tests", None)
    if not current_tests:  # None or empty list — derive
        # Lazy import to dodge circular: app.api.scholarships imports
        # this module, and pulling the Scholarship ORM here would
        # re-enter its own import chain.
        from app.models.scholarship import _infer_english_tests

        scholarship.accepted_english_tests = _infer_english_tests(
            getattr(scholarship, "host_country", None)
        )

    return scholarship
