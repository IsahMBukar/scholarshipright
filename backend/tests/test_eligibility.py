"""Tests for the eligibility resolver and its set-algebra edge cases.

The resolver composes:
    included = (union of included_groups members) | included_countries
    excluded = (union of excluded_groups members) | excluded_countries
    resolved = included - excluded

If included_* is empty, starting set is ALL countries. Excluded codes not
in the starting set are silent no-ops.
"""
import uuid

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.country import Country
from app.models.group import Group, GroupMember
from app.services.eligibility import (
    passes_country_gate,
    resolve_eligibility,
    validate_eligibility_inputs,
)


# ── Fixtures ────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def countries(db: AsyncSession) -> list[Country]:
    """Seed a small set of countries for resolver tests."""
    items = [
        Country(code="NG", name="Nigeria", iso3="NGA"),
        Country(code="GH", name="Ghana", iso3="GHA"),
        Country(code="KE", name="Kenya", iso3="KEN"),
        Country(code="ZA", name="South Africa", iso3="ZAF"),
        Country(code="US", name="United States", iso3="USA"),
        Country(code="GB", name="United Kingdom", iso3="GBR"),
        Country(code="FR", name="France", iso3="FRA"),
        Country(code="DE", name="Germany", iso3="DEU"),
        Country(code="PK", name="Pakistan", iso3="PAK"),
        Country(code="BR", name="Brazil", iso3="BRA"),
    ]
    db.add_all(items)
    await db.commit()
    return items


@pytest_asyncio.fixture
async def au_group(db: AsyncSession, countries) -> Group:
    """AU: 5 African countries (subset of the seeded set)."""
    g = Group(id=uuid.uuid4(), code="AU", name="African Union", status="active")
    db.add(g)
    await db.flush()
    for cc in ["NG", "GH", "KE", "ZA", "PK"]:
        db.add(GroupMember(group_id=g.id, country_code=cc))
    await db.commit()
    return g


@pytest_asyncio.fixture
async def eu_group(db: AsyncSession, countries) -> Group:
    g = Group(id=uuid.uuid4(), code="EU", name="European Union", status="active")
    db.add(g)
    await db.flush()
    for cc in ["FR", "DE"]:
        db.add(GroupMember(group_id=g.id, country_code=cc))
    await db.commit()
    return g


@pytest_asyncio.fixture
async def deprecated_group(db: AsyncSession, countries) -> Group:
    g = Group(id=uuid.uuid4(), code="OLD", name="Old", status="deprecated")
    db.add(g)
    await db.flush()
    db.add(GroupMember(group_id=g.id, country_code="US"))
    await db.commit()
    return g


# ── resolve_eligibility ────────────────────────────────────────────


class TestResolveEligibility:
    """Core resolver set algebra."""

    async def test_empty_all_empty_resolves_to_all_countries(self, db, countries):
        """No included_*, no excluded_* → open to everyone (all seeded codes)."""
        resolved, unresolved = await resolve_eligibility(
            included_groups=[], included_countries=[],
            excluded_groups=[], excluded_countries=[],
            db=db,
        )
        assert unresolved is False
        assert set(resolved) == {c.code for c in countries}

    async def test_included_group_only(self, db, au_group, countries):
        resolved, unresolved = await resolve_eligibility(
            included_groups=["AU"], included_countries=[],
            excluded_groups=[], excluded_countries=[],
            db=db,
        )
        assert unresolved is False
        assert set(resolved) == {"NG", "GH", "KE", "ZA", "PK"}

    async def test_included_countries_only(self, db, countries):
        resolved, unresolved = await resolve_eligibility(
            included_groups=[], included_countries=["NG", "KE", "BR"],
            excluded_groups=[], excluded_countries=[],
            db=db,
        )
        assert unresolved is False
        assert set(resolved) == {"NG", "KE", "BR"}

    async def test_included_group_minus_excluded_countries(self, db, au_group, countries):
        """'AU except 4 countries' — canonical pattern."""
        resolved, unresolved = await resolve_eligibility(
            included_groups=["AU"], included_countries=[],
            excluded_groups=[], excluded_countries=["NG", "KE", "GH", "ZA"],
            db=db,
        )
        assert unresolved is False
        assert resolved == ["PK"]

    async def test_included_group_minus_excluded_group(self, db, au_group, eu_group, countries):
        """AU minus EU — even though EU has no AU overlap, the resolver still works."""
        resolved, unresolved = await resolve_eligibility(
            included_groups=["AU"], included_countries=[],
            excluded_groups=["EU"], excluded_countries=[],
            db=db,
        )
        # EU members (FR, DE) are not in AU (NG, GH, KE, ZA, PK) so no change.
        assert unresolved is False
        assert set(resolved) == {"NG", "GH", "KE", "ZA", "PK"}

    async def test_exclude_only_pattern(self, db, eu_group, countries):
        """Empty included_*, excluded_groups=['EU'] → 'Global but not EU'."""
        resolved, unresolved = await resolve_eligibility(
            included_groups=[], included_countries=[],
            excluded_groups=["EU"], excluded_countries=[],
            db=db,
        )
        assert unresolved is False
        expected = {c.code for c in countries} - {"FR", "DE"}
        assert set(resolved) == expected

    async def test_single_country_include(self, db, countries):
        """included_countries=['NG'] → resolves to just NG."""
        resolved, unresolved = await resolve_eligibility(
            included_groups=[], included_countries=["NG"],
            excluded_groups=[], excluded_countries=[],
            db=db,
        )
        assert resolved == ["NG"]

    async def test_exclude_is_silent_noop_outside_included_set(self, db, au_group, countries):
        """Excluding US from AU set: US is not in AU, so no-op."""
        resolved, _ = await resolve_eligibility(
            included_groups=["AU"], included_countries=[],
            excluded_groups=[], excluded_countries=["US"],
            db=db,
        )
        assert set(resolved) == {"NG", "GH", "KE", "ZA", "PK"}

    async def test_unknown_group_marks_unresolved(self, db, au_group, countries):
        """A bogus group code → unresolved=True, included countries still resolve."""
        resolved, unresolved = await resolve_eligibility(
            included_groups=["AU", "DOES_NOT_EXIST"], included_countries=[],
            excluded_groups=[], excluded_countries=[],
            db=db,
        )
        assert unresolved is True
        # AU members still come through; missing group is logged and skipped.
        assert set(resolved) == {"NG", "GH", "KE", "ZA", "PK"}

    async def test_deprecated_group_raises_during_resolution(self, db, deprecated_group, countries):
        """A deprecated group → ValueError → caught by resolver, unresolved=True."""
        resolved, unresolved = await resolve_eligibility(
            included_groups=["OLD"], included_countries=[],
            excluded_groups=[], excluded_countries=[],
            db=db,
        )
        assert unresolved is True
        # Nothing resolved because the only group was deprecated.
        assert resolved == []

    async def test_country_code_case_normalization(self, db, countries):
        """User passes lowercase ISO codes; resolver uppercases them."""
        resolved, _ = await resolve_eligibility(
            included_groups=[], included_countries=["ng", "ke"],
            excluded_groups=[], excluded_countries=[],
            db=db,
        )
        assert set(resolved) == {"NG", "KE"}

    async def test_resolved_is_sorted(self, db, countries):
        resolved, _ = await resolve_eligibility(
            included_groups=[], included_countries=["KE", "NG", "GH"],
            excluded_groups=[], excluded_countries=[],
            db=db,
        )
        assert resolved == ["GH", "KE", "NG"]


# ── passes_country_gate ────────────────────────────────────────────


class TestPassesCountryGate:
    """The match-engine read path: pure lookup on resolved_countries."""

    def test_unresolved_fails_open(self):
        """eligibility_unresolved=True → passes=True with a flag, never silently excluded."""
        result = passes_country_gate(
            user_nationality="NG", user_residency=None,
            eligibility_basis="either",
            resolved_countries=["US"],
            eligibility_unresolved=True,
        )
        assert result["passes"] is True
        assert result["details"].get("unresolved") is True

    def test_empty_resolved_is_open_to_all(self):
        """Empty resolved_countries (the 'worldwide' marker) → passes=True."""
        result = passes_country_gate(
            user_nationality="NG", user_residency="US",
            eligibility_basis="either",
            resolved_countries=[],
            eligibility_unresolved=False,
        )
        assert result["passes"] is True
        assert result["details"].get("open") is True

    def test_user_in_resolved_set_passes(self):
        result = passes_country_gate(
            user_nationality="NG", user_residency="US",
            eligibility_basis="either",
            resolved_countries=["NG", "KE", "GH"],
            eligibility_unresolved=False,
        )
        assert result["passes"] is True

    def test_user_not_in_resolved_set_fails(self):
        result = passes_country_gate(
            user_nationality="US", user_residency="US",
            eligibility_basis="citizenship",
            resolved_countries=["NG", "KE", "GH"],
            eligibility_unresolved=False,
        )
        assert result["passes"] is False
        assert "restricted" in (result["reason"] or "").lower()

    def test_residency_basis_checks_residency(self):
        result = passes_country_gate(
            user_nationality="US", user_residency="NG",
            eligibility_basis="residency",
            resolved_countries=["NG", "KE"],
            eligibility_unresolved=False,
        )
        assert result["passes"] is True

    def test_either_basis_passes_via_either(self):
        """'either' — passes if citizenship OR residency is in the set."""
        result = passes_country_gate(
            user_nationality="US", user_residency="NG",
            eligibility_basis="either",
            resolved_countries=["NG"],
            eligibility_unresolved=False,
        )
        assert result["passes"] is True

    def test_citizenship_basis_ignores_residency(self):
        """'citizenship' — US citizen fails even if residing in NG."""
        result = passes_country_gate(
            user_nationality="US", user_residency="NG",
            eligibility_basis="citizenship",
            resolved_countries=["NG", "KE"],
            eligibility_unresolved=False,
        )
        assert result["passes"] is False

    def test_no_user_data_fails_open_with_flag(self):
        result = passes_country_gate(
            user_nationality=None, user_residency=None,
            eligibility_basis="either",
            resolved_countries=["NG"],
            eligibility_unresolved=False,
        )
        assert result["passes"] is True
        assert result["details"].get("no_user_data") is True

    def test_user_code_case_normalized(self):
        """Lowercase user code is uppercased before lookup."""
        result = passes_country_gate(
            user_nationality="ng", user_residency=None,
            eligibility_basis="citizenship",
            resolved_countries=["NG"],
            eligibility_unresolved=False,
        )
        assert result["passes"] is True


# ── validate_eligibility_inputs (MCP dry-run) ───────────────────────


class TestValidateEligibilityInputs:
    """The agent-facing dry-run helper. These cases are what the agent
    will trip over most often — the resolver's edge cases wrapped in
    actionable warnings."""

    async def test_clean_au_no_warnings(self, db, au_group, countries):
        result = await validate_eligibility_inputs(
            included_groups=["AU"], included_countries=[],
            excluded_groups=[], excluded_countries=[],
            db=db,
        )
        assert result["resolved_count"] == 5
        assert result["warnings"] == []

    async def test_warning_when_excluding_country_not_in_set(self, db, au_group, countries):
        result = await validate_eligibility_inputs(
            included_groups=["AU"], included_countries=[],
            excluded_groups=[], excluded_countries=["US"],
            db=db,
        )
        assert any("US" in w and "no-op" in w for w in result["warnings"])

    async def test_warning_when_excluding_group_with_no_overlap(self, db, au_group, eu_group, countries):
        result = await validate_eligibility_inputs(
            included_groups=["AU"], included_countries=[],
            excluded_groups=["EU"], excluded_countries=[],
            db=db,
        )
        assert any("EU" in w for w in result["warnings"])

    async def test_warning_single_country_include_with_excludes(self, db, countries):
        result = await validate_eligibility_inputs(
            included_groups=[], included_countries=["NG"],
            excluded_groups=[], excluded_countries=["US"],
            db=db,
        )
        assert any("single country" in w for w in result["warnings"])

    async def test_confirm_exclude_only_pattern_is_not_warned_as_wrong(self, db, eu_group, countries):
        """'Global but not EU' is the canonical exclude-only pattern — no warning
        about empty included; if anything we hint it's correct."""
        result = await validate_eligibility_inputs(
            included_groups=[], included_countries=[],
            excluded_groups=["EU"], excluded_countries=[],
            db=db,
        )
        # Should NOT produce a 'this is wrong' warning.
        assert not any("cannot reduce" in w for w in result["warnings"])

    async def test_exclude_only_pattern_includes_informational_hint(self, db, eu_group, countries):
        """The empty-include + non-empty-exclude case should produce an
        informational warning (not a "this is wrong" warning) so agents
        know they're using the canonical 'global but not X' pattern."""
        result = await validate_eligibility_inputs(
            included_groups=[], included_countries=[],
            excluded_groups=["EU"], excluded_countries=[],
            db=db,
        )
        # The positive assertion: the informational warning IS present.
        assert any(
            "starting set is ALL countries" in w and "global but not X" in w
            for w in result["warnings"]
        )

    async def test_exclude_only_with_country_includes_informational_hint(self, db, countries):
        """The same hint fires for exclude-only-by-country (e.g.
        'Global but not Pakistan')."""
        result = await validate_eligibility_inputs(
            included_groups=[], included_countries=[],
            excluded_groups=[], excluded_countries=["PK"],
            db=db,
        )
        assert any(
            "starting set is ALL countries" in w
            for w in result["warnings"]
        )

    async def test_no_exclude_only_hint_when_included_is_set(self, db, countries):
        """The hint must NOT fire when included_* is non-empty (the
        'global but not X' pattern is no longer in play)."""
        result = await validate_eligibility_inputs(
            included_groups=[], included_countries=["NG"],
            excluded_groups=[], excluded_countries=["PK"],
            db=db,
        )
        # Only the single-country-include warning should fire, not the
        # empty-include informational hint.
        assert not any("starting set is ALL countries" in w for w in result["warnings"])

    async def test_unknown_group_marks_unresolved(self, db, countries):
        result = await validate_eligibility_inputs(
            included_groups=["NOPE"], included_countries=[],
            excluded_groups=[], excluded_countries=[],
            db=db,
        )
        assert result["unresolved"] is True
        assert "NOPE" in result["unresolved_groups"]
        assert any("Unknown" in w or "deprecated" in w for w in result["warnings"])

    async def test_excluded_countries_not_in_set_listed(self, db, au_group, countries):
        result = await validate_eligibility_inputs(
            included_groups=["AU"], included_countries=[],
            excluded_groups=[], excluded_countries=["US", "BR"],
            db=db,
        )
        assert set(result["excluded_countries_not_in_set"]) == {"US", "BR"}
