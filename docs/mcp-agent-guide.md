# ScholarshipRight MCP Tools — Agent Guide

## Overview

ScholarshipRight exposes MCP tools for AI agents to discover, create, and manage
scholarships and their document requirements. All write operations go through a
**pending review queue** — admin approves before anything goes live.

## Connection

### SSE/HTTP (production)
```
URL: https://your-domain.com/mcp/sse
Auth: Bearer token (API key or OAuth)
Scopes: scholarships:read, scholarships:write, blogs:read, blogs:write
```

### Stdio (local dev — Claude Desktop)
```
Command: python -m app.mcp.server
```

---

## Available Tools

### Scholarship CRUD

| Tool | Scope | Description |
|------|-------|-------------|
| `list_scholarships` | read | Search/list scholarships |
| `get_scholarship` | read | Get full details + documents |
| `add_scholarship` | write | Submit to review queue |
| `edit_scholarship` | write | Update existing scholarship |

### Document Requirements (NEW)

| Tool | Scope | Description |
|------|-------|-------------|
| `get_scholarship_documents` | read | Get all document requirements |
| `set_degree_documents` | write | Set per-degree-level docs |
| `add_custom_document` | write | Add flexible custom doc |
| `remove_custom_document` | write | Remove a custom doc |

### Blog

| Tool | Scope | Description |
|------|-------|-------------|
| `list_blog_posts` | read | List published posts |
| `get_blog_post` | read | Get full post content |
| `create_blog_post` | write | Submit post for review |
| `edit_blog_post` | write | Edit existing post |
| `list_blog_categories` | read | List categories |

---

## Degree Levels

| Level | Previous Degree | Recs | Research | Test |
|-------|----------------|------|----------|------|
| `bachelor` | High school diploma | 2 | No | SAT/ACT |
| `master` | Bachelor's degree | 2 | No | GRE/GMAT |
| `phd` | Master's degree | 3 | Yes | GRE |
| `direct_phd` | Bachelor's degree | 3 | Yes | GRE |
| `postdoc` | PhD degree | 3 | Yes | None |
| `certificate` | — | — | — | — |
| `diploma` | — | — | — | — |
| `associate` | — | — | — | — |

---

## Tool Usage Examples

### Get scholarship with all documents
```json
{
  "tool": "get_scholarship",
  "input": { "id_or_slug": "global-excellence-scholarship-2026" }
}
```

Response includes `degree_documents` (per-level overrides) and `custom_documents`
(flexible additions).

### Get just the documents
```json
{
  "tool": "get_scholarship_documents",
  "input": { "id_or_slug": "global-excellence-scholarship-2026" }
}
```

### Set per-degree-level documents
```json
{
  "tool": "set_degree_documents",
  "input": {
    "id_or_slug": "global-excellence-scholarship-2026",
    "documents": [
      {
        "degree_level": "bachelor",
        "req_transcripts": true,
        "req_cv_resume": true,
        "req_sop_motivation_letter": true,
        "req_recommendation_letters": true,
        "recommendation_letters_count": 2,
        "standardized_test": "sat_act",
        "previous_degree_required": "high_school_diploma"
      },
      {
        "degree_level": "phd",
        "req_transcripts": true,
        "req_cv_resume": true,
        "req_sop_motivation_letter": true,
        "req_recommendation_letters": true,
        "recommendation_letters_count": 3,
        "research_proposal_required": true,
        "standardized_test": "gre",
        "previous_degree_required": "master_degree"
      }
    ]
  }
}
```

**Auto-derivation**: If you omit `previous_degree_required`, `recommendation_letters_count`,
`research_proposal_required`, or `standardized_test`, they are auto-derived from the
degree level (see table above).

### Add custom document requirements
```json
{
  "tool": "add_custom_document",
  "input": {
    "id_or_slug": "global-excellence-scholarship-2026",
    "name": "Video Essay",
    "description": "2-minute video explaining your motivation",
    "required": true
  }
}
```

For level-specific custom docs:
```json
{
  "tool": "add_custom_document",
  "input": {
    "id_or_slug": "global-excellence-scholarship-2026",
    "name": "Research Publications",
    "description": "List of published papers",
    "required": false,
    "degree_level": "phd"
  }
}
```

### Remove a custom document
```json
{
  "tool": "remove_custom_document",
  "input": {
    "id_or_slug": "global-excellence-scholarship-2026",
    "document_id": "ba2e9259-b303-4219-a6e2-2ae94aeed1a5"
  }
}
```

### Add a certification program with custom docs
```json
{
  "tool": "add_scholarship",
  "input": {
    "name": "AWS Cloud Certification Sponsorship",
    "host_country": "United States",
    "funding_type": "fully_funded",
    "deadline": "2026-12-31",
    "official_url": "https://example.com/aws-cert",
    "degree_levels": ["certificate"],
    "description": "Full sponsorship for AWS certification exams"
  }
}
```

Then add custom documents:
```json
[
  {
    "tool": "add_custom_document",
    "input": {
      "id_or_slug": "aws-cloud-certification-sponsorship",
      "name": "Government-issued ID",
      "required": true
    }
  },
  {
    "tool": "add_custom_document",
    "input": {
      "id_or_slug": "aws-cloud-certification-sponsorship",
      "name": "Statement of Interest",
      "description": "Why you want this certification (300 words)",
      "required": true
    }
  },
  {
    "tool": "add_custom_document",
    "input": {
      "id_or_slug": "aws-cloud-certification-sponsorship",
      "name": "Technical Assessment",
      "description": "Complete the online aptitude test",
      "required": true
    }
  }
]
```

---

## How Documents Work

### Three layers of document requirements:

1. **Flat defaults** (scholarship-level): The 8 boolean toggles + cement/flexible
   fields on the scholarship itself. Used when no per-level overrides exist.

2. **Per-degree-level overrides** (`degree_documents`): Different requirements for
   each degree level. When present, the detail page shows tabs per level.

3. **Custom documents** (`custom_documents`): Any document the admin adds —
   portfolio, video essay, workshop certificate, etc. Can be global (all levels)
   or per-level.

### Priority:
- Per-level overrides take precedence over flat defaults
- Custom documents are always shown alongside standard documents
- Admin can mix all three layers

---

## Best Practices for Agents

1. **Before adding a scholarship**: Use `list_scholarships` to check for duplicates
2. **Use slugs**: `id_or_slug` accepts both UUIDs and URL slugs — slugs are more readable
3. **Auto-derivation**: Omit document fields you're unsure about — the system will
   derive sensible defaults from the degree level
4. **Custom docs for non-standard programs**: Use `add_custom_document` for
   certifications, workshops, events, summer programs — anything that doesn't fit
   the standard academic model
5. **Degree-specific custom docs**: Set `degree_level` on custom docs to show them
   only for specific levels (e.g., "Research Publications" only for PhD)
6. **All writes go to review**: Submissions are `pending_review` until admin approves

---

## Previous Degree Values

| Value | Used For |
|-------|----------|
| `high_school_diploma` | Bachelor scholarships |
| `bachelor_degree` | Master's / Direct PhD scholarships |
| `master_degree` | PhD scholarships |
| `phd_degree` | Postdoc scholarships |
| `none` | No previous degree required |

## Standardized Test Values

| Value | Used For |
|-------|----------|
| `sat_act` | Bachelor scholarships |
| `gre_gmat` | Master's scholarships |
| `gre` | PhD / Direct PhD scholarships |
| `gmat` | MBA / Business programs |
| `none` | No test required (postdoc, certificate, etc.) |
