"""Batch embed all scholarships using TF-IDF (instant, no download)."""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.models.scholarship import Scholarship
from app.services.embeddings import generate_embedding, scholarship_to_text


async def embed_scholarships():
    print("Using TF-IDF embeddings (384-dim, instant).\n")

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Scholarship))
        scholarships = result.scalars().all()

        print(f"Found {len(scholarships)} scholarships to embed.\n")

        for i, sch in enumerate(scholarships):
            text = scholarship_to_text(sch)
            embedding = generate_embedding(text)
            sch.embedding = embedding
            print(f"  [{i+1}/{len(scholarships)}] Embedded: {sch.name}")

        await session.commit()
        print(f"\n✅ Embedded {len(scholarships)} scholarships (384-dim each).")


if __name__ == "__main__":
    asyncio.run(embed_scholarships())
