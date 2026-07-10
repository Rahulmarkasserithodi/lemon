"""Automated hero-pair finder.

Scans data/processed/products/ for pairs where:
  - price within ±30% of each other
  - average_rating within ±0.4 stars
  - both n_events ≥ MIN_EVENTS (from config)
  - median lifespan ratio ≥ 1.6
  - CI bands don't overlap at the shorter product's median (clean visual separation)

Scores and ranks all qualifying pairs, writes the top N to hero_pairs.json.

Run:
    python -m lemon.pairs            # top 5
    python -m lemon.pairs --top 10
"""

import argparse
import json
import math
from pathlib import Path

from . import config


def _load_products() -> list[dict]:
    products_dir = config.PROCESSED / "products"
    if not products_dir.exists():
        raise SystemExit(f"No products directory at {products_dir}. Run export first.")
    products = []
    for p in products_dir.glob("*.json"):
        products.append(json.loads(p.read_text()))
    return products


def _ci_overlap(a: dict, b: dict) -> bool:
    """True if the CI bands of a and b visually overlap at a's median (the worse product)."""
    # Find survival value at a's median for both products' CI bands
    a_median = a.get("median_months") or a.get("median_display_months")
    if a_median is None:
        return True  # can't tell → assume overlap (conservative)

    def _s_at(product: dict, t: float) -> tuple[float, float]:
        """(lo, hi) at time t from the KM curve (step interpolation)."""
        curve = product.get("curve") or []
        lo, hi = 1.0, 1.0
        for pt in curve:
            if pt["t"] <= t:
                lo, hi = pt["lo"], pt["hi"]
            else:
                break
        return lo, hi

    a_lo, a_hi = _s_at(a, a_median)
    b_lo, b_hi = _s_at(b, a_median)
    # Overlapping if intervals intersect
    return not (b_lo > a_hi or a_lo > b_hi)


def find_pairs(products: list[dict], top_n: int = 5) -> list[dict]:
    # Index products with the needed fields
    valid = [
        p for p in products
        if (p.get("n_events") or 0) >= config.MIN_EVENTS
        and p.get("median_months") is not None
        and not p.get("median_is_lower_bound")
    ]

    scored: list[dict] = []
    for i in range(len(valid)):
        for j in range(i + 1, len(valid)):
            a, b = valid[i], valid[j]

            # Ensure a is the shorter-lived product
            if (a["median_months"] or 0) > (b["median_months"] or 0):
                a, b = b, a

            ratio = (b["median_months"] or 1) / max(a["median_months"] or 1, 0.1)
            if ratio < 1.6:
                continue

            # Price filter (both must have a price)
            pa, pb = a.get("price"), b.get("price")
            if pa and pb:
                price_ratio = max(pa, pb) / max(min(pa, pb), 0.01)
                if price_ratio > 1.30:  # same tier: higher price ≤ 1.3× the lower
                    continue
            # If one or both prices are missing, still include (just can't show cost_per_year comparison)

            # Rating filter
            ra, rb = a.get("average_rating"), b.get("average_rating")
            if ra is not None and rb is not None:
                if abs(ra - rb) > 0.4:
                    continue

            # CI band separation
            if _ci_overlap(a, b):
                continue

            # Score: prioritise large ratio + similar price/rating + high event counts
            score = (
                ratio
                + math.log1p(min(a.get("n_events", 0), b.get("n_events", 0)))
            )

            scored.append(
                {
                    "left": b["parent_asin"],   # longer-lived → left panel
                    "right": a["parent_asin"],  # shorter-lived → right panel
                    "left_title": b.get("title", ""),
                    "right_title": a.get("title", ""),
                    "left_median_months": b["median_months"],
                    "right_median_months": a["median_months"],
                    "median_ratio": round(ratio, 2),
                    "left_price": b.get("price"),
                    "right_price": a.get("price"),
                    "score": round(score, 3),
                    "note": "",
                }
            )

    scored.sort(key=lambda x: -x["score"])
    return scored[:top_n]


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", type=int, default=5)
    args = ap.parse_args()

    print("Loading exported products …")
    products = _load_products()
    print(f"  {len(products)} products loaded")

    pairs = find_pairs(products, top_n=args.top)
    if not pairs:
        print("No qualifying hero pairs found. Try lowering thresholds or running more extractions.")
    else:
        print(f"\nTop {len(pairs)} hero pair(s):\n")
        for i, p in enumerate(pairs, 1):
            print(f"  [{i}] score={p['score']}")
            print(f"       LEFT  {p['left']}  {p['left_title'][:60]}  {p['left_median_months']:.0f} mo")
            print(f"       RIGHT {p['right']}  {p['right_title'][:60]}  {p['right_median_months']:.0f} mo")
            print(f"       ratio={p['median_ratio']}x  prices={p['left_price']}/{p['right_price']}")
            print()

    # Write to hero_pairs.json (strip verbose title fields for the commit)
    compact = [
        {
            "left": p["left"],
            "right": p["right"],
            "note": p["note"],
            "median_ratio": p["median_ratio"],
        }
        for p in pairs
    ]
    out = config.PROCESSED / "hero_pairs.json"
    out.write_text(json.dumps(compact, indent=2))
    print(f"Written to {out}")
