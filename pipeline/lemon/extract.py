"""LLM extraction of survival observations from review text.

Strict JSON via Gemini structured output (response_schema), cached per review
in SQLite so reruns are free and deterministic. This module provides the
synchronous path used for validation; batch submission lives in batch.py.
"""

import hashlib
import json
import sqlite3
from typing import Optional

from google import genai
from google.genai import types
from pydantic import BaseModel, Field

from . import config

PROMPT = """\
You extract product-lifetime facts from an Amazon appliance review.

Rules:
- "failed" is true only if the reviewer says THIS product broke/stopped working.
- If a time-to-failure is stated ("died after 8 months"), set time_to_failure_months.
- If the product still works after a stated time ("2 years and still going"),
  set last_known_good_months instead.
- Convert to months (1 year=12, 1 week=0.25, 1 day=0.03). Use the product's
  age at failure / at review time, not warranty lengths or delivery times.
- If the review mentions a PREVIOUS or replaced unit's lifetime, ignore it.
- failure_mode: pick the single best value from the allowed list, else null.
- confidence: how sure you are about the extracted numbers (0-1).

Review title: {title}
Review (rating {rating}/5): {text}
"""


class Extraction(BaseModel):
    failed: bool
    time_to_failure_months: Optional[float] = None
    last_known_good_months: Optional[float] = None
    failure_mode: Optional[str] = Field(
        default=None, description="One of the allowed failure modes, or null."
    )
    confidence: float


def review_key(review: dict) -> str:
    """Stable cache key — the dataset has no review id."""
    raw = f"{review.get('user_id')}|{review.get('parent_asin')}|{review.get('timestamp')}"
    return hashlib.sha256(raw.encode()).hexdigest()


def open_cache() -> sqlite3.Connection:
    config.CACHE.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(config.EXTRACTION_CACHE_DB)
    db.execute(
        "CREATE TABLE IF NOT EXISTS extractions ("
        " key TEXT PRIMARY KEY, parent_asin TEXT, result TEXT)"
    )
    db.execute("CREATE INDEX IF NOT EXISTS idx_asin ON extractions(parent_asin)")
    return db


def cache_get(db: sqlite3.Connection, key: str) -> Optional[dict]:
    row = db.execute("SELECT result FROM extractions WHERE key=?", (key,)).fetchone()
    return json.loads(row[0]) if row else None


def cache_put(db: sqlite3.Connection, key: str, parent_asin: str, result: dict) -> None:
    db.execute(
        "INSERT OR REPLACE INTO extractions VALUES (?,?,?)",
        (key, parent_asin, json.dumps(result)),
    )


def build_prompt(review: dict) -> str:
    text = (review.get("text") or "")[:4000]
    return PROMPT.format(
        title=(review.get("title") or "")[:200], rating=review.get("rating"), text=text
    )


def gen_config() -> types.GenerateContentConfig:
    schema = Extraction.model_json_schema()
    schema["properties"]["failure_mode"]["enum"] = config.FAILURE_MODES + [None]
    return types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=schema,
        temperature=0.0,
    )


def extract_sync(client: genai.Client, review: dict, db: sqlite3.Connection) -> dict:
    """Extract one review (synchronous API), consulting/filling the cache."""
    key = review_key(review)
    cached = cache_get(db, key)
    if cached is not None:
        return cached
    resp = client.models.generate_content(
        model=config.GEMINI_MODEL,
        contents=build_prompt(review),
        config=gen_config(),
    )
    result = json.loads(resp.text)
    cache_put(db, key, review.get("parent_asin", ""), result)
    db.commit()
    return result
