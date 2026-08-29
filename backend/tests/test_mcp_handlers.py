"""Tests for the shared MCP handler helpers in app/mcp/handlers.py."""
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.mcp.handlers import (
    apply_blog_post_changes,
    format_blog_edit_response,
    format_validate_eligibility,
    parse_eligibility_args,
)
from app.models.blog import BlogPost
from app.models.user import User


# ── parse_eligibility_args ─────────────────────────────────────────


class TestParseEligibilityArgs:
    def test_missing_fields_default_to_empty(self):
        result = parse_eligibility_args({})
        assert result == ([], [], [], [])

    def test_none_fields_default_to_empty(self):
        result = parse_eligibility_args({
            "included_groups": None,
            "included_countries": None,
        })
        assert result == ([], [], [], [])

    def test_valid_lists(self):
        result = parse_eligibility_args({
            "included_groups": ["AU"],
            "included_countries": ["NG"],
            "excluded_groups": ["EU"],
            "excluded_countries": ["US"],
        })
        assert result == (["AU"], ["NG"], ["EU"], ["US"])

    def test_non_list_field_returns_none(self):
        # included_groups is a string instead of a list — should reject.
        assert parse_eligibility_args({"included_groups": "AU"}) is None

    def test_dict_field_returns_none(self):
        assert parse_eligibility_args({"included_countries": {"NG": True}}) is None

    def test_int_field_returns_none(self):
        assert parse_eligibility_args({"excluded_groups": 42}) is None


# ── format_validate_eligibility ────────────────────────────────────


class TestFormatValidateEligibility:
    def test_resolved_with_sample(self):
        result = {
            "resolved_count": 5,
            "sample_resolved": ["NG", "KE", "GH"],
            "unresolved": False,
            "warnings": [],
        }
        text = format_validate_eligibility(result)
        assert "Resolved: 5 country(s)" in text
        assert "Sample: NG, KE, GH" in text
        assert "Unresolved" not in text
        assert "Warnings" not in text

    def test_resolved_empty_sample_shows_none(self):
        result = {
            "resolved_count": 0,
            "sample_resolved": [],
            "unresolved": False,
            "warnings": [],
        }
        text = format_validate_eligibility(result)
        assert "Sample: (none)" in text

    def test_unresolved_flag(self):
        result = {
            "resolved_count": 0,
            "sample_resolved": [],
            "unresolved": True,
            "warnings": [],
        }
        text = format_validate_eligibility(result)
        assert "Unresolved: TRUE" in text
        assert "flagged for admin review" in text

    def test_warnings_rendered_as_bullets(self):
        result = {
            "resolved_count": 1,
            "sample_resolved": ["NG"],
            "unresolved": False,
            "warnings": ["first warning", "second warning"],
        }
        text = format_validate_eligibility(result)
        assert "Warnings:" in text
        assert "  - first warning" in text
        assert "  - second warning" in text

    def test_output_is_transport_agnostic_string(self):
        """The function returns a plain string usable by stdio (TextContent)
        and SSE (joined into a content dict). No transport-specific objects."""
        result = {
            "resolved_count": 1,
            "sample_resolved": ["NG"],
            "unresolved": False,
            "warnings": [],
        }
        out = format_validate_eligibility(result)
        assert isinstance(out, str)


# ── apply_blog_post_changes ────────────────────────────────────────


@pytest_asyncio.fixture
async def sample_user(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"author-{uuid.uuid4().hex[:8]}@example.com",
        full_name="Author",
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def sample_post(db: AsyncSession, sample_user: User) -> BlogPost:
    post = BlogPost(
        id=uuid.uuid4(),
        author_id=sample_user.id,
        title="Original Title",
        slug="original-title",
        body="Original body",
        status="draft",
    )
    db.add(post)
    await db.commit()
    await db.refresh(post)
    return post


def _slugify(s: str) -> str:
    return s.lower().replace(" ", "-")


def _make_helpers():
    """Return stub callables for the dependency-injected helpers."""
    extract = MagicMock(return_value=[])
    validate = AsyncMock(return_value={"invalid": [], "suggestions": {}})
    sync_tags = AsyncMock()
    read_time = MagicMock(return_value=3)
    return extract, validate, sync_tags, read_time


class TestApplyBlogPostChanges:
    async def test_title_change_regenerates_slug(self, db, sample_post):
        extract, validate, sync_tags, read_time = _make_helpers()
        changed, invalid = await apply_blog_post_changes(
            sample_post,
            {"title": "New Title"},
            auth_identity="test",
            slugify_fn=_slugify,
            db=db,
            extract_scholarship_slugs_fn=extract,
            validate_scholarship_slugs_fn=validate,
            sync_blog_scholarship_tags_fn=sync_tags,
            compute_reading_time_fn=read_time,
        )
        assert changed == ["title"]
        assert invalid == []
        assert sample_post.title == "New Title"
        assert sample_post.slug == "new-title"

    async def test_title_slug_collision_gets_suffix(self, db, sample_post, sample_user):
        # Insert another post that already owns the new slug.
        other = BlogPost(
            id=uuid.uuid4(),
            author_id=sample_user.id,
            title="Other",
            slug="new-title",
            body="x",
            status="draft",
        )
        db.add(other)
        await db.commit()

        extract, validate, sync_tags, read_time = _make_helpers()
        await apply_blog_post_changes(
            sample_post,
            {"title": "New Title"},
            auth_identity="test",
            slugify_fn=_slugify,
            db=db,
            extract_scholarship_slugs_fn=extract,
            validate_scholarship_slugs_fn=validate,
            sync_blog_scholarship_tags_fn=sync_tags,
            compute_reading_time_fn=read_time,
        )
        assert sample_post.slug.startswith("new-title-")
        assert sample_post.slug != "new-title"

    async def test_body_change_validates_scholarship_slugs(self, db, sample_post):
        extract = MagicMock(return_value=["bad-slug"])
        validate = AsyncMock(return_value={"invalid": ["bad-slug"], "suggestions": {}})
        sync_tags = AsyncMock()
        read_time = MagicMock(return_value=3)

        changed, invalid = await apply_blog_post_changes(
            sample_post,
            {"body": "body with @[scholarship:bad-slug]"},
            auth_identity="test",
            slugify_fn=_slugify,
            db=db,
            extract_scholarship_slugs_fn=extract,
            validate_scholarship_slugs_fn=validate,
            sync_blog_scholarship_tags_fn=sync_tags,
            compute_reading_time_fn=read_time,
        )
        assert invalid == ["bad-slug"]
        # Body not written because validation failed.
        assert sample_post.body == "Original body"
        # No commit side effects from the sync helpers.
        sync_tags.assert_not_called()

    async def test_body_change_with_valid_slugs_updates_body_and_reading_time(
        self, db, sample_post
    ):
        extract = MagicMock(return_value=["good-slug"])
        validate = AsyncMock(return_value={"invalid": [], "suggestions": {}})
        sync_tags = AsyncMock()
        read_time = MagicMock(return_value=7)

        changed, invalid = await apply_blog_post_changes(
            sample_post,
            {"body": "new body @[scholarship:good-slug]"},
            auth_identity="test",
            slugify_fn=_slugify,
            db=db,
            extract_scholarship_slugs_fn=extract,
            validate_scholarship_slugs_fn=validate,
            sync_blog_scholarship_tags_fn=sync_tags,
            compute_reading_time_fn=read_time,
        )
        assert changed == ["body"]
        assert invalid == []
        assert sample_post.body == "new body @[scholarship:good-slug]"
        assert sample_post.reading_time_minutes == 7
        sync_tags.assert_awaited_once()

    async def test_status_change_clears_pending_changes(self, db, sample_post):
        sample_post.pending_changes = {"old": "leftover"}
        extract, validate, sync_tags, read_time = _make_helpers()
        await apply_blog_post_changes(
            sample_post,
            {"status": "published"},
            auth_identity="test",
            slugify_fn=_slugify,
            db=db,
            extract_scholarship_slugs_fn=extract,
            validate_scholarship_slugs_fn=validate,
            sync_blog_scholarship_tags_fn=sync_tags,
            compute_reading_time_fn=read_time,
        )
        assert sample_post.status == "published"
        # Leaving pending_review clears the diff.
        assert sample_post.pending_changes is None

    async def test_status_set_to_pending_review_keeps_pending_changes(
        self, db, sample_post
    ):
        extract, validate, sync_tags, read_time = _make_helpers()
        changed, _ = await apply_blog_post_changes(
            sample_post,
            {"status": "pending_review", "excerpt": "new excerpt"},
            auth_identity="editor@x.com",
            slugify_fn=_slugify,
            db=db,
            extract_scholarship_slugs_fn=extract,
            validate_scholarship_slugs_fn=validate,
            sync_blog_scholarship_tags_fn=sync_tags,
            compute_reading_time_fn=read_time,
        )
        assert "status" in changed
        assert "excerpt" in changed
        assert sample_post.pending_changes is not None
        assert sample_post.pending_changes["edited_via"] == "mcp:editor@x.com"
        assert sample_post.pending_changes["changed_fields"] == changed

    async def test_live_post_edited_without_status_reverts_to_pending(
        self, db, sample_post
    ):
        sample_post.status = "published"
        extract, validate, sync_tags, read_time = _make_helpers()
        changed, _ = await apply_blog_post_changes(
            sample_post,
            {"excerpt": "new excerpt"},
            auth_identity="test",
            slugify_fn=_slugify,
            db=db,
            extract_scholarship_slugs_fn=extract,
            validate_scholarship_slugs_fn=validate,
            sync_blog_scholarship_tags_fn=sync_tags,
            compute_reading_time_fn=read_time,
        )
        assert "status→pending_review" in changed
        assert sample_post.status == "pending_review"
        # And the diff is tracked.
        assert sample_post.pending_changes is not None

    async def test_draft_edit_does_not_implicitly_revert(self, db, sample_post):
        sample_post.status = "draft"
        extract, validate, sync_tags, read_time = _make_helpers()
        changed, _ = await apply_blog_post_changes(
            sample_post,
            {"excerpt": "updated"},
            auth_identity="test",
            slugify_fn=_slugify,
            db=db,
            extract_scholarship_slugs_fn=extract,
            validate_scholarship_slugs_fn=validate,
            sync_blog_scholarship_tags_fn=sync_tags,
            compute_reading_time_fn=read_time,
        )
        # No status rollback for drafts.
        assert "status→pending_review" not in changed
        assert sample_post.status == "draft"


# ── format_blog_edit_response ──────────────────────────────────────


class TestFormatBlogEditResponse:
    def test_includes_basic_fields(self, db, sample_post):
        sample_post.updated_fields = ["title"]  # not a column; just for read
        data = format_blog_edit_response(sample_post, ["title"])
        assert data["id"] == str(sample_post.id)
        assert data["title"] == sample_post.title
        assert data["slug"] == sample_post.slug
        assert data["updated_fields"] == ["title"]
        # No pending_review note when status is draft.
        assert "note" not in data

    async def test_includes_note_when_pending_review(self, db, sample_post):
        sample_post.status = "pending_review"
        data = format_blog_edit_response(sample_post, ["excerpt"])
        assert "note" in data
        assert "tracked changes" in data["note"]
        assert "admin will review" in data["note"]
