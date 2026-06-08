"""
ScholarBot — AI scholarship advisor powered by Claude.

Uses the user's profile and top matched scholarships to provide
grounded, accurate scholarship recommendations and advice.
"""
from typing import Optional
import json


SCHOLARBOT_SYSTEM = """
You are ScholarBot, an expert scholarship advisor built into ScholarshipRight.
You help users find, understand, and apply for fully funded international scholarships.

Your user's profile:
{profile_json}

Available scholarships (filtered by relevance):
{scholarships_json}

Your capabilities:
- Recommend scholarships from the database based on user's profile
- Explain eligibility, deadlines, and what each scholarship covers
- Help draft Statements of Purpose (SOP), motivation letters, research proposals
- Answer questions about scholarship processes (IELTS waivers, referee letters, etc.)
- Compare multiple scholarships side by side
- Set realistic expectations about competitiveness

Rules:
- Only reference scholarships that exist in the provided list
- Never invent scholarship names, deadlines, or URLs
- Always mention the official deadline when recommending a scholarship
- Be concise but complete — users are busy students
- If a user asks about a scholarship not in the list, say you don't have that one indexed yet and direct them to the official site
- For SOP/writing help, ask for the specific scholarship and program before drafting
"""


async def get_scholarbot_response(
    message: str,
    conversation_history: list[dict],
    profile_json: str,
    scholarships_json: str,
    anthropic_api_key: str,
    model: str = "claude-sonnet-4-20250514",
) -> str:
    """Get a response from ScholarBot using Claude API."""
    import anthropic

    client = anthropic.AsyncAnthropic(api_key=anthropic_api_key)

    system_prompt = SCHOLARBOT_SYSTEM.format(
        profile_json=profile_json,
        scholarships_json=scholarships_json,
    )

    # Build message history
    messages = []
    for msg in conversation_history:
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": message})

    response = await client.messages.create(
        model=model,
        max_tokens=2048,
        system=system_prompt,
        messages=messages,
    )

    return response.content[0].text


async def get_scholarbot_stream(
    message: str,
    conversation_history: list[dict],
    profile_json: str,
    scholarships_json: str,
    anthropic_api_key: str,
    model: str = "claude-sonnet-4-20250514",
):
    """Stream a response from ScholarBot using Claude API."""
    import anthropic

    client = anthropic.AsyncAnthropic(api_key=anthropic_api_key)

    system_prompt = SCHOLARBOT_SYSTEM.format(
        profile_json=profile_json,
        scholarships_json=scholarships_json,
    )

    messages = []
    for msg in conversation_history:
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": message})

    async with client.messages.stream(
        model=model,
        max_tokens=2048,
        system=system_prompt,
        messages=messages,
    ) as stream:
        async for text in stream.text_stream:
            yield text
