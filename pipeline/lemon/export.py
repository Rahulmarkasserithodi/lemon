"""Export per-product JSON artifacts to data/processed/.

Two-pass algorithm:
  Pass 1 — extractions cache → KM per product → identify publishable set.
  Pass 2 — stream reviews file → collect ≤3 anonymised text snippets per failure mode.

Writes:
  data/processed/index.json
  data/processed/products/{parent_asin}.json
  data/processed/hero_pairs.json   (stub; populated by pairs.py)

Run:
    python -m lemon.export
    python -m lemon.export --no-snippets   # skip review stream (faster)
"""

import argparse
import gzip
import json
import sqlite3
from collections import defaultdict
from pathlib import Path

from . import config
from .extract import open_cache, review_key
from .select import load_meta
from .survival import cost_per_year, fit_km, to_observation


# ── helpers ──────────────────────────────────────────────────────────────────

def _load_extractions(db: sqlite3.Connection) -> dict[str, list[dict]]:
    """Return {parent_asin: [result, ...]} for all cached entries."""
    grouped: dict[str, list[dict]] = defaultdict(list)
    for asin, result_json in db.execute("SELECT parent_asin, result FROM extractions"):
        grouped[asin].append(json.loads(result_json))
    return dict(grouped)


def _flat_cache(db: sqlite3.Connection) -> dict[str, dict]:
    """Return {key: result} — needed to look up results during review stream."""
    return {k: json.loads(v) for k, v in db.execute("SELECT key, result FROM extractions")}


def _failure_hist(results: list[dict]) -> list[dict]:
    counts: dict[str, int] = defaultdict(int)
    for r in results:
        if r.get("failed") and (r.get("confidence") or 0) >= config.MIN_CONFIDENCE:
            mode = r.get("failure_mode") or "other"
            counts[mode] += 1
    return sorted(
        [{"mode": m, "count": c} for m, c in counts.items()],
        key=lambda x: -x["count"],
    )


def _collect_snippets(
    reviews_path: Path,
    target_asins: set[str],
    key_to_result: dict[str, dict],
    max_per_mode: int = 3,
    snippet_len: int = 400,
) -> dict[str, dict[str, list[str]]]:
    """Stream reviews, return {asin: {mode: [snippet, ...]}} for published products."""
    snippets: dict[str, dict[str, list[str]]] = defaultdict(lambda: defaultdict(list))
    with gzip.open(reviews_path, "rt", encoding="utf-8") as f:
        for line in f:
            r = json.loads(line)
            asin = r.get("parent_asin") or r.get("asin")
            if asin not in target_asins:
                continue
            result = key_to_result.get(review_key(r))
            if not result:
                continue
            if not result.get("failed") or (result.get("confidence") or 0) < config.MIN_CONFIDENCE:
                continue
            mode = result.get("failure_mode") or "other"
            bucket = snippets[asin][mode]
            if len(bucket) >= max_per_mode:
                continue
            text = (r.get("text") or "").strip()[:snippet_len]
            if text:
                bucket.append(text)
    return {a: dict(m) for a, m in snippets.items()}


# ── main export ───────────────────────────────────────────────────────────────

def export(skip_snippets: bool = False) -> None:
    config.PROCESSED.mkdir(parents=True, exist_ok=True)
    (config.PROCESSED / "products").mkdir(exist_ok=True)

    # ── Pass 1: load meta + extractions, fit KM ──────────────────────────────
    print("Loading meta …")
    meta = load_meta()
    meta_idx: dict[str, dict] = meta.set_index("parent_asin").to_dict("index")

    print("Loading extractions from cache …")
    db = open_cache()
    by_asin = _load_extractions(db)
    flat = _flat_cache(db)
    db.close()

    index_entries: list[dict] = []
    products: dict[str, dict] = {}

    print(f"Fitting KM curves for {len(by_asin):,} products …")
    for asin, results in by_asin.items():
        observations = [o for r in results if (o := to_observation(r)) is not None]
        km = fit_km(observations)
        if km is None:
            continue

        m = meta_idx.get(asin, {})
        price = m.get("price")
        cpy = cost_per_year(price, km)
        hist = _failure_hist(results)

        products[asin] = {
            "parent_asin": asin,
            "title": m.get("title", asin),
            "brand": m.get("brand", ""),
            "image": m.get("image"),
            "price": price,
            "average_rating": m.get("average_rating"),
            "n_obs": km.n_obs,
            "n_events": km.n_events,
            "median_months": km.median_months,
            "median_is_lower_bound": km.median_is_lower_bound,
            "cost_per_year": cpy,
            "curve": km.curve,
            "failure_modes": hist,
            "snippets": {},
        }
        index_entries.append(
            {
                "parent_asin": asin,
                "title": m.get("title", asin),
                "brand": m.get("brand", ""),
                "image": m.get("image"),
                "subcategory": m.get("subcategory", ""),
                "price": price,
                "average_rating": m.get("average_rating"),
                "n_obs": km.n_obs,
                "n_events": km.n_events,
                "median_months": km.median_months,
                "median_is_lower_bound": km.median_is_lower_bound,
                "cost_per_year": cpy,
            }
        )

    print(
        f"  → {len(products):,} publishable products "
        f"(≥{config.MIN_OBSERVATIONS} obs, ≥{config.MIN_EVENTS} events)"
    )

    # ── Pass 2: collect snippets ──────────────────────────────────────────────
    if not skip_snippets and config.REVIEWS_FILE.exists():
        print("Collecting snippets (streaming reviews) …")
        snips = _collect_snippets(config.REVIEWS_FILE, set(products), flat)
        for asin, mode_snips in snips.items():
            if asin in products:
                products[asin]["snippets"] = mode_snips
    elif not skip_snippets:
        print("  WARNING: reviews file not found — skipping snippets")

    # ── Write outputs ─────────────────────────────────────────────────────────
    for asin, data in products.items():
        path = config.PROCESSED / "products" / f"{asin}.json"
        path.write_text(json.dumps(data, indent=2))

    index_entries.sort(key=lambda x: -(x.get("n_events") or 0))
    (config.PROCESSED / "index.json").write_text(json.dumps(index_entries, indent=2))

    pairs_file = config.PROCESSED / "hero_pairs.json"
    if not pairs_file.exists():
        pairs_file.write_text(json.dumps([], indent=2))

    print(f"\nExported to {config.PROCESSED}/")
    print(f"  index.json       {len(index_entries)} products")
    print(f"  products/        {len(products)} JSON files")
    print(f"  hero_pairs.json  {'populated' if pairs_file.stat().st_size > 5 else 'stub — run python -m lemon.pairs'}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-snippets", action="store_true", help="Skip review stream (no snippets)")
    args = ap.parse_args()
    export(skip_snippets=args.no_snippets)
