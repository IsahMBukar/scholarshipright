"""
E2E regression: Scholara AI agent endpoints (/api/agent/*).

Covers:
  1. Source contract — frontend chat page + api.ts call the right endpoints
  2. Auth gate — agent endpoints reject unauthenticated requests
  3. Deterministic error paths (no LLM call needed):
     - profile_missing  (no profile saved)
     - scholarship_not_found (bad scholarship_id)
  4. Happy-path shape contract — eligibility/readiness/chat return either a
     valid success payload OR a structured agent_error (if LLM is down). Both
     are acceptable; what we reject is a 500, a bare string, or a missing
     `type`/`error` field.
  5. Session persistence — chat creates a session visible via /api/agent/sessions

The LLM (BluesMinds) may or may not be reachable during a test run, so every
happy-path assertion tolerates an error envelope as long as the envelope is
well-formed (has error=True, code, user_message, retryable).
"""

import os
import sys
import json
import urllib.request
import urllib.error
from http.cookiejar import CookieJar

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
FRONTEND = os.path.join(ROOT, "frontend", "src")
API = os.getenv("API_URL", "http://localhost:8000")

# Build test password dynamically (avoids shell-escape issues)
PWD = "A" + "gent" + "E2E" + "Probe" + "42!"

tests_passed = 0
tests_failed = 0
tests_skipped = 0


def step(label):
    print()
    print("=" * 60)
    print(label)
    print("=" * 60)


def check(name, ok, detail=""):
    global tests_passed, tests_failed
    if ok:
        print(f"  PASS  {name}  {detail}")
        tests_passed += 1
    else:
        print(f"  FAIL  {name}  {detail}")
        tests_failed += 1


def skip(name, reason):
    global tests_skipped
    print(f"  SKIP  {name}  ({reason})")
    tests_skipped += 1


def is_error_envelope(d):
    """A well-formed agent error: {error:True, code:str, user_message:str, retryable:bool}."""
    return (
        isinstance(d, dict)
        and d.get("error") is True
        and isinstance(d.get("code"), str)
        and isinstance(d.get("user_message"), str)
        and isinstance(d.get("retryable"), bool)
    )


def api_post(opener, path, body):
    """POST JSON, return (status, parsed_json_or_text)."""
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f"{API}{path}", data=data,
        headers={"Content-Type": "application/json"}, method="POST",
    )
    try:
        with opener.open(req) as r:
            raw = r.read().decode()
            try:
                return r.status, json.loads(raw)
            except json.JSONDecodeError:
                return r.status, raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except json.JSONDecodeError:
            return e.code, raw


def api_get(opener, path):
    req = urllib.request.Request(f"{API}{path}", method="GET")
    try:
        with opener.open(req) as r:
            raw = r.read().decode()
            try:
                return r.status, json.loads(raw)
            except json.JSONDecodeError:
                return r.status, raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except json.JSONDecodeError:
            return e.code, raw


# ─────────────────────────────────────────────
# PART 1: Source contract — FE calls the right agent endpoints
# ─────────────────────────────────────────────
step("PART 1: Frontend source contract — agent endpoints")

api_src = open(os.path.join(FRONTEND, "services", "api.ts")).read()
chat_src = open(os.path.join(FRONTEND, "app", "chat", "page.tsx")).read()

check("api.ts calls /api/agent/chat (non-streaming actions)",
      "/api/agent/chat" in api_src)
check("api.ts calls /api/agent/chat/stream (streaming chat)",
      "/api/agent/chat/stream" in api_src)
check("api.ts calls /api/agent/context (session context)",
      "/api/agent/context" in api_src)
check("api.ts calls /api/agent/sessions (session list)",
      "/api/agent/sessions" in api_src)
check("chat page imports agentChatStream (streaming fn)",
      "agentChatStream" in chat_src)
check("chat page imports fetchAgentContext",
      "fetchAgentContext" in chat_src)
check("chat page uses streamingContent ref for progressive display",
      "streamingContent" in chat_src)
check("chat page sends action + scholarship_id + document_type in payload",
      all(t in api_src for t in ["action", "scholarship_id", "document_type"]))

# Dead code must be gone
dead_chat = os.path.join(ROOT, "backend", "app", "api", "chat.py")
dead_bot = os.path.join(ROOT, "backend", "app", "services", "scholarbot.py")
check("dead code removed: backend/app/api/chat.py gone",
      not os.path.exists(dead_chat))
check("dead code removed: backend/app/services/scholarbot.py gone",
      not os.path.exists(dead_bot))
check("api.ts does NOT reference the dead /api/chat/sessions endpoint",
      "/api/chat/sessions" not in api_src)


# ─────────────────────────────────────────────
# PART 2: Auth gate — agent endpoints require a cookie
# ─────────────────────────────────────────────
step("PART 2: Auth gate — unauthenticated requests rejected")

# No-cookie opener
bare_opener = urllib.request.build_opener()

for path, method in [
    ("/api/agent/chat", "POST"),
    ("/api/agent/eligibility", "POST"),
    ("/api/agent/readiness", "POST"),
    ("/api/agent/sessions", "GET"),
    ("/api/agent/context", "GET"),
]:
    if method == "POST":
        status, _ = api_post(bare_opener, path, {"message": "hi"})
    else:
        status, _ = api_get(bare_opener, path)
    check(f"{method} {path} without cookie → 401 (not {status})",
          status == 401, f"(got {status})")


# ─────────────────────────────────────────────
# PART 3: Register a fresh user + save profile
# ─────────────────────────────────────────────
step("PART 3: Register fresh user + save profile")

email = f"e2e-agent-{os.urandom(4).hex()}@scholarshipright.com"

jar = CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

creds = json.dumps({
    "email": email, "password": PWD, "full_name": "E2E Agent"
}).encode()
req = urllib.request.Request(f"{API}/api/auth/register", data=creds,
    headers={"Content-Type": "application/json"}, method="POST")

registered = False
try:
    with opener.open(req) as r:
        registered = r.status == 200
        check("register returns 200", registered)
except urllib.error.HTTPError as e:
    if e.code == 429:
        skip("register a fresh user", "auth rate limit hit")
    else:
        check("register returns 200", False, f"got {e.code}: {e.read().decode()[:150]}")

if registered:
    profile = json.dumps({
        "country_of_origin": "Nigeria",
        "target_degree": "master",
        "field_of_study": "computer_science",
        "target_fields": ["computer_science", "data_science"],
        "target_countries": ["United States", "United Kingdom", "Germany"],
        "has_ielts": True,
        "ielts_score": 7.5,
        "cgpa": 4.5,
        "cgpa_scale": 5.0,
    }).encode()
    req = urllib.request.Request(f"{API}/api/profile", data=profile,
        headers={"Content-Type": "application/json"}, method="POST")
    try:
        with opener.open(req) as r:
            check("POST /api/profile returns 200", r.status == 200)
    except urllib.error.HTTPError as e:
        check("POST /api/profile returns 200", False, f"got {e.code}")

    # Create a manual resume stub so the agent has resume context
    status, resume = api_post(opener, "/api/resumes/manual", {})
    has_resume = status == 200 and isinstance(resume, dict) and "id" in resume
    check("POST /api/resumes/manual returns 200 with resume id",
          has_resume, f"(status={status})")


# ─────────────────────────────────────────────
# PART 4: Deterministic error — profile_missing
# (Use a SECOND user with no profile)
# ─────────────────────────────────────────────
step("PART 4: profile_missing error path (no LLM call)")

email2 = f"e2e-agent-noprofile-{os.urandom(4).hex()}@scholarshipright.com"
jar2 = CookieJar()
opener2 = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar2))

creds2 = json.dumps({
    "email": email2, "password": PWD, "full_name": "No Profile"
}).encode()
req2 = urllib.request.Request(f"{API}/api/auth/register", data=creds2,
    headers={"Content-Type": "application/json"}, method="POST")
np_registered = False
try:
    with opener2.open(req2) as r:
        np_registered = r.status == 200
except urllib.error.HTTPError as e:
    if e.code == 429:
        skip("register no-profile user", "auth rate limit hit")

if np_registered:
    # Eligibility requires a profile — should return profile_missing error
    status, body = api_post(opener2, "/api/agent/eligibility", {
        "scholarship_id": "00000000-0000-0000-0000-000000000000",
    })
    check(f"eligibility without profile returns 200 (error envelope, not HTTP error)",
          status == 200, f"(got status={status})")
    if status == 200 and isinstance(body, dict):
        check("eligibility without profile → error: True",
              body.get("error") is True, f"(body keys: {list(body.keys())})")
        check("eligibility without profile → code == 'profile_missing'",
              body.get("code") == "profile_missing",
              f"(got code={body.get('code')!r})")
        check("eligibility without profile → user_message is a non-empty string",
              isinstance(body.get("user_message"), str) and len(body["user_message"]) > 0)
        check("eligibility without profile → retryable is a bool",
              isinstance(body.get("retryable"), bool))
        check("eligibility without profile → type field set to 'eligibility'",
              body.get("type") == "eligibility")

    # Readiness without profile — same expectation
    status, body = api_post(opener2, "/api/agent/readiness", {})
    check("readiness without profile returns 200 (error envelope)",
          status == 200, f"(got status={status})")
    if status == 200 and isinstance(body, dict):
        check("readiness without profile → code == 'profile_missing'",
              body.get("code") == "profile_missing",
              f"(got code={body.get('code')!r})")


# ─────────────────────────────────────────────
# PART 5: Deterministic error — scholarship_not_found
# ─────────────────────────────────────────────
step("PART 5: scholarship_not_found error path (no LLM call)")

if registered:
    # User HAS a profile now. Eligibility with a fake scholarship_id should
    # return scholarship_not_found BEFORE any LLM call is attempted.
    status, body = api_post(opener, "/api/agent/eligibility", {
        "scholarship_id": "nonexistent-slug-xyz123",
    })
    check("eligibility with bad scholarship_id returns 200 (error envelope)",
          status == 200, f"(got status={status})")
    if status == 200 and isinstance(body, dict):
        check("eligibility bad scholarship → code == 'scholarship_not_found'",
              body.get("code") == "scholarship_not_found",
              f"(got code={body.get('code')!r})")
        check("eligibility bad scholarship → type == 'eligibility'",
              body.get("type") == "eligibility")

    # Roadmap with bad scholarship_id — same
    status, body = api_post(opener, "/api/agent/roadmap", {
        "scholarship_id": "another-nonexistent-slug",
    })
    check("roadmap with bad scholarship_id returns 200 (error envelope)",
          status == 200, f"(got status={status})")
    if status == 200 and isinstance(body, dict):
        check("roadmap bad scholarship → code == 'scholarship_not_found'",
              body.get("code") == "scholarship_not_found",
              f"(got code={body.get('code')!r})")


# ─────────────────────────────────────────────
# PART 6: Happy-path shape contract — eligibility with a REAL scholarship
# (Tolerates LLM success OR LLM error; rejects 500 / bare string / missing fields)
# ─────────────────────────────────────────────
step("PART 6: Happy-path shape contract — eligibility with real scholarship")

if registered:
    # Fetch a real scholarship slug from the public list
    status, sch_list = api_get(opener, "/api/scholarships?limit=1")
    real_slug = None
    if status == 200 and isinstance(sch_list, dict):
        items = sch_list.get("items", [])
        if items:
            real_slug = items[0].get("slug")
    elif status == 200 and isinstance(sch_list, list) and sch_list:
        real_slug = sch_list[0].get("slug")

    if real_slug:
        check(f"found a real scholarship slug for testing: {real_slug}", True)
        status, body = api_post(opener, "/api/agent/eligibility", {
            "scholarship_id": real_slug,
        })
        check("eligibility with real scholarship returns 200",
              status == 200, f"(got status={status})")
        if status == 200 and isinstance(body, dict):
            if body.get("error") is True:
                # LLM may be down/unconfigured — accept any well-formed error
                check("eligibility LLM-unavailable → well-formed error envelope",
                      is_error_envelope(body),
                      f"(code={body.get('code')!r})")
                # Must NOT be profile_missing or scholarship_not_found (those are bugs here)
                check("eligibility error is NOT profile_missing (user has profile)",
                      body.get("code") != "profile_missing")
                check("eligibility error is NOT scholarship_not_found (slug is real)",
                      body.get("code") != "scholarship_not_found")
            else:
                # Success — verify the eligibility contract
                check("eligibility success → type == 'eligibility'",
                      body.get("type") == "eligibility")
                check("eligibility success → eligible is a bool",
                      isinstance(body.get("eligible"), bool))
                check("eligibility success → summary is a string",
                      isinstance(body.get("summary"), str))
                check("eligibility success → requirements_met is a list",
                      isinstance(body.get("requirements_met"), list))
                check("eligibility success → requirements_missing is a list",
                      isinstance(body.get("requirements_missing"), list))
    else:
        skip("eligibility happy path", "no scholarships in DB to test against")


# ─────────────────────────────────────────────
# PART 7: Chat non-streaming — session persistence
# ─────────────────────────────────────────────
step("PART 7: Chat non-streaming + session persistence")

if registered:
    status, body = api_post(opener, "/api/agent/chat", {
        "message": "What scholarships am I eligible for?",
        "action": "chat",
    })
    check("POST /api/agent/chat returns 200", status == 200, f"(got {status})")

    session_id = None
    if status == 200 and isinstance(body, dict):
        if body.get("error") is True:
            check("chat LLM-unavailable → well-formed error envelope",
                  is_error_envelope(body), f"(code={body.get('code')!r})")
        else:
            check("chat success → has type or content field",
                  "type" in body or "content" in body or "answer" in body,
                  f"(keys: {list(body.keys())})")
        # _session_id should always be present (session is created even on LLM error)
        session_id = body.get("_session_id")
        check("chat response includes _session_id (session always created)",
              isinstance(session_id, str) and len(session_id) > 0,
              f"(session_id={session_id!r})")

    # Verify the session shows up in the sessions list
    if session_id:
        status, sessions = api_get(opener, "/api/agent/sessions")
        check("GET /api/agent/sessions returns 200", status == 200, f"(got {status})")
        if status == 200 and isinstance(sessions, list):
            found = any(s.get("id") == session_id for s in sessions if isinstance(s, dict))
            check("newly created session appears in /api/agent/sessions",
                  found, f"(session_id={session_id}, {len(sessions)} sessions total)")
            if found:
                the_session = next(s for s in sessions if isinstance(s, dict) and s.get("id") == session_id)
                check("session list has message_count",
                      isinstance(the_session.get("message_count"), int))
                check("session list has last_message (None or str)",
                      the_session.get("last_message") is None or isinstance(the_session.get("last_message"), str))


# ─────────────────────────────────────────────
# PART 8: Agent health endpoint — pings the configured LLM provider
# ─────────────────────────────────────────────
step("PART 8: /api/agent/health pings the configured LLM provider")

if registered:
    status, body = api_get(opener, "/api/agent/health")
    check("GET /api/agent/health returns 200", status == 200, f"(got {status})")
    if status == 200 and isinstance(body, dict):
        check("health payload has 'configured' bool",
              isinstance(body.get("configured"), bool))
        check("health payload has 'reachable' bool",
              isinstance(body.get("reachable"), bool))
        check("health payload exposes base_url (without API key)",
              isinstance(body.get("base_url"), str) and "api" in body["base_url"])
        check("health payload exposes model name",
              isinstance(body.get("model"), str) and len(body["model"]) > 0)
        if not body.get("reachable"):
            check("health payload has diagnostic error when not reachable",
                  isinstance(body.get("error"), str) and len(body["error"]) > 0)


# ─────────────────────────────────────────────
# PART 9: Agent context endpoint
# ─────────────────────────────────────────────
step("PART 9: /api/agent/context returns user context for the chat UI")

if registered:
    status, body = api_get(opener, "/api/agent/context")
    check("GET /api/agent/context returns 200", status == 200, f"(got {status})")
    if status == 200 and isinstance(body, dict):
        check("context has profile summary or profile data",
              any(k in body for k in ["profile", "profile_summary", "has_profile"]),
              f"(keys: {list(body.keys())})")


# ─────────────────────────────────────────────
# Cleanup
# ─────────────────────────────────────────────
try:
    import subprocess
    for e in [email, email2]:
        subprocess.run(
            ["psql", "-U", "system", "-d", "scholarshipright", "-c",
             f"DELETE FROM users WHERE email = '{e}';"],
            capture_output=True, check=False,
        )
except Exception:
    pass


# ─────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────
print()
print("=" * 60)
print(f"RESULTS:  {tests_passed} passed,  {tests_failed} failed,  {tests_skipped} skipped")
print("=" * 60)
sys.exit(0 if tests_failed == 0 else 1)
