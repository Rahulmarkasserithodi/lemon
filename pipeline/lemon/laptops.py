"""Ingest laptops (from the Electronics category) into the shared corpus.

Laptops live in Amazon's giant Electronics category, so rather than index all
~44M Electronics reviews we:
  1. filter the Electronics meta down to real laptops (not accessories/parts),
  2. stream the Electronics reviews once, keeping only laptop reviews, and
     append them to the shared reviews.db,
  3. merge the laptop products into catalog.json and the child→parent asin map.

Everything downstream (prefilter, extraction, survival, server, exports) is
category-agnostic, so no other pipeline code changes.

Run (after `python -m lemon.download --category Electronics`):
    python -m lemon.laptops
    python -m lemon.laptops --force   # re-ingest (delete existing laptop reviews first)
"""

import argparse
import json
import math

from . import config
from .reviews_index import open_reviews_db
from .select import _is_laptop, load_meta, open_text


def _resolve(stem: str):
    """Prefer a gzipped file if present, else the plain .jsonl (HF ships plain)."""
    gz = config.RAW / f"{stem}.jsonl.gz"
    plain = config.RAW / f"{stem}.jsonl"
    return gz if gz.exists() else plain


ELECTRONICS_META = _resolve("meta_Electronics")
ELECTRONICS_REVIEWS = _resolve("Electronics")

_BATCH = 20_000
MIN_REVIEWS = 15


def _clean(v):
    """NaN/blank → None (JSON-friendly)."""
    if v is None:
        return None
    if isinstance(v, float) and math.isnan(v):
        return None
    return v


def _stream_reviews(db, laptop_parents: set[str], force: bool) -> None:
    """Append laptop reviews to reviews.db and merge the child→parent asin map."""
    sample = next(iter(laptop_parents))
    already = db.execute("SELECT 1 FROM reviews WHERE parent_asin=? LIMIT 1", (sample,)).fetchone()
    if already and not force:
        print("  laptop reviews already present (pass --force to re-ingest) — skipping stream")
        return

    if force and already:
        print("  --force: deleting existing laptop reviews …", flush=True)
        plist = list(laptop_parents)
        for i in range(0, len(plist), 500):
            chunk = plist[i : i + 500]
            db.execute(
                f"DELETE FROM reviews WHERE parent_asin IN ({','.join('?' * len(chunk))})", chunk
            )
        db.commit()

    print("Streaming Electronics reviews — keeping laptop reviews only …", flush=True)
    asin_map: dict[str, str] = {}
    batch: list[tuple] = []
    kept = seen = 0
    with open_text(ELECTRONICS_REVIEWS) as f:
        for line in f:
            seen += 1
            if seen % 2_000_000 == 0:
                print(f"  scanned {seen:,} reviews … kept {kept:,}", flush=True)
            r = json.loads(line)
            parent = r.get("parent_asin") or r.get("asin")
            if parent not in laptop_parents:
                continue
            batch.append(
                (parent, r.get("user_id"), r.get("timestamp"), r.get("rating"),
                 r.get("title"), r.get("text"))
            )
            asin_map[r.get("asin") or parent] = parent
            kept += 1
            if len(batch) >= _BATCH:
                db.executemany("INSERT INTO reviews VALUES (?,?,?,?,?,?)", batch)
                batch.clear()
    if batch:
        db.executemany("INSERT INTO reviews VALUES (?,?,?,?,?,?)", batch)
    db.commit()
    print(f"  kept {kept:,} laptop reviews across {len({a for a in asin_map.values()}):,} products")
    _merge_asin_map(asin_map)


def _counts_for(db, laptop_parents: set[str]) -> tuple[dict[str, int], dict[str, int]]:
    """Reviews-per-product and latest review timestamp for laptop parents."""
    counts, latest = {}, {}
    for a, n, mx in db.execute(
        "SELECT parent_asin, COUNT(*), MAX(timestamp) FROM reviews GROUP BY parent_asin"
    ):
        if a in laptop_parents:
            counts[a] = n
            latest[a] = mx
    return counts, latest


def _merge_catalog(meta, counts: dict[str, int], latest: dict[str, int], min_reviews: int) -> None:
    by_asin = {row.parent_asin: row for row in meta.itertuples(index=False)}
    new_entries = []
    for pa, n in counts.items():
        if n < min_reviews:
            continue
        m = by_asin.get(pa)
        if m is None:
            continue
        new_entries.append(
            {
                "parent_asin": pa,
                "title": m.title,
                "brand": m.brand,
                "price": _clean(m.price),
                "average_rating": _clean(m.average_rating),
                "subcategory": m.subcategory,
                "n_reviews": n,
                "latest_review": latest.get(pa),
                "image": m.image if isinstance(m.image, str) else None,
            }
        )
    existing = json.loads(config.CATALOG_FILE.read_text()) if config.CATALOG_FILE.exists() else []
    new_ids = {e["parent_asin"] for e in new_entries}
    merged = [c for c in existing if c["parent_asin"] not in new_ids] + new_entries
    merged.sort(key=lambda c: -(c.get("n_reviews") or 0))
    config.CATALOG_FILE.write_text(json.dumps(merged))
    print(f"  catalog.json: +{len(new_entries):,} laptops (≥{min_reviews} reviews) → {len(merged):,} total")


def _merge_asin_map(asin_map: dict[str, str]) -> None:
    existing = json.loads(config.ASIN_MAP_FILE.read_text()) if config.ASIN_MAP_FILE.exists() else {}
    existing.update(asin_map)
    config.ASIN_MAP_FILE.write_text(json.dumps(existing))
    print(f"  asin_to_parent.json: {len(existing):,} mappings total")


def ingest(min_reviews: int = MIN_REVIEWS, force: bool = False) -> None:
    if not ELECTRONICS_META.exists() or not ELECTRONICS_REVIEWS.exists():
        raise SystemExit(
            "Electronics raw files missing — run "
            "`python -m lemon.download --category Electronics` first."
        )

    print("Loading laptop meta from Electronics …", flush=True)
    meta = load_meta(ELECTRONICS_META, keep=_is_laptop)
    laptop_parents = set(meta["parent_asin"])
    print(f"  {len(laptop_parents):,} laptop products after filtering")
    if not laptop_parents:
        raise SystemExit("No laptops matched the filter — check _is_laptop in select.py")

    db = open_reviews_db()
    try:
        _stream_reviews(db, laptop_parents, force)
        counts, latest = _counts_for(db, laptop_parents)
        _merge_catalog(meta, counts, latest, min_reviews)
    finally:
        db.close()
    print("\nDone. Laptops merged into the shared corpus (catalog + reviews.db + asin map).")
    print("Next: warm a few with `python -m lemon.product_service --asins <id,id,...>`")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Ingest laptops into the shared corpus")
    ap.add_argument("--min-reviews", type=int, default=MIN_REVIEWS)
    ap.add_argument("--force", action="store_true", help="re-ingest (delete existing laptop reviews first)")
    args = ap.parse_args()
    ingest(min_reviews=args.min_reviews, force=args.force)
