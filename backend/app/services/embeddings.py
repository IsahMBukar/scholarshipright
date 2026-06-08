"""Embedding service — TF-IDF (scikit-learn, zero download, instant)."""
import numpy as np
import re
from collections import Counter
from typing import Optional
import hashlib

# Vocabulary size for TF-IDF hashing
VOCAB_SIZE = 384  # Match the expected embedding dimension


def _tokenize(text: str) -> list[str]:
    """Simple tokenizer: lowercase, split on non-alphanumeric, remove stopwords."""
    stopwords = {
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
        'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
        'could', 'should', 'may', 'might', 'shall', 'can', 'this', 'that',
        'these', 'those', 'it', 'its', 'i', 'we', 'you', 'he', 'she', 'they',
        'me', 'us', 'him', 'her', 'them', 'my', 'your', 'his', 'our', 'their',
    }
    tokens = re.findall(r'[a-z0-9]+', text.lower())
    return [t for t in tokens if t not in stopwords and len(t) > 1]


def _hash_token(token: str, dim: int = VOCAB_SIZE) -> int:
    """Hash a token to a bucket index."""
    return int(hashlib.md5(token.encode()).hexdigest(), 16) % dim


def generate_embedding(text: str) -> list[float]:
    """Generate a 384-dim TF-IDF-style embedding using feature hashing."""
    tokens = _tokenize(text)
    if not tokens:
        return [0.0] * VOCAB_SIZE

    # Term frequency
    tf = Counter(tokens)
    total = len(tokens)

    # Feature hashing into VOCAB_SIZE buckets
    vec = [0.0] * VOCAB_SIZE
    for token, count in tf.items():
        idx = _hash_token(token)
        # Log-frequency weighting
        vec[idx] += 1.0 + np.log(count / total) if count > 0 else 0.0

    # L2 normalize
    norm = np.linalg.norm(vec)
    if norm > 0:
        vec = [v / norm for v in vec]

    return vec


def generate_embeddings_batch(texts: list[str]) -> list[list[float]]:
    """Generate embeddings for multiple texts."""
    return [generate_embedding(t) for t in texts]


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two vectors."""
    a_arr = np.array(a)
    b_arr = np.array(b)
    dot = np.dot(a_arr, b_arr)
    norm = np.linalg.norm(a_arr) * np.linalg.norm(b_arr)
    if norm == 0:
        return 0.0
    return float(dot / norm)


def profile_to_text(profile) -> str:
    """Convert a profile object to text for embedding."""
    parts = []
    if profile.degree_level:
        parts.append(f"{profile.degree_level} student")
    if profile.field_of_study:
        parts.append(f"in {profile.field_of_study.replace('_', ' ')}")
    if profile.university:
        parts.append(f"at {profile.university}")
    if profile.country_of_origin:
        parts.append(f"from {profile.country_of_origin}")
    if profile.target_degree:
        parts.append(f"seeking {profile.target_degree}")
    if profile.target_fields:
        parts.append(f"interested in {', '.join(f.replace('_', ' ') for f in profile.target_fields)}")
    if profile.target_countries:
        parts.append(f"targeting {', '.join(profile.target_countries)}")
    if profile.research_interests:
        parts.append(f"research in {', '.join(r.replace('_', ' ') for r in profile.research_interests)}")
    if profile.languages:
        parts.append(f"speaks {', '.join(profile.languages)}")
    if profile.has_ielts and profile.ielts_score:
        parts.append(f"IELTS {profile.ielts_score}")
    return ". ".join(parts) if parts else "student seeking scholarships"


def scholarship_to_text(scholarship) -> str:
    """Convert a scholarship object to text for embedding."""
    parts = [scholarship.name]
    if scholarship.description:
        parts.append(scholarship.description[:500])
    parts.append(f"Hosted in {scholarship.host_country}")
    if scholarship.provider:
        parts.append(f"by {scholarship.provider}")
    if scholarship.degree_levels:
        parts.append(f"For {', '.join(scholarship.degree_levels)} students")
    if scholarship.fields_of_study:
        parts.append(f"in {', '.join(f.replace('_', ' ') for f in scholarship.fields_of_study)}")
    if scholarship.funding_type:
        parts.append(f"Funding: {scholarship.funding_type.replace('_', ' ')}")
    if scholarship.benefits_summary:
        parts.append(scholarship.benefits_summary[:200])
    return ". ".join(parts)
