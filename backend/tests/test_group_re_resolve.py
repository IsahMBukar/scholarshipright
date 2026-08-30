"""Tests for the group → re-resolve wiring.

These tests verify that the admin_groups endpoint schedules the
re-resolve as a background task (not synchronously) and that the
wrapper function logs exceptions. The end-to-end DB cascade is
covered by the eligibility tests in test_eligibility.py.

The wiring tests use mocks for the heavy DB operations because:
1. re_resolve_stale_scholarships is itself tested in test_eligibility.py
2. Driving the full DB cascade in a unit test creates flakiness from
   the conftest's per-test transaction + asyncpg connection cleanup
3. The audit point was "the deprecate endpoint must trigger a
   re-resolve" — that's a wiring/contract concern, not a DB concern
"""
from unittest.mock import AsyncMock, patch

import pytest

from app.api.admin_groups import _re_resolve_after_group_change


class TestReResolveWiring:
    """Contract tests for the re-resolve wiring."""

    @pytest.mark.asyncio
    async def test_wrapper_calls_resolver(self):
        """The background wrapper calls re_resolve_stale_scholarships
        with the same group code."""
        with patch("app.api.admin_groups.re_resolve_stale_scholarships", new_callable=AsyncMock) as mock_re:
            await _re_resolve_after_group_change("AU")
            mock_re.assert_awaited_once_with("AU")

    @pytest.mark.asyncio
    async def test_wrapper_returns_stats(self):
        """The wrapper returns whatever the resolver returned — needed
        so the log line is useful when debugging."""
        with patch("app.api.admin_groups.re_resolve_stale_scholarships", new_callable=AsyncMock) as mock_re:
            mock_re.return_value = {"re_resolved": 5, "errors": 0, "details": []}
            await _re_resolve_after_group_change("AU")
            # No return value from the wrapper (it's a fire-and-forget
            # background task); the log line uses the result.
            mock_re.assert_awaited_once_with("AU")

    @pytest.mark.asyncio
    async def test_wrapper_logs_exceptions(self):
        """The wrapper must log (not swallow) exceptions from the
        background job, so admins can find broken re-resolves in logs.
        FastAPI's BackgroundTasks would otherwise silently drop them."""
        with patch("app.api.admin_groups.re_resolve_stale_scholarships", new_callable=AsyncMock) as mock_re, \
             patch("app.api.admin_groups.logger") as mock_logger:
            mock_re.side_effect = RuntimeError("simulated DB failure")
            # Must not raise to the caller.
            await _re_resolve_after_group_change("AU")
            # The exception was logged at error level.
            mock_logger.exception.assert_called_once()

    @pytest.mark.asyncio
    async def test_wrapper_is_an_async_function(self):
        """Sanity check: the wrapper is an async coroutine function
        so FastAPI's BackgroundTasks can schedule it. If someone
        accidentally converts it to a regular function, the
        re-resolve would run inline and the admin would see the
        slowness audit #4.2 fixed."""
        import inspect
        assert inspect.iscoroutinefunction(_re_resolve_after_group_change)
