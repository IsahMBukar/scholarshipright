"""Shared utility functions for blog operations."""
import math
import re


def slugify(title: str) -> str:
    """Generate URL-friendly slug from title."""
    s = title.lower().strip()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[\s_]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s[:280]


def reading_time(body: str) -> int:
    """Estimate reading time in minutes (200 wpm)."""
    words = len(body.split())
    return max(1, math.ceil(words / 200))
