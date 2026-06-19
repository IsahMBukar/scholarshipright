"""
Scholara Agent — AI scholarship advisor with app-level tool calling, real SSE
streaming, and conversation memory.

Design rule: single LLM call per request. Scholara deterministically gathers the
right database context with tools first, then sends exactly one model request.
This gives the UI visible tool/status events without needing a multi-call LLM
function-calling loop.
"""
import asyncio
import json
import re
from typing import AsyncGenerator, Optional
from uuid import UUID

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.services.agent_tools import execute_tool, get_tool_definitions
from app.services.agent_errors import (
    AgentError,
    DB_TIMEOUT,
    DB_UNAVAILABLE,
    INTERNAL_ERROR,
    LLM_AUTH,
    LLM_BAD_RESPONSE,
    LLM_CONNECTION,
    LLM_EMPTY_RESPONSE,
    LLM_MALFORMED_JSON,
    LLM_RATE_LIMIT,
    LLM_TIMEOUT,
    RESUME_MISSING,
    SCHOLARSHIP_NOT_FOUND,
    STREAM_INTERRUPTED,
    TOOL_EMPTY,
    TOOL_FAILED,
    classify_db_error,
    classify_httpx_error,
    make as make_agent_error,
    user_message as agent_user_message,
)


LLM_CHAT_TIMEOUT = 60.0  # non-stream completions
LLM_STREAM_TIMEOUT = 180.0  # streamed chat (SSE)

# Cap on how many LLM↔tool round-trips we'll do per request. Bounds
# cost and prevents infinite loops if the model gets stuck in a
# tool-calling loop. Each round is one full LLM call + N tool
# executions, so 3 rounds = up to 3 LLM calls per request.
AGENT_MAX_TOOL_ROUNDS = 3


def _is_resume_missing_error(result: dict) -> bool:
    err = (result or {}).get("error") or ""
    return "no resume found" in err.lower() or "user needs to upload a resume" in err.lower()


def _is_scholarship_not_found(result: dict) -> bool:
    err = (result or {}).get("error") or ""
    return "scholarship not found" in err.lower()


def _tag_tool_result(name: str, result: dict) -> dict:
    """Normalize tool output into {ok, name, data, error, message}."""
    if not isinstance(result, dict):
        return {"ok": True, "name": name, "data": result, "empty": not result}

    # A tool returned a structured failure when ok=False or it has only `error`/`empty` keys.
    is_failure = result.get("ok") is False or (
        "error" in result and not any(k for k in result.keys() if k not in {"ok", "error", "empty", "message"})
    )
    if is_failure:
        err_text = str(result.get("error") or "")
        if _is_resume_missing_error({"error": err_text}):
            return {"ok": False, "name": name, "error_code": RESUME_MISSING, "data": None, "user_message": agent_user_message(RESUME_MISSING)}
        if _is_scholarship_not_found({"error": err_text}):
            return {"ok": False, "name": name, "error_code": SCHOLARSHIP_NOT_FOUND, "data": None, "user_message": agent_user_message(SCHOLARSHIP_NOT_FOUND)}
        return {"ok": False, "name": name, "error_code": TOOL_FAILED, "data": None, "user_message": agent_user_message(TOOL_FAILED), "technical": err_text[:200]}

    empty = False
    for key in ("matches", "scholarships", "saved", "data"):
        value = result.get(key)
        if isinstance(value, list) and len(value) == 0:
            empty = True
            break
    if not empty and result.get("count") == 0 and not any(
        isinstance(result.get(k), list) for k in ("matches", "scholarships", "saved", "data")
    ):
        empty = True

    return {"ok": True, "name": name, "data": result, "empty": empty}


def _summarize_tool_results(tool_results: list[dict]) -> dict:
    """Build a small summary of tool results so the LLM knows what failed/empty."""
    failures: list[dict] = []
    empties: list[str] = []
    for tr in tool_results or []:
        if not tr.get("ok"):
            failures.append({"name": tr.get("name") or "", "code": tr.get("error_code"), "user_message": tr.get("user_message")})
        elif tr.get("empty"):
            empties.append(tr.get("name") or "")
    return {"failures": failures, "empties": empties}


def _is_llm_configured() -> bool:
    try:
        settings = get_settings()
    except Exception:  # noqa: BLE001
        return False
    return bool(settings.resolved_llm_api_key)


AGENT_SYSTEM_PROMPT = """You are Scholara, an expert AI scholarship advisor built into ScholarshipRight.

You receive verified tool results from ScholarshipRight's database before you answer.
Use ONLY those tool results for user-specific facts such as profile, resume, saved
scholarships, match scores, eligibility requirements, deadlines, and URLs. If a
field is missing, say it is missing instead of inventing it.

## Capabilities
- Check eligibility for scholarships by comparing user profile/resume against requirements
- Assess application readiness and missing documents
- Generate career roadmaps to become eligible for target scholarships
- Discover opportunities using profile, resume, matches, saved status, and scholarship search
- Draft application documents tailored to the user and scholarship
- Answer general scholarship/study-abroad questions with personalized next steps

## Response style
- Specific, practical, honest, and formatted for the chat UI.
- For action=chat, use clean Markdown: short heading, bullets, bold scholarship names, match/deadline/funding lines, and a clear next-step section.
- Mention actual scholarship names, deadlines, countries, funding, and URLs only when they are present in tool results.
- Explain what data was checked, but do not expose hidden chain-of-thought. Use concise reasoning summaries.
- If tools returned errors or empty data, explain what the user needs to complete.
- Never hardcode scholarship examples. Recommend only scholarships found in verified tool results.

## JSON formats for structured actions
For action=eligibility, respond as JSON only:
{"type":"eligibility","eligible":true,"match_score":85,"requirements_met":[{"requirement":"...","status":"met","detail":"..."}],"requirements_missing":[{"requirement":"...","status":"missing","detail":"...","action":"..."}],"summary":"..."}

For action=readiness, respond as JSON only:
{"type":"readiness","overall_score":78,"sections":[{"name":"CV","score":85,"status":"strong","feedback":"..."}],"missing_documents":[{"name":"...","importance":"critical","description":"..."}],"improvements":[{"area":"...","suggestion":"...","impact":"high"}],"summary":"..."}

For action=roadmap, respond as JSON only:
{"type":"roadmap","current_eligibility":false,"estimated_months":14,"milestones":[{"month":1,"action":"...","category":"experience","completed":false}],"alternative_scholarships":[{"name":"...","reason":"..."}],"summary":"..."}

For action=discover, respond as JSON only:
{"type":"discover","opportunities":[{"name":"...","type":"scholarship","match_reason":"...","estimated_match":75,"slug":"..."}],"insights":"..."}

For action=generate, respond as JSON only:
{"type":"document","document_type":"sop","content":"...","notes":"...","word_count":500}

For action=chat, respond in plain text unless the user explicitly requests structured output.
"""


TOOL_STATUS = {
    "get_user_profile": "Checking your academic profile",
    "get_user_resume": "Reviewing your resume/CV",
    "search_scholarships": "Searching scholarship database",
    "get_scholarship_detail": "Reading scholarship requirements",
    "get_user_matches": "Loading your top scholarship matches",
    "get_saved_scholarships": "Checking your saved applications",
}


def _want(message: str, *terms: str) -> bool:
    text = (message or "").lower()
    return any(term in text for term in terms)


def _intent_flags(message: str, action: str, scholarship_id: Optional[str], document_type: Optional[str]) -> dict[str, bool]:
    """Classify request intent with lightweight rules so we only load needed tools."""
    text = (message or "").lower()

    scholarship_terms = (
        "scholarship", "scholarships", "opportunity", "opportunities", "funding",
        "funded", "fully funded", "grant", "fellowship", "recommend", "suggest",
        "match", "matches", "best", "top", "deadline", "apply", "application",
    )
    profile_terms = (
        "my profile", "my degree", "my cgpa", "my gpa", "my field", "my country",
        "ielts", "am i", "for me", "my chance", "my chances", "eligible", "eligibility",
    )
    resume_terms = (
        "resume", "cv", "portfolio", "experience", "skills", "publication",
        "research", "project", "readiness", "document", "sop", "statement of purpose",
        "motivation", "cover letter", "proposal", "strong", "weak", "gap", "improve",
    )
    search_terms = (
        "search", "find", "show me", "list", "browse", "usa", "uk", "canada",
        "germany", "china", "europe", "masters", "master", "phd", "bachelor",
    )
    saved_terms = ("saved", "bookmarked", "my applications", "application status", "applied")

    asks_scholarship = _want(text, *scholarship_terms) or action in {"discover", "eligibility", "readiness", "roadmap", "generate"}
    asks_profile = _want(text, *profile_terms) or " my " in f" {text} " or "for me" in text or action != "chat"
    asks_resume = _want(text, *resume_terms) or action in {"eligibility", "readiness", "roadmap", "generate", "discover"}
    asks_matches = asks_scholarship and (
        _want(text, "best", "top", "match", "matches", "recommend", "suggest", "for me", "my chance", "eligible")
        or action in {"discover", "readiness"}
    )
    asks_search = _want(text, *search_terms) or action == "discover"
    asks_saved = _want(text, *saved_terms)

    return {
        "profile": bool(asks_profile or asks_matches or scholarship_id),
        "resume": bool(asks_resume or asks_matches),
        "matches": bool(asks_matches),
        "search": bool(asks_search and not asks_matches),
        "saved": bool(asks_saved or action == "discover"),
        "detail": bool(scholarship_id),
    }


def _tool_plan(
    message: str,
    action: Optional[str] = None,
    scholarship_id: Optional[str] = None,
    document_type: Optional[str] = None,
) -> list[dict]:
    """Build a minimal, dynamic tool plan so each request still uses one LLM call."""
    action = action or "chat"
    plan: list[dict] = []

    def add(name: str, arguments: Optional[dict] = None):
        key = (name, json.dumps(arguments or {}, sort_keys=True))
        if key not in {(p["name"], json.dumps(p.get("arguments", {}), sort_keys=True)) for p in plan}:
            plan.append({"name": name, "arguments": arguments or {}})

    flags = _intent_flags(message, action, scholarship_id, document_type)

    if flags["profile"]:
        add("get_user_profile")
    if flags["resume"]:
        add("get_user_resume")
    if flags["detail"]:
        add("get_scholarship_detail", {"scholarship_id": scholarship_id})
    if flags["matches"]:
        add("get_user_matches", {"limit": 8 if action == "chat" else 10})
    if flags["search"]:
        add("search_scholarships", {"query": message[:180], "limit": 10})
    if flags["saved"]:
        add("get_saved_scholarships")

    return plan


def _action_prompt(
    message: str,
    action: Optional[str],
    scholarship_id: Optional[str],
    document_type: Optional[str],
    tool_results_blob,
) -> str:
    action = action or "chat"
    if isinstance(tool_results_blob, str):
        tool_results_text = tool_results_blob
    else:
        tool_results_text = json.dumps(tool_results_blob, indent=2, default=str)
    return f"""Current action: {action}
Scholarship ID/slug selected: {scholarship_id or "none"}
Document type selected: {document_type or "none"}

User request:
{message}

Verified tool results:
{tool_results_text}

Instructions:
- Base your answer on the verified tool results above.
- If a tool returned an error or empty data, explain what the user needs to complete using the user_message from that tool.
- If action is eligibility/readiness/roadmap/discover/generate, return ONLY valid JSON matching the required schema.
- If action is chat, answer naturally in text with concise reasoning summaries and concrete next steps.
- Never invent scholarship names, deadlines, scores, or URLs. Only use values that appeared in the tool results.
"""


def _messages(
    prompt: str,
    conversation_history: Optional[list[dict]] = None,
) -> list[dict]:
    msgs = [{"role": "system", "content": AGENT_SYSTEM_PROMPT}]
    for msg in (conversation_history or [])[-12:]:
        role = msg.get("role")
        content = msg.get("content")
        if role in {"user", "assistant"} and content:
            msgs.append({"role": role, "content": str(content)[:4000]})
    msgs.append({"role": "user", "content": prompt})
    return msgs


def _llm_request_body(
    messages: list[dict],
    stream: bool = False,
    tools: Optional[list[dict]] = None,
    tool_choice: Optional[str] = None,
) -> dict:
    """Build the OpenAI-compatible chat-completions request body.

    The 0G AI router proxies to `minimax-m3` (a reasoning model). It accepts
    `enable_thinking: false` to suppress inline `<think>...</think>` blocks;
    we send it as defense in depth and also strip them at the response layer
    in case the model ignores the flag.

    When `tools` is provided, the LLM can return `tool_calls` in its
    response message instead of (or before) a final `content` reply. We
    use OpenAI's `tool_choice="auto"` by default, which lets the model
    decide whether to call a tool or answer directly.
    """
    settings = get_settings()
    body: dict = {
        "model": settings.resolved_llm_model,
        "messages": messages,
        "temperature": 0.4,
        "max_tokens": 4096,
        "stream": stream,
        "enable_thinking": False,
    }
    if tools:
        body["tools"] = tools
        body["tool_choice"] = tool_choice or "auto"
    return body


def _extract_tool_calls(message: dict) -> list[dict]:
    """Extract tool calls from an LLM response message.

    Returns a list of dicts with keys:
      - id: tool call id (so we can send results back)
      - name: tool name
      - arguments: parsed dict (or {} on parse failure)

    The OpenAI format is:
      message.tool_calls = [
        {"id": "call_abc", "type": "function",
         "function": {"name": "...", "arguments": "{json}"}},
        ...
      ]
    """
    calls = message.get("tool_calls") or []
    out: list[dict] = []
    for call in calls:
        fn = call.get("function") or {}
        name = fn.get("name") or ""
        raw_args = fn.get("arguments") or ""
        try:
            args = json.loads(raw_args) if isinstance(raw_args, str) else (raw_args or {})
        except json.JSONDecodeError:
            args = {}
        out.append({"id": call.get("id") or "", "name": name, "arguments": args})
    return out


async def _llm_call_with_tools(
    messages: list[dict],
    tools: list[dict],
) -> tuple[Optional[dict], Optional[AgentError]]:
    """Non-streaming LLM call that returns either a parsed payload
    (with possible `tool_calls`) or a structured AgentError.

    The returned payload shape (on success) is the full OpenAI response
    JSON so the caller can inspect both `message.content` and
    `message.tool_calls`. The `reasoning_content` field is preserved
    for the caller to surface in the SSE stream.
    """
    if not _is_llm_configured():
        return None, make_agent_error(LLM_AUTH, technical="llm_api_key missing", retryable=False)

    settings = get_settings()
    body = _llm_request_body(messages, stream=False, tools=tools)
    try:
        async with httpx.AsyncClient(timeout=LLM_CHAT_TIMEOUT) as client:
            response = await client.post(
                f"{settings.resolved_llm_base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.resolved_llm_api_key}",
                    "Content-Type": "application/json",
                },
                content=json.dumps(body),
            )
            response.raise_for_status()
            # Some routers return chunked transfer-encoding even for
            # non-stream requests; force a full read before .json().
            await response.aread()
            payload = response.json()
    except httpx.HTTPError as e:
        return None, classify_httpx_error(e)
    except Exception as e:  # noqa: BLE001
        return None, classify_httpx_error(e)

    try:
        message = (payload.get("choices") or [{}])[0].get("message", {}) or {}
    except (AttributeError, IndexError, TypeError):
        return None, make_agent_error(LLM_BAD_RESPONSE, technical="missing choices[0].message")

    return {"message": message, "raw": payload}, None


def _extract_delta(chunk: dict) -> tuple[str, str]:
    """Return (visible_content, reasoning_content) for a single SSE chunk.

    Different routers expose chain-of-thought in either `delta.reasoning_content`
    (DeepSeek) or `delta.reasoning` (StepFun / other routers). We surface it as a
    `thinking` SSE event so the UI can show a "Scholara is thinking..." indicator.
    """
    try:
        choice = chunk.get("choices", [{}])[0]
        delta = choice.get("delta") or {}
        content = delta.get("content") or ""
        reasoning = delta.get("reasoning_content") or delta.get("reasoning") or ""
        return content, reasoning
    except Exception:
        return "", ""


class _ThinkStripper:
    """Buffer streaming `content` chunks and suppress think-block content.

    Different models and routers emit different tag styles
    (`<think>...</think>`, `<think>...</think>`, `...`).
    Some models also emit an orphan closing tag (`</think>` or
    `</think>`) in `content` with no matching opener in the same
    field — the matching opener lives in the separate
    `reasoning_content` stream. In that case everything before
    the closing tag in `content` should be suppressed, since
    the model's "real" answer starts after the closing tag.

    A chunk can split a tag across two calls, so we keep a small
    tail buffer when not inside a think block. `flush()` returns
    any trailing visible text at end-of-stream; unclosed think
    blocks are dropped.
    """

    _OPEN_TAGS = ("<think>", "<think>")
    _CLOSE_TAGS = ("</think>", "</think>")
    _ALL_TAGS = _OPEN_TAGS + _CLOSE_TAGS
    _MAX_TAG_LEN = max(len(t) for t in _ALL_TAGS)

    def __init__(self) -> None:
        self._buf = ""
        self._in = False

    def _earliest(self, *tags: str) -> tuple[int, str] | None:
        """Return (idx, tag) of the earliest occurrence of any of `tags`
        in `self._buf`, or None if no tag is present.
        """
        best_idx = -1
        best_tag = ""
        for t in tags:
            i = self._buf.find(t)
            if i != -1 and (best_idx == -1 or i < best_idx):
                best_idx = i
                best_tag = t
        if best_idx == -1:
            return None
        return best_idx, best_tag

    def feed(self, chunk: str) -> str:
        if not chunk:
            return ""
        self._buf += chunk
        out: list[str] = []
        while True:
            if not self._in:
                # Look for the earliest open or close tag. If we see
                # a close tag before any open tag, the model emitted
                # an orphan close (its opener was in the
                # `reasoning_content` stream). Treat everything
                # before the close tag as thinking content and
                # drop it.
                found = self._earliest(*self._ALL_TAGS)
                if found is None:
                    # No tag yet. Keep a tail the size of the longest
                    # possible tag so a split tag isn't emitted as
                    # content.
                    if len(self._buf) > self._MAX_TAG_LEN:
                        safe, self._buf = self._buf[:-self._MAX_TAG_LEN], self._buf[-self._MAX_TAG_LEN:]
                        out.append(safe)
                    return "".join(out)
                idx, tag = found
                if tag in self._OPEN_TAGS:
                    # Emit everything before the open tag (visible)
                    out.append(self._buf[:idx])
                    self._buf = self._buf[idx + len(tag):]
                    self._in = True
                else:
                    # Orphan close tag: drop everything before it
                    # (it was the trailing tail of the model's
                    # chain-of-thought, which lives in
                    # `reasoning_content`). Everything after the
                    # close tag is visible.
                    self._buf = self._buf[idx + len(tag):]
            else:
                # In-think: look for any close tag.
                found = self._earliest(*self._CLOSE_TAGS)
                if found is None:
                    if len(self._buf) > self._MAX_TAG_LEN:
                        self._buf = self._buf[-self._MAX_TAG_LEN:]
                    return "".join(out)
                idx, tag = found
                self._buf = self._buf[idx + len(tag):]
                self._in = False
        return "".join(out)

    def flush(self) -> str:
        """Return any remaining visible text. Drop unclosed think blocks."""
        if self._in:
            self._buf = ""
            self._in = False
            return ""
        out = self._buf
        self._buf = ""
        return out


_THINK_BLOCK_RES = [
    # Shorter tag first so the regex doesn't greedily eat the
    # leading `<think>` of a longer `<think>` pair.
    re.compile(r"<think>.*?</think>", re.DOTALL),
    re.compile(r"<think>.*?</think>", re.DOTALL),
]


def _strip_think_blocks(text: str) -> str:
    """Remove any think-block tags from a final (non-streamed) text.

    Handles `<think>...</think>`, `<think>...</think>`, and
    orphan `...` / `...` (a close tag with no matching opener
    in the same field — the opener was in the separate
    `reasoning_content` stream).
    """
    if not text:
        return text
    for rx in _THINK_BLOCK_RES:
        text = rx.sub("", text)
    # Orphan closing tag with no matching opener: drop everything
    # before the first such tag (it was the trailing tail of the
    # model's chain-of-thought, which lives in `reasoning_content`).
    for close_tag in _ThinkStripper._CLOSE_TAGS:
        idx = text.find(close_tag)
        if idx != -1 and not any(text[:idx].rfind(o) != -1 for o in _ThinkStripper._OPEN_TAGS):
            text = text[idx + len(close_tag):]
    return text.strip()


async def _run_tools(
    plan: list[dict],
    db: AsyncSession,
    user_id: UUID,
) -> AsyncGenerator[dict, None]:
    """Yield tool_call/tool_result events with tagged, error-aware payloads."""
    for item in plan:
        name = item["name"]
        arguments = item.get("arguments") or {}
        yield {"event": "tool_call", "data": {"name": name, "arguments": arguments, "status": TOOL_STATUS.get(name, f"Using {name}")}}
        try:
            result = await execute_tool(name, arguments, db, user_id)
        except Exception as e:  # noqa: BLE001
            yield {"event": "tool_result", "data": {"ok": False, "name": name, "error_code": TOOL_FAILED, "user_message": agent_user_message(TOOL_FAILED), "technical": str(e)[:200]}}
            continue

        tagged = _tag_tool_result(name, result or {})
        yield {"event": "tool_result", "data": tagged}


async def _collect_tools(plan: list[dict], db: AsyncSession, user_id: UUID) -> list[dict]:
    results: list[dict] = []
    for item in plan:
        try:
            result = await execute_tool(item["name"], item.get("arguments") or {}, db, user_id)
            results.append(_tag_tool_result(item["name"], result or {}))
        except Exception as e:  # noqa: BLE001
            results.append({"ok": False, "name": item.get("name"), "error_code": TOOL_FAILED, "user_message": agent_user_message(TOOL_FAILED), "technical": str(e)[:200]})
    return results


def _render_for_llm(tool_results: list[dict]) -> str:
    """Render tagged tool results into a single prompt section for the LLM."""
    summary = _summarize_tool_results(tool_results)
    rendered = []
    for tr in tool_results or []:
        if tr.get("ok"):
            rendered.append({"name": tr.get("name"), "data": tr.get("data")})
        else:
            rendered.append({"name": tr.get("name"), "error": True, "code": tr.get("error_code"), "user_message": tr.get("user_message")})
    return json.dumps({"results": rendered, "summary": summary}, indent=2, default=str)


async def _stream_llm_answer(messages: list[dict]) -> AsyncGenerator[dict, None]:
    """Stream a final user-visible answer from the LLM (token-by-token).

    Currently used as a fallback when the LLM's `content` is empty
    but its `tool_calls` are also empty — we re-issue a streaming
    call so the user still sees something. Most of the time
    `stream_agent_response` uses the content from the non-streaming
    tool-loop call directly.
    """
    settings = get_settings()
    think_stripper = _ThinkStripper()
    in_thinking_phase = True
    full_response = ""
    stream_error: Optional[AgentError] = None

    try:
        async with httpx.AsyncClient(timeout=LLM_STREAM_TIMEOUT) as client:
            try:
                async with client.stream(
                    "POST",
                    f"{settings.resolved_llm_base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {settings.resolved_llm_api_key}",
                        "Content-Type": "application/json",
                    },
                    content=json.dumps(_llm_request_body(messages, stream=True)),
                ) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line or not line.startswith("data:"):
                            continue
                        payload = line[5:].strip()
                        if payload == "[DONE]":
                            break
                        try:
                            content_delta, reasoning_delta = _extract_delta(json.loads(payload))
                        except json.JSONDecodeError:
                            continue
                        if reasoning_delta:
                            yield {"event": "thinking", "data": reasoning_delta}
                            continue
                        if in_thinking_phase:
                            in_thinking_phase = False
                            yield {"event": "thinking", "data": "Drafting the answer..."}
                        if content_delta:
                            visible = think_stripper.feed(content_delta)
                            if visible:
                                full_response += visible
                                yield {"event": "token", "data": visible}
            except httpx.HTTPError as e:
                stream_error = classify_httpx_error(e)
            except (asyncio.CancelledError, GeneratorExit):
                stream_error = make_agent_error(STREAM_INTERRUPTED, technical="client disconnected", retryable=True)
    except Exception as e:  # noqa: BLE001
        stream_error = classify_httpx_error(e)

    trailing = think_stripper.flush()
    if trailing:
        full_response += trailing
        yield {"event": "token", "data": trailing}

    if stream_error is not None:
        yield {"event": "error", "data": stream_error.to_dict()}
        return
    if not full_response.strip():
        err = make_agent_error(LLM_EMPTY_RESPONSE, technical="stream produced no tokens")
        yield {"event": "error", "data": err.to_dict()}
        return
    yield {"event": "answer_text", "data": full_response}


async def stream_agent_response(
    message: str,
    conversation_history: list[dict],
    db: AsyncSession,
    user_id: UUID,
    action: Optional[str] = None,
    scholarship_id: Optional[str] = None,
    document_type: Optional[str] = None,
    use_prefetch: bool = False,
) -> AsyncGenerator[dict, None]:
    """Stream visible reasoning/tool status + LLM-driven tool loop.

    Flow:
      1. (Optional) keyword pre-fetch — when `use_prefetch=True` (used by
         structured actions like eligibility/readiness/roadmap), seed the
         conversation with pre-fetched tool results so the LLM has the
         context it needs.
      2. Send the user message to the LLM with `tools=[...]` and
         `tool_choice="auto"`. The LLM decides which tools to call.
      3. If the LLM returns `tool_calls`, execute them, append the
         `tool` role results to the message history, and call the LLM
         again. Loop up to `AGENT_MAX_TOOL_ROUNDS` rounds.
      4. When the LLM finally returns a plain `content` (no
         `tool_calls`), stream that as the final answer.
      5. Yield `tool_call` / `tool_result` events so the chat UI can
         show "Looking up your profile..." while the agent works.
      6. Yield `error` events with a structured {code, user_message,
         retryable} payload instead of raising — the SSE response
         always closes cleanly.
    """
    if not _is_llm_configured():
        err = make_agent_error(LLM_AUTH, technical="llm_api_key missing", retryable=False)
        yield {"event": "error", "data": err.to_dict()}
        return

    tool_defs = get_tool_definitions()
    yield {"event": "thinking", "data": "Understanding your request and choosing what to check..."}

    # Build the initial message list. Optionally seed with pre-fetched
    # tool results so structured actions get all the data they need
    # on the first round (deterministic) instead of relying on the
    # LLM to figure out the right tool calls.
    messages: list[dict] = [{"role": "system", "content": AGENT_SYSTEM_PROMPT}]
    for msg in (conversation_history or [])[-12:]:
        role = msg.get("role")
        content = msg.get("content")
        if role in {"user", "assistant"} and content:
            messages.append({"role": role, "content": str(content)[:4000]})

    if use_prefetch:
        try:
            plan = _tool_plan(message, action, scholarship_id, document_type)
            seeded_results: list[dict] = []
            async for event in _run_tools(plan, db, user_id):
                yield event
                if event["event"] == "tool_result":
                    seeded_results.append(event["data"])
            # Append the seeded tool calls + results so the LLM sees them.
            messages.append({"role": "user", "content": _action_prompt(
                message, action, scholarship_id, document_type,
                _render_for_llm(seeded_results),
            )})
            # Now switch to LLM-driven mode: the LLM can call additional
            # tools if it wants more, or just answer.
        except Exception as e:  # noqa: BLE001
            err = classify_db_error(e)
            yield {"event": "error", "data": err.to_dict()}
            return
    else:
        messages.append({"role": "user", "content": message})

    # LLM-driven tool loop. Cap at AGENT_MAX_TOOL_ROUNDS to bound cost.
    for round_idx in range(AGENT_MAX_TOOL_ROUNDS):
        if round_idx > 0:
            yield {"event": "thinking", "data": f"Reviewing tool results (round {round_idx + 1})..."}

        payload, err = await _llm_call_with_tools(messages, tool_defs)
        if err is not None or payload is None:
            if err is not None:
                yield {"event": "error", "data": err.to_dict()}
            else:
                yield {"event": "error", "data": make_agent_error(LLM_BAD_RESPONSE, technical="empty payload").to_dict()}
            return

        message_obj = payload.get("message") or {}
        tool_calls = _extract_tool_calls(message_obj)

        # If the LLM didn't request any tool calls, it has its final
        # answer in `content`. Stream the rest of the conversation
        # by switching to a streaming call (this gives the UI
        # token-by-token feedback). But the answer is already in
        # `content`; emit it as a single token and finish.
        if not tool_calls:
            content = (message_obj.get("content") or "")
            content = _strip_think_blocks(content)
            reasoning = (message_obj.get("reasoning_content") or message_obj.get("reasoning") or "").strip()
            if reasoning:
                yield {"event": "thinking", "data": reasoning}
            if content.strip():
                # Emit the answer as a single token batch (the LLM
                # already gave us the full text; we don't have
                # token-level granularity without a streaming call).
                yield {"event": "token", "data": content}
            else:
                # LLM returned no content AND no tool calls — fall
                # back to a streaming call so the user sees the
                # answer build up token by token instead of seeing
                # an empty error.
                async for ev in _stream_llm_answer(messages):
                    yield ev
                    if ev.get("event") == "error":
                        return
                return
            try:
                parsed = _try_parse_json(content)
            except Exception as e:  # noqa: BLE001
                err = make_agent_error(LLM_MALFORMED_JSON, technical=str(e)[:200])
                yield {"event": "error", "data": {**err.to_dict(), "raw": content[:2000]}}
                return
            yield {"event": "done", "data": parsed}
            return

        # LLM requested tool calls. Append the assistant message with
        # the tool_calls field, then execute them and append the
        # `tool` role results.
        messages.append({
            "role": "assistant",
            "content": message_obj.get("content") or "",
            "tool_calls": [
                {
                    "id": tc["id"],
                    "type": "function",
                    "function": {
                        "name": tc["name"],
                        "arguments": json.dumps(tc["arguments"]),
                    },
                }
                for tc in tool_calls
            ],
        })

        # Execute tool calls in parallel-ish (sequential awaits — DB
        # is the bottleneck, and `_run_tools` already does dedup).
        tool_results: list[dict] = []
        for tc in tool_calls:
            name = tc["name"]
            arguments = tc["arguments"] or {}
            status = TOOL_STATUS.get(name, f"Using {name}")
            yield {"event": "tool_call", "data": {"name": name, "arguments": arguments, "status": status}}
            try:
                result = await execute_tool(name, arguments, db, user_id)
            except Exception as e:  # noqa: BLE001
                tagged = {"ok": False, "name": name, "error_code": TOOL_FAILED, "user_message": agent_user_message(TOOL_FAILED), "technical": str(e)[:200]}
            else:
                tagged = _tag_tool_result(name, result or {})
            tool_results.append(tagged)
            yield {"event": "tool_result", "data": tagged}

        # Append tool results to the message history in OpenAI format.
        for tc, tagged in zip(tool_calls, tool_results):
            # The `content` field of a tool message is a JSON string
            # of the result. We serialize the tagged result so the
            # LLM sees the same structure it would get from a
            # pre-fetched call.
            messages.append({
                "role": "tool",
                "tool_call_id": tc["id"],
                "content": json.dumps(tagged, default=str),
            })

    # If we get here, the LLM kept asking for tools beyond our cap.
    err = make_agent_error(LLM_BAD_RESPONSE, technical=f"LLM exceeded max tool rounds ({AGENT_MAX_TOOL_ROUNDS})", retryable=True)
    yield {"event": "error", "data": err.to_dict()}
    return


async def call_agent_structured(
    prompt: str,
    db: AsyncSession,
    user_id: UUID,
    conversation_history: Optional[list[dict]] = None,
    action: Optional[str] = None,
    scholarship_id: Optional[str] = None,
    document_type: Optional[str] = None,
) -> dict:
    """Non-streaming LLM-driven agent loop, used for API/backward compatibility.

    Same flow as `stream_agent_response` but without SSE. For structured
    actions (eligibility, readiness, roadmap, discover, generate), we
    pre-fetch the tools up-front so the LLM has the verified data it
    needs to produce valid JSON on the first iteration. The LLM is
    still allowed to call additional tools if it wants more.

    Returns a dict that always has a `type` key, with either a populated
    structured payload or a structured `error` envelope on failure.
    """
    if not _is_llm_configured():
        err = make_agent_error(LLM_AUTH, technical="llm_api_key missing", retryable=False)
        return {"type": action or "chat", "error": True, **err.to_dict()}

    tool_defs = get_tool_definitions()
    messages: list[dict] = [{"role": "system", "content": AGENT_SYSTEM_PROMPT}]
    for msg in (conversation_history or [])[-12:]:
        role = msg.get("role")
        content = msg.get("content")
        if role in {"user", "assistant"} and content:
            messages.append({"role": role, "content": str(content)[:4000]})

    # For structured actions, pre-fetch the data we know the LLM
    # will need. This gives the LLM the verified context on round 1
    # so its first content reply is grounded in real data and can
    # be parsed as JSON.
    try:
        plan = _tool_plan(prompt, action, scholarship_id, document_type)
        seeded_results = await _collect_tools(plan, db, user_id)
    except Exception as e:  # noqa: BLE001
        err = classify_db_error(e)
        return {"type": action or "chat", "error": True, **err.to_dict()}

    messages.append({"role": "user", "content": _action_prompt(
        prompt, action, scholarship_id, document_type,
        _render_for_llm(seeded_results),
    )})

    # LLM-driven tool loop. Same cap as the streaming path.
    for _ in range(AGENT_MAX_TOOL_ROUNDS):
        payload, err = await _llm_call_with_tools(messages, tool_defs)
        if err is not None or payload is None:
            if err is not None:
                return {"type": action or "chat", "error": True, **err.to_dict()}
            return {"type": action or "chat", "error": True, **make_agent_error(LLM_BAD_RESPONSE, technical="empty payload").to_dict()}

        message_obj = payload.get("message") or {}
        tool_calls = _extract_tool_calls(message_obj)
        if not tool_calls:
            content = (message_obj.get("content") or "")
            content = _strip_think_blocks(content)
            reasoning = (message_obj.get("reasoning_content") or message_obj.get("reasoning") or "").strip()
            if not content.strip():
                err = make_agent_error(LLM_EMPTY_RESPONSE, technical="empty content")
                return {"type": action or "chat", "error": True, **err.to_dict()}
            parsed = _try_parse_json(content)
            if reasoning:
                parsed.setdefault("reasoning", reasoning)
            return parsed

        # LLM wants more tools. Append assistant message + tool results.
        messages.append({
            "role": "assistant",
            "content": message_obj.get("content") or "",
            "tool_calls": [
                {"id": tc["id"], "type": "function", "function": {"name": tc["name"], "arguments": json.dumps(tc["arguments"])}}
                for tc in tool_calls
            ],
        })
        for tc in tool_calls:
            try:
                result = await execute_tool(tc["name"], tc.get("arguments") or {}, db, user_id)
            except Exception as e:  # noqa: BLE001
                tagged = {"ok": False, "name": tc["name"], "error_code": TOOL_FAILED, "user_message": agent_user_message(TOOL_FAILED), "technical": str(e)[:200]}
            else:
                tagged = _tag_tool_result(tc["name"], result or {})
            messages.append({"role": "tool", "tool_call_id": tc["id"], "content": json.dumps(tagged, default=str)})

    # LLM exceeded the loop cap.
    err = make_agent_error(LLM_BAD_RESPONSE, technical=f"LLM exceeded max tool rounds ({AGENT_MAX_TOOL_ROUNDS})", retryable=True)
    return {"type": action or "chat", "error": True, **err.to_dict()}


# ── Legacy prompt wrappers ───────────────────────────────────────
# These preserve old imports. New endpoints should prefer call_agent_structured.

async def check_eligibility(profile_json: str, resume_json: str, scholarship_json: str, scholarships_list: str) -> dict:
    prompt = f"Check eligibility using this scholarship and user context.\nSCHOLARSHIP:{scholarship_json}\nPROFILE:{profile_json}\nRESUME:{resume_json}\nMATCHES:{scholarships_list}\nReturn eligibility JSON."
    return await _legacy_call(prompt)


async def assess_readiness(profile_json: str, resume_json: str, scholarship_json: str, scholarships_list: str) -> dict:
    prompt = f"Assess application readiness.\nSCHOLARSHIP:{scholarship_json}\nPROFILE:{profile_json}\nRESUME:{resume_json}\nMATCHES:{scholarships_list}\nReturn readiness JSON."
    return await _legacy_call(prompt)


async def generate_roadmap(profile_json: str, resume_json: str, scholarship_json: str, scholarships_list: str) -> dict:
    prompt = f"Generate eligibility roadmap.\nSCHOLARSHIP:{scholarship_json}\nPROFILE:{profile_json}\nRESUME:{resume_json}\nMATCHES:{scholarships_list}\nReturn roadmap JSON."
    return await _legacy_call(prompt)


async def discover_opportunities(profile_json: str, resume_json: str, query: str, scholarships_list: str) -> dict:
    prompt = f"Find opportunities for query: {query}\nPROFILE:{profile_json}\nRESUME:{resume_json}\nSCHOLARSHIPS:{scholarships_list}\nReturn discover JSON."
    return await _legacy_call(prompt)


async def generate_document(profile_json: str, resume_json: str, scholarship_json: str, document_type: str, additional_context: str = "") -> dict:
    prompt = f"Generate {document_type}.\nSCHOLARSHIP:{scholarship_json}\nPROFILE:{profile_json}\nRESUME:{resume_json}\nCONTEXT:{additional_context}\nReturn document JSON."
    return await _legacy_call(prompt)


async def general_chat(profile_json: str, resume_json: str, message: str, scholarships_list: str) -> dict:
    prompt = f"{message}\nPROFILE:{profile_json}\nRESUME:{resume_json}\nSCHOLARSHIPS:{scholarships_list}"
    return await _legacy_call(prompt)


async def _legacy_call(prompt: str) -> dict:
    settings = get_settings()
    try:
        async with httpx.AsyncClient(timeout=LLM_CHAT_TIMEOUT) as client:
            response = await client.post(
                f"{settings.resolved_llm_base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.resolved_llm_api_key}",
                    "Content-Type": "application/json",
                },
                json=_llm_request_body(_messages(prompt), stream=False),
            )
            response.raise_for_status()
            await response.aread()  # see call_agent_structured: fix "read()" bug
            content = (response.json().get("choices") or [{}])[0].get("message", {}).get("content") or ""
            content = _strip_think_blocks(content)
            return _try_parse_json(content)
    except httpx.HTTPError as e:
        err = classify_httpx_error(e)
        return {"type": "text", "error": True, **err.to_dict()}
    except Exception as e:  # noqa: BLE001
        err = classify_httpx_error(e)
        return {"type": "text", "error": True, **err.to_dict()}


def _try_parse_json(content: str) -> dict:
    """Try to parse content as JSON, handling markdown code blocks.

    Returns a dict. If parsing fails, the raw content is preserved under
    `content` so the chat UI can render the text response.
    """
    text = (content or "").strip()
    if not text:
        return {"type": "text", "content": ""}
    if text.startswith("```"):
        parts = text.split("```")
        if len(parts) >= 2:
            text = parts[1].strip()
            if text.startswith("json"):
                text = text[4:].strip()
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
        return {"type": "text", "content": content}
    except json.JSONDecodeError:
        return {"type": "text", "content": content}
