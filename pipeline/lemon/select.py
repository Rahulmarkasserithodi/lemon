"""Select durable-appliance products from meta (not parts/filters/accessories).

Reads meta_Appliances.jsonl.gz, filters to products that are actual devices
(not replacement parts, filters, or accessories), and returns a DataFrame.

Run:
    python -m lemon.select            # print stats
    python -m lemon.select --sample   # also print 5 random rows
"""

import gzip
import json
import re
import sys
from pathlib import Path

import pandas as pd

from . import config

# Title / category tokens that flag a product as a non-device
_EXCL = re.compile(
    r"""\b(
        filter|filters|replacement\s+filter|
        part|parts|spare\s+part|
        accessory|accessories|
        element|heating\s+element|
        blade|blades|paddle|paddle\s+blade|
        brush|brushes|
        gasket|seal|o-?ring|hose|hoses|
        knob|knobs|handle|handles|hinge|
        bulb|lamp|light\s+kit|
        belt|belts|drum\s+belt|
        bag|bags|dust\s+bag|
        cartridge|capsule|pod|pods|
        ice\s+tray|ice\s+mold|
        cleaner\s+tablet|descaler|descaling|
        grill\s+pad|drip\s+tray|drip\s+pan|
        rack|racks|shelf|shelves|
        jar|pitcher|carafe|
        water\s+line|supply\s+line|
        plug\s+adapter|power\s+cord|
        circuit\s+board|control\s+board
    )\b""",
    re.IGNORECASE | re.VERBOSE,
)

_PRICE_RE = re.compile(r"\$?([\d,]+\.?\d*)")


def _parse_price(raw) -> float | None:
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw) if raw > 0 else None
    if isinstance(raw, str):
        s = raw.replace(",", "")
        m = _PRICE_RE.search(s)
        return float(m.group(1)) if m else None
    if isinstance(raw, list) and raw:
        return _parse_price(raw[0])
    return None


def _is_device(title: str | None, categories) -> bool:
    cats_flat = ""
    if isinstance(categories, list):
        for c in categories:
            cats_flat += " " + (c if isinstance(c, str) else " ".join(c if isinstance(c, list) else []))
    text = (title or "") + cats_flat
    return not bool(_EXCL.search(text))


def _deepest_category(categories) -> str:
    """Return the last (most specific) category string, or empty."""
    if not isinstance(categories, list) or not categories:
        return ""
    last = categories[-1]
    if isinstance(last, list) and last:
        return str(last[-1])
    return str(last)


def load_meta(path: Path | None = None) -> pd.DataFrame:
    path = path or config.META_FILE
    rows = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            rec = json.loads(line)
            parent_asin = rec.get("parent_asin") or rec.get("asin")
            if not parent_asin:
                continue
            title = rec.get("title") or ""
            categories = rec.get("categories") or []
            if not _is_device(title, categories):
                continue
            rows.append(
                {
                    "parent_asin": parent_asin,
                    "title": title[:200],
                    "price": _parse_price(rec.get("price")),
                    "brand": rec.get("store") or rec.get("brand") or "",
                    "average_rating": rec.get("average_rating"),
                    "rating_number": rec.get("rating_number") or 0,
                    "main_category": rec.get("main_category") or config.CATEGORY,
                    "subcategory": _deepest_category(categories),
                }
            )
    return pd.DataFrame(rows).drop_duplicates(subset=["parent_asin"])


if __name__ == "__main__":
    print("Loading meta …")
    df = load_meta()
    print(f"  {len(df):,} durable-device products (parts/filters excluded)")
    has_price = df["price"].notna().sum()
    print(f"  {has_price:,} ({has_price / len(df):.0%}) have a parseable price")
    priced = df["price"].dropna()
    print(f"  price range: ${priced.min():.0f} – ${priced.max():.0f}")
    print(f"  top brands:\n{df['brand'].value_counts().head(10).to_string()}")
    if "--sample" in sys.argv:
        print("\nSample rows:")
        print(df.sample(5).to_string())
