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
from .extract import extract_many, review_key
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

    # Extract all uncached candidates concurrently (cached ones are free).
    results_by_key = extract_many(client, candidates, db)

    results = list(results_by_key.values())
    observations = [o for res in results if (o := to_observation(res)) is not None]

    km = fit_km(observations, min_obs=LIVE_MIN_OBS, min_events=LIVE_MIN_EVENTS)
    price = meta_row.get("price")

    base = {
        "parent_asin": asin,
        "title": meta_row.get("title", asin),
        "brand": meta_row.get("brand", ""),
        "image": meta_row.get("image"),
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


# ── warming CLI ───────────────────────────────────────────────────────────────
# Build a corpus by extracting a curated set of products through the same
# on-demand path the server uses. Every extraction is cached, so re-running is
# free; results also land in data/processed/ for the offline demo + pairs.py.

def warm_products(asins: list[str]) -> None:
    import os

    from google import genai

    from .extract import open_cache
    from .reviews_index import get_reviews, open_reviews_db

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise SystemExit("GEMINI_API_KEY not set (check the repo-root .env).")
    if not config.CATALOG_FILE.exists():
        raise SystemExit("catalog.json missing — run `python -m lemon.reviews_index all` first.")

    catalog = json.loads(config.CATALOG_FILE.read_text())
    by_asin = {c["parent_asin"]: c for c in catalog}
    client = genai.Client(api_key=api_key)
    reviews_db = open_reviews_db()
    cache = open_cache()

    print(f"Warming {len(asins)} product(s) …\n")
    try:
        for i, asin in enumerate(asins, 1):
            meta_row = by_asin.get(asin)
            if meta_row is None:
                print(f"  [{i:>2}/{len(asins)}] {asin}  SKIP (not in catalog)")
                continue
            reviews = get_reviews(reviews_db, asin)
            if not reviews:
                print(f"  [{i:>2}/{len(asins)}] {asin}  SKIP (no reviews indexed)")
                continue
            p = build_product(asin, meta_row, reviews, client, cache)
            flag = "PUB" if p["published"] else "   "
            med = p["median_months"]
            med_s = f"{med:>4.0f}mo" if med is not None else "  —  "
            cpy = p["cost_per_year"]
            cpy_s = f"${cpy:,.0f}/yr" if cpy is not None else "        "
            print(
                f"  [{i:>2}/{len(asins)}] {asin} {flag} "
                f"cand={p['n_candidates']:>3} obs={p['n_obs']:>3} ev={p['n_events']:>3} "
                f"{med_s} {cpy_s}  {p['title'][:44]}"
            )
    finally:
        reviews_db.close()
        cache.close()
    print("\nDone. Results cached + written to data/processed/.")


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description="Warm a corpus of products on demand.")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--asins", help="comma-separated parent_asins to extract")
    g.add_argument("--top", type=int, help="extract the top-N products by review count")
    args = ap.parse_args()

    if args.asins:
        targets = [a.strip() for a in args.asins.split(",") if a.strip()]
    else:
        cat = json.loads(config.CATALOG_FILE.read_text())
        cat.sort(key=lambda x: -(x.get("n_reviews") or 0))
        targets = [c["parent_asin"] for c in cat[: args.top]]

    warm_products(targets)
