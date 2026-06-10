import httpx, json, time, os
from dotenv import load_dotenv
load_dotenv()

API_KEY = os.getenv("OPENAI_API_KEY")
BASE_URL = os.getenv("OPENAI_BASE_URL")

cv_text = """Muhammad Abdullah
Email: m.abdullah@gmail.com | Phone: +234 803 123 4567
Location: Kano, Nigeria | LinkedIn: linkedin.com/in/mabdullah

SUMMARY
Computer Science graduate with 3 years experience in software development and machine learning research. Published 2 papers in NLP. Seeking fully funded PhD in Computer Science.

EDUCATION
BSc Computer Science, Bayero University Kano, 2019-2023, CGPA: 4.2/5.0

EXPERIENCE
Software Developer, TechHub Kano, Jan 2023 - Present
- Built 5 web applications using React and Node.js
- Led team of 3 developers on e-government portal

Research Assistant, AI Lab BUK, Jun 2022 - Dec 2022
- Developed Hausa NLP dataset (10,000 annotated texts)
- Implemented BERT-based sentiment classifier with 87% accuracy

SKILLS: Python, JavaScript, React, Node.js, TensorFlow, PyTorch, SQL, Git

PUBLICATIONS
1. Abdullah et al. (2023). HausaBERT: A Language Model for Hausa. IEEE Access.
2. Abdullah & Ibrahim (2022). Cross-lingual Transfer for Low-Resource Languages. ACL Workshop.

CERTIFICATIONS: AWS Cloud Practitioner 2023, Google Data Analytics 2022
LANGUAGES: English (Fluent), Hausa (Native), Arabic (Intermediate)"""

prompt = f"""Analyze this CV and return JSON with: full_name, email, phone, location, summary, education[], experience[], research_projects[], skills[], certifications[], publications[], languages[], overall_score (0-100), issues[], ai_suggestions.

CV TEXT:
{cv_text[:4000]}

Return ONLY valid JSON. No markdown."""

configs = [
    {"model": "mimo-v2.5",      "label": "mimo-v2.5 (thinking ON)",   "extra": {}},
    {"model": "mimo-v2.5",      "label": "mimo-v2.5 (thinking OFF)",  "extra": {"enable_thinking": False}},
    {"model": "mimo-v2.5-pro",  "label": "mimo-v2.5-pro (thinking ON)",  "extra": {}},
    {"model": "mimo-v2.5-pro",  "label": "mimo-v2.5-pro (thinking OFF)", "extra": {"enable_thinking": False}},
]

print()
print("=" * 85)
print("  BENCHMARK: Resume Analysis — mimo-v2.5 vs mimo-v2.5-pro (thinking ON vs OFF)")
print("=" * 85)
print()

for cfg in configs:
    try:
        payload = {
            "model": cfg["model"],
            "messages": [
                {"role": "system", "content": "You are a resume analysis expert. Return valid JSON only."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.3,
            "max_tokens": 8000,
            **cfg["extra"]
        }
        start = time.time()
        with httpx.Client(timeout=300) as client:
            resp = client.post(
                f"{BASE_URL}/v1/chat/completions",
                headers={"api-key": API_KEY},
                json=payload
            )
        elapsed = time.time() - start
        data = resp.json()

        if "error" in data:
            print(f"  {cfg['label']:40s} | ERROR: {data['error'].get('message','')[:80]}")
            continue

        usage = data.get("usage", {})
        content = data["choices"][0]["message"]["content"]

        # Parse JSON
        try:
            clean = content.strip()
            if clean.startswith("```"):
                clean = clean.split("\n", 1)[1] if "\n" in clean else clean[3:]
            if clean.endswith("```"):
                clean = clean[:-3]
            parsed = json.loads(clean.strip())
            fields = sum(1 for v in parsed.values() if v and v != [] and v != 0)
            research = len(parsed.get("research_projects", []))
            score = parsed.get("overall_score", "?")
        except:
            fields = "?"
            research = "?"
            score = "?"

        out_tokens = usage.get("completion_tokens", "?")
        in_tokens = usage.get("prompt_tokens", "?")
        total_tokens = usage.get("total_tokens", "?")

        print(f"  {cfg['label']:40s} | {elapsed:5.1f}s | in:{in_tokens} out:{out_tokens} total:{total_tokens} | fields:{fields} score:{score}")

    except Exception as e:
        print(f"  {cfg['label']:40s} | EXCEPTION: {str(e)[:80]}")

print()
print("=" * 85)
print()
