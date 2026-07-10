"""Database query helpers."""


def escape_like(value: str) -> str:
    """Escape SQL LIKE special characters (%, _, \\) in user input.

    Prevents ILIKE wildcard injection where users could pass '%' to match
    all rows or '_' to match single characters.
    """
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
