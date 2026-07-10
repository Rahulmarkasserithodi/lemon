"""Extract a single product on demand → survival curve JSON.

This is the core the server calls when a product is clicked: pull the product's
reviews from the index, prefilter, extract each candidate via the (cached)
synchronous Gemini path, fit a Kaplan-Meier curve, and assemble the same JSON
shape the static exporter produces. Results are cached in SQLite, so the second
request for a product is instant and free — and every extracted product is also
written to data/processed/ so the offline demo layer fills up as you browse.
"""

import json
from collections import defaultdict
from typing import Optional

from . import config
from .extract import extract_sync, review_key
from .prefilter import is_candidate
from .survival import cost_per_year, fit_km, to_observation

# Relaxed thresholds for live exploration — the committed/"published" set still
# uses the stricter config values, but we let users peek at thinner products
# (clearly flagged in the payload via `published` and the n counts).
LIVE_MIN_OBS = 8
LIVE_MIN_EVENTS = 3


def _failure_hist(results: list[dict]) -> list[dict]:
    counts: dict[str, int] = defaultdict(int)
    for r in results:
        if r.get("failed") and (r.get("confidence") or 0) >= config.MIN_CONFIDENCE:
            counts[r.get("failure_mode") or "other"] += 1
    return sorted(
        [{"mode": m, "count": c} for m, c in counts.items()], key=lambda x: -x["count"]
    )


def _snippets(
    reviews: list[dict],
    results_by_key: dict[str, dict],
    max_per_mode: int = 3,
    snippet_len: int = 400,
) -> dict[str, list[str]]:
    out: dict[str, list[str]] = defaultdict(list)
    for r in reviews:
        res = results_by_key.get(review_key(r))
        if not res or not res.get("failed"):
            continue
        if (res.get("confidence") or 0) < config.MIN_CONFIDENCE:
            continue
        mode = res.get("failure_mode") or "other"
        if len(out[mode]) >= max_per_mode:
            continue
        text = (r.get("text") or "").strip()[:snippet_len]
        if text:
            out[mode].append(text)
    return dict(out)


def build_product(
    asin: str,
    meta_row: dict,
    reviews: list[dict],
    client,
    db,
    *,
    persist: bool = True,
) -> dict:
    """Extract one product and return its survival-curve payload.

    Returns a dict with either a fitted curve (`curve` non-empty) or, when the
    product has too few usable observations, `curve: []` and `published: False`
    so the caller/UI can explain why.
    """
    candidates = [r for r in reviews if is_candidate(r.get("text") or "")]

    results_by_key: dict[str, dict] = {}
    for r in candidates:
        res = extract_sync(client, r, db)
        results_by_key[review_key(r)] = res

    results = list(results_by_key.values())
    observations = [o for res in results if (o := to_observation(res)) is not None]

    km = fit_km(observations, min_obs=LIVE_MIN_OBS, min_events=LIVE_MIN_EVENTS)
    price = meta_row.get("price")

    base = {
        "parent_asin": asin,
        "title": meta_row.get("title", asin),
        "brand": meta_row.get("brand", ""),
        "price": price,
        "average_rating": meta_row.get("average_rating"),
        "n_reviews": len(reviews),
        "n_candidates": len(candidates),
    }

    if km is None:
        base.update(
            {
                "n_obs": len(observations),
                "n_events": sum(1 for _, e in observations if e),
                "median_months": None,
                "median_is_lower_bound": False,
                "cost_per_year": None,
                "curve": [],
                "failure_modes": _failure_hist(results),
                "snippets": {},
                "published": False,
            }
        )
        return base

    base.update(
        {
            "n_obs": km.n_obs,
            "n_events": km.n_events,
            "median_months": km.median_months,
            "median_is_lower_bound": km.median_is_lower_bound,
            "cost_per_year": cost_per_year(price, km),
            "curve": km.curve,
            "failure_modes": _failure_hist(results),
            "snippets": _snippets(reviews, results_by_key),
            "published": km.n_obs >= config.MIN_OBSERVATIONS
            and km.n_events >= config.MIN_EVENTS,
        }
    )

    if persist:
        _persist(base)
    return base


def _persist(product: dict) -> None:
    """Write the product JSON and upsert it into index.json (offline demo layer)."""
    (config.PROCESSED / "products").mkdir(parents=True, exist_ok=True)
    asin = product["parent_asin"]
    (config.PROCESSED / "products" / f"{asin}.json").write_text(json.dumps(product, indent=2))

    index_path = config.PROCESSED / "index.json"
    try:
        index = json.loads(index_path.read_text()) if index_path.exists() else []
    except json.JSONDecodeError:
        index = []
    entry = {
        "parent_asin": asin,
        "title": product["title"],
        "brand": product["brand"],
        "subcategory": "",
        "price": product["price"],
        "average_rating": product["average_rating"],
        "n_obs": product["n_obs"],
        "n_events": product["n_events"],
        "median_months": product["median_months"],
        "median_is_lower_bound": product["median_is_lower_bound"],
        "cost_per_year": product["cost_per_year"],
    }
    index = [e for e in index if e.get("parent_asin") != asin] + [entry]
    index.sort(key=lambda x: -(x.get("n_events") or 0))
    index_path.write_text(json.dumps(index, indent=2))
