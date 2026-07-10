"""LLM extraction of survival observations from review text.

Strict JSON via Gemini structured output (response_schema), cached per review
in SQLite so reruns are free and deterministic. This module provides the
synchronous path used for validation; batch submission lives in batch.py.
"""

import enum
import hashlib
import json
import sqlite3
import time
from typing import Optional

from google import genai
from google.genai import errors as genai_errors
from google.genai import types
from pydantic import BaseModel

from . import config

# Dynamic Enum from the config vocabulary so the model is constrained to it.
# An Optional[Enum] field yields a nullable-enum schema the SDK accepts —
# unlike putting None inside a JSON-schema enum list, which it rejects.
FailureMode = enum.Enum("FailureMode", {m: m for m in config.FAILURE_MODES})

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
    failure_mode: Optional[FailureMode] = None
    confidence: float


def review_key(review: dict) -> str:
    """Stable cache key — the dataset has no review id."""
    raw = f"{review.get('user_id')}|{review.get('parent_asin')}|{review.get('timestamp')}"
    return hashlib.sha256(raw.encode()).hexdigest()


def open_cache() -> sqlite3.Connection:
    config.CACHE.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(config.EXTRACTION_CACHE_DB)
    # WAL + a busy timeout let concurrent product requests (each with its own
    # connection) read/write the cache without "database is locked" errors.
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA busy_timeout=10000")
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
    return types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=Extraction,
        temperature=0.0,
    )


def parse_extraction(raw_json: str) -> dict:
    """Normalise a raw JSON string into the cache dict shape (enum -> str)."""
    obj = Extraction.model_validate_json(raw_json)
    d = obj.model_dump()
    if d.get("failure_mode") is not None:
        d["failure_mode"] = d["failure_mode"].value
    return d


def _generate_with_backoff(
    client: genai.Client, review: dict, max_retries: int = 6
) -> str:
    """Call the model, retrying on 429/503 with exponential backoff.

    The free tier caps requests-per-minute; without this a bulk run dies on the
    first burst of 429s. Honors the server's RetryInfo delay when present.
    """
    delay = 5.0
    for attempt in range(max_retries):
        try:
            resp = client.models.generate_content(
                model=config.GEMINI_MODEL,
                contents=build_prompt(review),
                config=gen_config(),
            )
            return resp.text
        except genai_errors.ClientError as exc:
            if exc.code != 429 or attempt == max_retries - 1:
                raise
            time.sleep(_retry_delay(exc, delay))
            delay = min(delay * 2, 60)
        except genai_errors.ServerError:
            if attempt == max_retries - 1:
                raise
            time.sleep(delay)
            delay = min(delay * 2, 60)
    raise RuntimeError("unreachable")


def _retry_delay(exc: Exception, fallback: float) -> float:
    """Pull the server-suggested retry delay (seconds) from a 429, else fallback."""
    try:
        for d in exc.details.get("error", {}).get("details", []):  # type: ignore[attr-defined]
            if d.get("@type", "").endswith("RetryInfo"):
                secs = d.get("retryDelay", "").rstrip("s")
                return max(float(secs), fallback)
    except (AttributeError, ValueError, TypeError):
        pass
    return fallback


def extract_sync(client: genai.Client, review: dict, db: sqlite3.Connection) -> dict:
    """Extract one review (synchronous API), consulting/filling the cache."""
    key = review_key(review)
    cached = cache_get(db, key)
    if cached is not None:
        return cached
    raw = _generate_with_backoff(client, review)
    result = parse_extraction(raw)
    cache_put(db, key, review.get("parent_asin", ""), result)
    db.commit()
    return result


def extract_many(
    client: genai.Client,
    reviews: list[dict],
    db: sqlite3.Connection,
    max_workers: int | None = None,
) -> dict[str, dict]:
    """Extract many reviews, returning {review_key: result}.

    Cache reads/writes stay on the caller's thread (SQLite connections have
    thread affinity); only the independent network calls are parallelised. A
    single review that fails after retries is skipped rather than failing the
    whole product.
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    results: dict[str, dict] = {}
    todo: list[tuple[str, dict]] = []
    for r in reviews:
        key = review_key(r)
        cached = cache_get(db, key)
        if cached is not None:
            results[key] = cached
        else:
            todo.append((key, r))

    if not todo:
        return results

    workers = max_workers or config.EXTRACTION_CONCURRENCY
    workers = max(1, min(workers, len(todo)))

    def _call(item: tuple[str, dict]) -> tuple[str, dict, dict]:
        key, review = item
        return key, review, parse_extraction(_generate_with_backoff(client, review))

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(_call, item) for item in todo]
        for fut in as_completed(futures):
            try:
                key, review, result = fut.result()
            except Exception:
                continue  # skip a review that never extracted cleanly
            results[key] = result
            cache_put(db, key, review.get("parent_asin", ""), result)

    db.commit()
    return results
