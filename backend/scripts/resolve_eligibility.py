"""CLI script to resolve eligibility for all scholarships.

Usage:
    cd backend && source venv/bin/activate
    python -m scripts.resolve_eligibility
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.eligibility import resolve_all_scholarships


async def main():
    print("Resolving eligibility for all scholarships...")
    result = await resolve_all_scholarships()
    print(f"  Total:     {result['total']}")
    print(f"  Resolved:  {result['resolved']}")
    print(f"  Unresolved:{result['unresolved']}")
    print(f"  Errors:    {result['errors']}")


if __name__ == "__main__":
    asyncio.run(main())
