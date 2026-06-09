import json
import base64
import httpx
from app.core.config import get_settings

settings = get_settings()


async def extract_text_from_file(file_content: bytes, mime_type: str, filename: str) -> str:
    """Extract text from uploaded file. For images, use vision API. For PDFs/Docs, use raw text."""
    
    if mime_type.startswith("image/"):
        # Use vision API to extract text from image
        b64 = base64.b64encode(file_content).decode()
        return await _vision_extract(b64, mime_type)
    elif mime_type == "application/pdf":
        # Try to extract text from PDF
        return _extract_pdf_text(file_content)
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
        # Use mimo-v2.5 for vision (pro model doesn't support image input)
        vision_model = "mimo-v2.5"
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                f"{settings.openai_base_url}/v1/chat/completions",
                headers={"api-key": settings.openai_api_key},
                json={
                    "model": vision_model,
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": "Extract ALL text from this CV/resume image. Return the complete text content preserving the original structure and formatting as much as possible."},
                                {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{b64_image}"}}
                            ]
                        }
                    ],
                    "max_tokens": 8000
                }
            )
            data = resp.json()
            return data["choices"][0]["message"]["content"]
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
      "type": "work or project",
      "company": "string (for work) or empty",
      "position": "string (for work) or empty",
      "title": "string (for projects) or empty",
      "organization": "string (for projects) or empty",
      "start_date": "string",
      "end_date": "string",
      "location": "string",
      "description": "string",
      "technologies": "string (for projects, comma-separated tools/tech) or empty",
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
  "projects": [
    {{
      "name": "string",
      "description": "string",
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
  "overall_score": 75,
  "issues": [
    {{
      "field": "field_name",
      "severity": "urgent|severe|likely",
      "message": "What's wrong",
      "suggestion": "How to fix it"
    }}
  ],
  "ai_suggestions": "Overall suggestions for improving this resume for scholarship applications"
}}

TARGET FIELDS: {', '.join(target_fields) if target_fields else 'General'}
TARGET DEGREE: {target_degree or 'Not specified'}

SEVERITY LEVELS:
- urgent: Missing critical info (no email, no education, etc.) — must fix
- severe: Weak areas that significantly hurt chances (vague descriptions, no achievements, etc.)
- likely: Minor improvements that would help (formatting, missing optional sections)

CV TEXT:
{raw_text[:4000]}

Return ONLY valid JSON. No markdown, no code blocks."""

    try:
        async with httpx.AsyncClient(timeout=300) as client:
            resp = await client.post(
                f"{settings.openai_base_url}/v1/chat/completions",
                headers={"api-key": settings.openai_api_key},
                json={
                    "model": settings.openai_model or "mimo-v2.5-pro",
                    "messages": [
                        {"role": "system", "content": "You are a resume analysis expert. Always return valid JSON only."},
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0.3,
                    "max_tokens": 8000
                }
            )
            data = resp.json()
            content = data["choices"][0]["message"]["content"]
            
            # Strip markdown code blocks if present
            content = content.strip()
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
        return {
            "full_name": "",
            "email": "",
            "phone": "",
            "summary": "",
            "education": [],
            "experience": [],
            "skills": [],
            "overall_score": 0,
            "issues": [{"field": "general", "severity": "urgent", "message": "Failed to analyze CV. Please try again.", "suggestion": "Re-upload or paste your CV text manually."}],
            "ai_suggestions": "Analysis failed. Please try again."
        }


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
                f"{settings.openai_base_url}/v1/chat/completions",
                headers={"api-key": settings.openai_api_key},
                json={
                    "model": settings.openai_model or "mimo-v2.5-pro",
                    "messages": [
                        {"role": "system", "content": "You are a professional resume writer for international scholarship applications. Improve the given text to be more impactful, specific, and scholarship-ready."},
                        {"role": "user", "content": f"Improve this resume field for a scholarship application.\n\nField: {field_name}\nCurrent content: {current_value}\nContext: {context}\n\nReturn ONLY the improved text, no explanations."}
                    ],
                    "temperature": 0.5,
                    "max_tokens": 1000
                }
            )
            data = resp.json()
            return data["choices"][0]["message"]["content"].strip()
    except Exception as e:
        print(f"AI rewrite error: {e}")
        return current_value
