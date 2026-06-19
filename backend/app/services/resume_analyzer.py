import json
import base64
import httpx
from app.core.config import get_settings

settings = get_settings()


def _llm_chat_url() -> str:
    """Build the chat-completions URL from the configured LLM base URL.

    Works for any OpenAI-compatible endpoint. The configured LLM_BASE_URL
    already includes /v1 (or /api/v1), so we simply append /chat/completions.

    Examples:
      https://api.openai.com/v1      -> https://api.openai.com/v1/chat/completions
      https://zenmux.ai/api/v1       -> https://zenmux.ai/api/v1/chat/completions
    """
    base = settings.resolved_llm_base_url.rstrip("/")
    return f"{base}/chat/completions"


def _no_thinking_kwargs() -> dict:
    """Extra body kwargs that disable reasoning/thinking for the LLM call.

    Resume parsing is structured JSON extraction — reasoning just eats
    output tokens without improving quality. The Scholara agent
    (services/agent.py) intentionally keeps reasoning ON; this helper is
    only used by the resume analyzer.
    """
    return {"extra_body": {"enable_thinking": False}}


def _extract_message_content(data: dict) -> str:
    """Safely pull the assistant text out of a chat-completions response.

    Reasoning models sometimes return ``content: None`` when they exhaust
    the token budget on internal thinking (and the JSON never gets
    emitted). A few providers also surface the actual answer in
    ``reasoning_content`` instead. This helper covers all three cases:

      1. Normal: ``choices[0].message.content`` is a string.
      2. Empty/null content + reasoning_content present → use that.
      3. Both empty → raise with the finish_reason + raw payload so the
         background task can log what happened instead of crashing on
         ``None.strip()``.
    """
    try:
        msg = data["choices"][0]["message"]
        finish = data["choices"][0].get("finish_reason", "?")
    except (KeyError, IndexError, TypeError) as e:
        raise RuntimeError(f"Malformed LLM response: {data}") from e

    content = msg.get("content")
    reasoning = msg.get("reasoning_content")

    if isinstance(content, str) and content.strip():
        return content
    if isinstance(reasoning, str) and reasoning.strip():
        return reasoning
    raise RuntimeError(
        f"LLM returned no content (finish_reason={finish}, "
        f"usage={data.get('usage')})"
    )




async def extract_text_from_file(file_content: bytes, mime_type: str, filename: str) -> str:
    """Extract text from uploaded file. For images, use vision API. For PDFs/Docs, use raw text with vision fallback."""
    
    if mime_type.startswith("image/"):
        # Use vision API to extract text from image
        b64 = base64.b64encode(file_content).decode()
        return await _vision_extract(b64, mime_type)
    elif mime_type == "application/pdf":
        # Try text extraction first, fallback to vision for flattened/image PDFs
        text = _extract_pdf_text(file_content)
        if len(text.strip()) < 50:
            print(f"PDF text extraction yielded only {len(text.strip())} chars — trying vision fallback...")
            text = await _pdf_vision_fallback(file_content)
        return text
    elif mime_type in [
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ]:
        return _extract_docx_text(file_content)
    else:
        # Try as plain text — but reject binary content
        try:
            text = file_content.decode("utf-8", errors="ignore")
            # Check if it looks like text (not binary)
            if text[:10].startswith(('%PDF', 'PK', '\xd0\xcf')):
                return ""
            printable_ratio = sum(c.isprintable() or c in '\n\r\t' for c in text[:500]) / max(len(text[:500]), 1)
            if printable_ratio < 0.7:
                return ""
            return text
        except:
            return ""


async def _vision_extract(b64_image: str, mime_type: str) -> str:
    """Use LLM vision to extract text from image."""
    try:
        # Use the configured model for vision. 0G router's minimax-m3
        # supports multimodal input; if it doesn't we fall through to
        # text-only and the caller (analyze_resume) skips this code path.
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                _llm_chat_url(),
                headers={"Authorization": f"Bearer {settings.resolved_llm_api_key}"},
                json={
                    "model": settings.resolved_llm_model,
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": "Extract ALL text from this CV/resume image. CRITICAL: Preserve section headers EXACTLY as they appear (e.g., 'RESEARCH & PROJECTS', 'WORK EXPERIENCE', 'EDUCATION', 'SKILLS', 'CERTIFICATIONS'). Keep each entry under its correct section header. Return the complete text content preserving the original structure."},
                                {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{b64_image}"}}
                            ]
                        }
                    ],
                    "max_tokens": 8000,
                    **_no_thinking_kwargs(),
                }
            )
            data = resp.json()
            return _extract_message_content(data)
    except Exception as e:
        print(f"Vision extraction error: {e}")
        return ""


def _extract_pdf_text(content: bytes) -> str:
    """Extract text from PDF bytes using pdfplumber."""
    try:
        import pdfplumber
        import tempfile
        import os
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            f.write(content)
            f.flush()
            tmp_path = f.name
        
        text_parts = []
        with pdfplumber.open(tmp_path) as pdf:
            for page in pdf.pages[:20]:  # Limit to 20 pages
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)
        
        os.unlink(tmp_path)
        return "\n".join(text_parts)
    except Exception as e:
        print(f"PDF extraction error: {e}")
        return ""


async def _pdf_vision_fallback(content: bytes) -> str:
    """Convert PDF pages to images and extract text via vision model.
    Used for flattened/scanned/image-based PDFs where pdfplumber returns no text.
    Pages are processed concurrently for speed."""
    try:
        import fitz  # pymupdf
        import tempfile
        import os
        import asyncio
        
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            f.write(content)
            f.flush()
            tmp_path = f.name
        
        doc = fitz.open(tmp_path)
        max_pages = min(len(doc), 15)  # Limit to 15 pages for vision
        
        print(f"PDF vision fallback: converting {max_pages} pages to images concurrently...")
        
        # Convert all pages to base64 images first
        page_images = []
        for page_num in range(max_pages):
            page = doc[page_num]
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
            img_bytes = pix.tobytes("png")
            b64 = base64.b64encode(img_bytes).decode()
            page_images.append((page_num, b64))
        
        doc.close()
        os.unlink(tmp_path)
        
        # Extract text from all pages concurrently
        async def extract_page(page_num: int, b64: str) -> tuple:
            text = await _vision_extract(b64, "image/png")
            return (page_num, text)
        
        tasks = [extract_page(pn, b64) for pn, b64 in page_images]
        results = await asyncio.gather(*tasks)
        
        # Collect results in order
        all_text = []
        for page_num, text in sorted(results, key=lambda x: x[0]):
            if text.strip():
                all_text.append(f"--- Page {page_num + 1} ---\n{text}")
                print(f"  Page {page_num + 1}: extracted {len(text)} chars")
        
        combined = "\n\n".join(all_text)
        print(f"PDF vision fallback complete: {len(combined)} total chars from {max_pages} pages (concurrent)")
        return combined
    except Exception as e:
        print(f"PDF vision fallback error: {e}")
        return ""


def _extract_docx_text(content: bytes) -> str:
    """Extract text from DOCX bytes."""
    try:
        import subprocess
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as f:
            f.write(content)
            f.flush()
            result = subprocess.run(["python3", "-c", f"""
import zipfile, xml.etree.ElementTree as ET
z = zipfile.ZipFile('{f.name}')
doc = z.read('word/document.xml')
root = ET.fromstring(doc)
ns = {{'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}}
for p in root.iter('{{{http://schemas.openxmlformats.org/wordprocessingml/2006/main}}}p'):
    texts = [t.text for t in p.iter('{{{http://schemas.openxmlformats.org/wordprocessingml/2006/main}}}t') if t.text]
    if texts:
        print(' '.join(texts))
"""], capture_output=True, text=True, timeout=30)
            if result.returncode == 0:
                return result.stdout
    except Exception as e:
        print(f"DOCX extraction error: {e}")
    return ""


async def analyze_resume(raw_text: str, target_fields: list, target_degree: str) -> dict:
    """Use LLM to parse CV text into structured resume + detect issues."""
    
    prompt = f"""You are an expert resume analyzer for international scholarship applications.

Analyze this CV/resume text and return a JSON object with the following structure:

{{
  "full_name": "string",
  "email": "string",
  "phone": "string",
  "location": "string",
  "linkedin_url": "string",
  "portfolio_url": "string",
  "summary": "string - professional summary",
  "education": [
    {{
      "institution": "string",
      "degree": "string",
      "field": "string",
      "start_date": "string",
      "end_date": "string",
      "gpa": "string",
      "description": "string"
    }}
  ],
  "experience": [
    {{
      "company": "string - MUST be an employer/company name only (NOT a project title)",
      "position": "string - job title at the company",
      "start_date": "string",
      "end_date": "string",
      "location": "string",
      "description": "string",
      "achievements": ["string"]
    }}
  ],
  "skills": ["string"],
  "certifications": [
    {{
      "name": "string",
      "issuer": "string",
      "date": "string"
    }}
  ],
  "publications": [
    {{
      "title": "string",
      "journal": "string",
      "date": "string",
      "doi": "string"
    }}
  ],
  "languages": [
    {{
      "language": "string",
      "proficiency": "string"
    }}
  ],
  "research_projects": [
    {{
      "type": "research or project",
      "title": "string - the project/research name",
      "organization": "string (institution, lab, company, or personal)",
      "role": "string (e.g. Lead Researcher, Developer, Research Assistant)",
      "start_date": "string",
      "end_date": "string",
      "location": "string",
      "technologies": "string (methods, tools, tech used)",
      "description": "string",
      "outcomes": "string (publications, results, patents, etc.)",
      "url": "string"
    }}
  ],
  "awards": [
    {{
      "name": "string",
      "issuer": "string",
      "date": "string"
    }}
  ],
  "ref_list": [
    {{
      "name": "string",
      "position": "string",
      "contact": "string"
    }}
  ],
  "ai_suggestions": "Overall suggestions for improving this resume for scholarship applications"
}}

TARGET FIELDS: {', '.join(target_fields) if target_fields else 'General'}
TARGET DEGREE: {target_degree or 'Not specified'}

CRITICAL RULES:
- research_projects: Final-year projects, capstone projects, research work, personal software projects, hackathon projects, thesis work, lab research. Look for keywords: "project", "research", "thesis", "capstone", "final-year", "developed a system", "built an application".
- experience: ONLY paid employment, internships, volunteer work at organizations. Must have a real company/organization name.
- If the CV mentions "Key Project" or "Final-Year Project" or personal projects, put them in research_projects, NOT experience.
- ref_list: Extract any references mentioned (name, position, contact info). If none found, use empty array [].

CV TEXT:
{raw_text[:4000]}

Return ONLY valid JSON. No markdown, no code blocks."""

    try:
        async with httpx.AsyncClient(timeout=300) as client:
            resp = await client.post(
                _llm_chat_url(),
                headers={"Authorization": f"Bearer {settings.resolved_llm_api_key}"},
                json={
                    "model": settings.resolved_llm_model,
                    "messages": [
                        {"role": "system", "content": "You are a resume analysis expert. Always return valid JSON only."},
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0.3,
                    # Generous budget — the schema is huge (education,
                    # experience, research_projects, awards, ref_list,
                    # etc. all as nested arrays). With thinking disabled
                    # the model can produce 8–15k tokens of structured
                    # JSON on a long CV. 8000 was truncating mid-stream
                    # (finish_reason=length) which made the response
                    # unusable.
                    "max_tokens": 16000,
                    **_no_thinking_kwargs(),
                }
            )
            data = resp.json()
            content = _extract_message_content(data)

            # Strip markdown code blocks if present
            content = content.strip()
            if content.startswith("```"):
                content = content.split("\n", 1)[1] if "\n" in content else content[3:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()

            # Strip <think>...</think> reasoning blocks (minimax-m3 emits these
            # in addition to the final JSON). They can appear anywhere, so
            # remove every occurrence rather than only at the start.
            import re
            content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL)
            content = content.strip()

            # If the model wrapped the JSON in ```json ... ``` after the
            # think block, strip that too.
            if content.startswith("```"):
                content = content.split("\n", 1)[1] if "\n" in content else content[3:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()
            
            # Try to parse JSON, with repair for truncated responses
            try:
                return json.loads(content)
            except json.JSONDecodeError:
                repaired = _repair_json(content)
                return json.loads(repaired)
    except Exception as e:
        print(f"AI analysis error: {e}")
        raise RuntimeError("AI resume analysis failed") from e


def _repair_json(text: str) -> str:
    """Attempt to repair truncated JSON by closing open brackets/strings."""
    # Close any open string by finding the last unescaped quote
    in_string = False
    escape_next = False
    last_close = 0
    for i, c in enumerate(text):
        if escape_next:
            escape_next = False
            continue
        if c == '\\':
            escape_next = True
            continue
        if c == '"':
            in_string = not in_string
        if not in_string and c in ('}', ']'):
            last_close = i + 1

    if last_close > 0:
        text = text[:last_close]

    # Close unclosed structures
    stack = []
    in_str = False
    esc = False
    for c in text:
        if esc:
            esc = False
            continue
        if c == '\\':
            esc = True
            continue
        if c == '"':
            in_str = not in_str
            continue
        if in_str:
            continue
        if c == '{':
            stack.append('}')
        elif c == '[':
            stack.append(']')
        elif c in ('}', ']'):
            if stack and stack[-1] == c:
                stack.pop()

    if in_str:
        text += '"'
    for closer in reversed(stack):
        text += closer

    return text


async def rewrite_field(field_name: str, current_value: str, context: str) -> str:
    """Use AI to rewrite/improve a specific resume field."""
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                _llm_chat_url(),
                headers={"Authorization": f"Bearer {settings.resolved_llm_api_key}"},
                json={
                    "model": settings.resolved_llm_model,
                    "messages": [
                        {"role": "system", "content": "You are a professional resume writer for international scholarship applications. Improve the given text to be more impactful, specific, and scholarship-ready."},
                        {"role": "user", "content": f"Improve this resume field for a scholarship application.\n\nField: {field_name}\nCurrent content: {current_value}\nContext: {context}\n\nReturn ONLY the improved text, no explanations."}
                    ],
                    "temperature": 0.5,
                    "max_tokens": 1000,
                    **_no_thinking_kwargs(),
                }
            )
            data = resp.json()
            return _extract_message_content(data).strip()
    except Exception as e:
        print(f"AI rewrite error: {e}")
        raise RuntimeError("AI resume rewrite failed") from e
