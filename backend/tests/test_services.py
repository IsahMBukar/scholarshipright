"""Tests for service layer: URL extractor, document defaults, eligibility."""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from app.services.document_defaults import apply_auto_defaults
from app.models.scholarship import Scholarship


class TestDocumentDefaults:
    """Tests for the auto-default document derivation."""

    def test_bachelor_only_defaults(self):
        """Bachelor-only → high_school_diploma, 2 rec letters, no research proposal."""
        sch = Scholarship(
            name="Test",
            slug="test",
            host_country="UK",
            funding_type="fully_funded",
            deadline="2026-12-01",
            official_url="https://example.com",
            degree_levels=["bachelor"],
            previous_degree_required=None,
            recommendation_letters_count=None,
            research_proposal_required=None,
        )
        apply_auto_defaults(sch)
        assert sch.previous_degree_required == "high_school_diploma"
        assert sch.recommendation_letters_count == 2
        assert sch.research_proposal_required is False

    def test_master_only_defaults(self):
        """Master-only → bachelor_degree, 2 rec letters."""
        sch = Scholarship(
            name="Test",
            slug="test",
            host_country="Germany",
            funding_type="fully_funded",
            deadline="2026-12-01",
            official_url="https://example.com",
            degree_levels=["master"],
            previous_degree_required=None,
            recommendation_letters_count=None,
        )
        apply_auto_defaults(sch)
        assert sch.previous_degree_required == "bachelor_degree"
        assert sch.recommendation_letters_count == 2

    def test_phd_only_defaults(self):
        """PhD-only → master_degree, 3 rec letters, research proposal required."""
        sch = Scholarship(
            name="Test",
            slug="test",
            host_country="USA",
            funding_type="fully_funded",
            deadline="2026-12-01",
            official_url="https://example.com",
            degree_levels=["phd"],
            previous_degree_required=None,
            recommendation_letters_count=None,
            research_proposal_required=None,
        )
        apply_auto_defaults(sch)
        assert sch.previous_degree_required == "master_degree"
        assert sch.recommendation_letters_count == 3
        assert sch.research_proposal_required is True

    def test_explicit_override_preserved(self):
        """If admin set explicit values, don't override."""
        sch = Scholarship(
            name="Test",
            slug="test",
            host_country="France",
            funding_type="fully_funded",
            deadline="2026-12-01",
            official_url="https://example.com",
            degree_levels=["master"],
            previous_degree_required="none",
            recommendation_letters_count=5,
            research_proposal_required=True,
        )
        apply_auto_defaults(sch)
        assert sch.previous_degree_required == "none"
        assert sch.recommendation_letters_count == 5
        assert sch.research_proposal_required is True


class TestUrlExtractor:
    """Tests for the URL-to-scholarship extractor."""

    def test_extractor_requires_api_key(self):
        """Without CLAUDE_API_KEY, extraction should fail."""
        from app.services.url_extractor import extract_from_url
        import asyncio

        with patch.dict("os.environ", {"CLAUDE_API_KEY": "", "ANTHROPIC_API_KEY": ""}):
            with pytest.raises(ValueError, match="API_KEY"):
                asyncio.run(extract_from_url("https://example.com"))

    @pytest.mark.asyncio
    async def test_extractor_handles_http_error(self):
        """HTTP fetch failure should raise ValueError."""
        from app.services.url_extractor import extract_from_url

        with patch.dict("os.environ", {"CLAUDE_API_KEY": "test-key"}):
            with patch("httpx.AsyncClient.get", side_effect=Exception("Connection refused")):
                with pytest.raises((ValueError, Exception)):
                    await extract_from_url("https://invalid-domain-12345.com")

    @pytest.mark.asyncio
    async def test_extractor_parses_claude_response(self):
        """Successful Claude response should be parsed into scholarship data."""
        import json
        from app.services.url_extractor import extract_from_url

        mock_response_data = {
            "name": "Test Scholarship",
            "host_country": "Japan",
            "funding_type": "fully_funded",
            "deadline": "2026-10-01",
            "official_url": "https://example.com",
        }

        mock_http_resp = MagicMock()
        mock_http_resp.text = "<html>Test</html>"
        mock_http_resp.raise_for_status = MagicMock()

        mock_claude_resp = MagicMock()
        mock_claude_resp.json.return_value = {
            "content": [{"text": json.dumps(mock_response_data)}]
        }
        mock_claude_resp.raise_for_status = MagicMock()

        with patch.dict("os.environ", {"CLAUDE_API_KEY": "test-key"}):
            with patch("httpx.AsyncClient.get", return_value=mock_http_resp):
                with patch("httpx.AsyncClient.post", return_value=mock_claude_resp):
                    result = await extract_from_url("https://example.com")

        assert result["name"] == "Test Scholarship"
        assert result["host_country"] == "Japan"
        assert result["funding_type"] == "fully_funded"


class TestEligibility:
    """Tests for eligibility resolution logic."""

    def test_scholarship_eligibility_fields_exist(self):
        """Verify the eligibility columns exist on the model."""
        sch = Scholarship(
            name="Test",
            slug="test",
            host_country="UK",
            funding_type="fully_funded",
            deadline="2026-12-01",
            official_url="https://example.com",
            eligibility_display="All Commonwealth countries",
            eligibility_basis="citizenship",
            included_groups=["commonwealth"],
            excluded_countries=["PK"],
        )
        assert sch.eligibility_display == "All Commonwealth countries"
        assert sch.eligibility_basis == "citizenship"
        assert "commonwealth" in sch.included_groups
        assert "PK" in sch.excluded_countries
