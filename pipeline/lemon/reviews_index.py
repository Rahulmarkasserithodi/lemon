"""Fast per-product review lookup + a browsable product catalog.

Scanning the 886 MB reviews file on every request is far too slow, so we build
a one-time SQLite index (`reviews.db`) keyed by parent_asin. From that index and
the product meta we also build a `catalog.json` — the browse list the server and
frontend use before any extraction has happened.

Run once:
    python -m lemon.reviews_index build          # build reviews.db
    python -m lemon.reviews_index catalog         # build catalog.json
    python -m lemon.reviews_index all             # both
"""

import argparse
import gzip
import json
import sqlite3
import sys

from . import config
from .select import load_meta

_BATCH = 20_000


def open_reviews_db() -> sqlite3.Connection:
    config.CACHE.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(config.REVIEWS_DB)
    db.execute(
        "CREATE TABLE IF NOT EXISTS reviews ("
        " parent_asin TEXT, user_id TEXT, timestamp INTEGER,"
        " rating REAL, title TEXT, text TEXT)"
    )
    return db


def build_index(force: bool = False) -> None:
    """Stream the reviews file into an indexed SQLite table."""
    if config.REVIEWS_DB.exists() and not force:
        n = sqlite3.connect(config.REVIEWS_DB).execute(
            "SELECT COUNT(*) FROM reviews"
        ).fetchone()[0]
        print(f"  reviews.db already built ({n:,} rows; pass --force to rebuild)")
        return
    if not config.REVIEWS_FILE.exists():
        sys.exit(f"ERROR: reviews file not found at {config.REVIEWS_FILE}")

    config.REVIEWS_DB.unlink(missing_ok=True)
    db = open_reviews_db()
    batch: list[tuple] = []
    total = 0
    print(f"Building reviews.db from {config.REVIEWS_FILE.name} …")
    with gzip.open(config.REVIEWS_FILE, "rt", encoding="utf-8") as f:
        for line in f:
            r = json.loads(line)
            batch.append(
                (
                    r.get("parent_asin") or r.get("asin"),
                    r.get("user_id"),
                    r.get("timestamp"),
                    r.get("rating"),
                    r.get("title"),
                    r.get("text"),
                )
            )
            if len(batch) >= _BATCH:
                db.executemany("INSERT INTO reviews VALUES (?,?,?,?,?,?)", batch)
                total += len(batch)
                batch.clear()
                if total % 200_000 == 0:
                    print(f"  {total:,} rows …", flush=True)
    if batch:
        db.executemany("INSERT INTO reviews VALUES (?,?,?,?,?,?)", batch)
        total += len(batch)
    print("  creating index on parent_asin …", flush=True)
    db.execute("CREATE INDEX idx_reviews_asin ON reviews(parent_asin)")
    db.commit()
    db.close()
    print(f"  done — {total:,} reviews indexed at {config.REVIEWS_DB}")


def get_reviews(db: sqlite3.Connection, parent_asin: str) -> list[dict]:
    """All reviews for a product, as dicts matching the raw review shape."""
    rows = db.execute(
        "SELECT parent_asin, user_id, timestamp, rating, title, text"
        " FROM reviews WHERE parent_asin=?",
        (parent_asin,),
    ).fetchall()
    return [
        {
            "parent_asin": r[0],
            "user_id": r[1],
            "timestamp": r[2],
            "rating": r[3],
            "title": r[4],
            "text": r[5],
        }
        for r in rows
    ]


def build_catalog(force: bool = False, min_reviews: int = 15) -> None:
    """Join durable-device meta with per-product review counts → catalog.json."""
    if config.CATALOG_FILE.exists() and not force:
        print(f"  catalog.json already built (pass --force to rebuild)")
        return
    if not config.REVIEWS_DB.exists():
        sys.exit("ERROR: build reviews.db first (python -m lemon.reviews_index build)")

    print("Loading durable-device meta …")
    meta = load_meta()
    print(f"  {len(meta):,} devices; counting reviews per product …")

    db = sqlite3.connect(config.REVIEWS_DB)
    counts = dict(db.execute("SELECT parent_asin, COUNT(*) FROM reviews GROUP BY parent_asin"))
    db.close()

    catalog = []
    for row in meta.itertuples(index=False):
        n = counts.get(row.parent_asin, 0)
        if n < min_reviews:
            continue
        catalog.append(
            {
                "parent_asin": row.parent_asin,
                "title": row.title,
                "brand": row.brand,
                "price": None if row.price != row.price else row.price,  # NaN -> None
                "average_rating": None if row.average_rating != row.average_rating else row.average_rating,
                "subcategory": row.subcategory,
                "n_reviews": n,
            }
        )
    catalog.sort(key=lambda c: -c["n_reviews"])
    config.CATALOG_FILE.write_text(json.dumps(catalog))
    print(f"  wrote {len(catalog):,} products (≥{min_reviews} reviews) to {config.CATALOG_FILE}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Build review index + catalog")
    ap.add_argument("command", choices=["build", "catalog", "all"])
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--min-reviews", type=int, default=15)
    args = ap.parse_args()

    if args.command in ("build", "all"):
        build_index(force=args.force)
    if args.command in ("catalog", "all"):
        build_catalog(force=args.force, min_reviews=args.min_reviews)
