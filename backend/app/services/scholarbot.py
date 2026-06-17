"""
Scholara — AI scholarship advisor powered by BluesMinds GPT-5.5.

Unified with the agent service for consistent LLM backend.
"""
from typing import Optional
import json


SCHOLARA_SYSTEM = """
You are Scholara, an expert scholarship advisor built into ScholarshipRight.
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
    agent_api_key: str,
    agent_base_url: str = "https://api.bluesminds.com/v1",
    model: str = "gpt-5.5",
) -> str:
    """Get a response from Scholara using BluesMinds API."""
    import httpx

    system_prompt = SCHOLARA_SYSTEM.format(
        profile_json=profile_json,
        scholarships_json=scholarships_json,
    )

    messages = [{"role": "system", "content": system_prompt}]
    for msg in conversation_history:
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": message})

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            f"{agent_base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {agent_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": messages,
                "temperature": 0.7,
                "max_tokens": 2048,
            },
        )
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"]


async def get_scholarbot_stream(
    message: str,
    conversation_history: list[dict],
    profile_json: str,
    scholarships_json: str,
    agent_api_key: str,
    agent_base_url: str = "https://api.bluesminds.com/v1",
    model: str = "gpt-5.5",
):
    """Stream a response from Scholara using BluesMinds API."""
    import httpx

    system_prompt = SCHOLARA_SYSTEM.format(
        profile_json=profile_json,
        scholarships_json=scholarships_json,
    )

    messages = [{"role": "system", "content": system_prompt}]
    for msg in conversation_history:
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": message})

    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream(
            "POST",
            f"{agent_base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {agent_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": messages,
                "temperature": 0.7,
                "max_tokens": 2048,
                "stream": True,
            },
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    data_str = line[6:]
                    if data_str.strip() == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data_str)
                        delta = chunk["choices"][0].get("delta", {})
                        if "content" in delta:
                            yield delta["content"]
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue
