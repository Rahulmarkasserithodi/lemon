"""Select durable-appliance products from meta (not parts/filters/accessories).

Reads meta_Appliances.jsonl.gz, filters to products that are actual devices
(not replacement parts, filters, or accessories), and returns a DataFrame.

Run:
    python -m lemon.select            # print stats
    python -m lemon.select --sample   # also print 5 random rows
"""

import gzip
import io
import json
import re
import sys
from pathlib import Path

import pandas as pd

from . import config


def open_text(path: Path) -> io.TextIOBase:
    """Open a .jsonl or .jsonl.gz file as UTF-8 text (source-agnostic)."""
    if str(path).endswith(".gz"):
        return gzip.open(path, "rt", encoding="utf-8")
    return open(path, "rt", encoding="utf-8")

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


def _cats_flat(categories) -> str:
    out = ""
    if isinstance(categories, list):
        for c in categories:
            out += " " + (c if isinstance(c, str) else " ".join(c if isinstance(c, list) else []))
    return out


def _is_device(title: str | None, categories) -> bool:
    text = (title or "") + _cats_flat(categories)
    return not bool(_EXCL.search(text))


# ── laptop selection (Electronics category) ───────────────────────────────────
# A real laptop: a laptop/notebook in the title or category, minus the huge long
# tail of laptop *accessories* and *parts* (cases, chargers, RAM, screens, …).
_LAPTOP_INCL = re.compile(
    r"\b(laptop|notebook|chromebook|macbook|ultrabook|thinkpad|ideapad|"
    r"chrome\s*book|note\s*book)\b",
    re.IGNORECASE,
)
_LAPTOP_EXCL = re.compile(
    r"""\b(
        case|sleeve|bag|backpack|briefcase|
        charger|adapter|power\s+cord|power\s+supply|ac\s+adapter|
        battery|batteries|
        screen\s+protector|privacy\s+(screen|filter)|screen\s+film|
        skin|decal|sticker|cover|shell|
        stand|riser|mount|cooling\s+pad|cooler|lap\s+desk|tray|
        dock|docking|hub|port\s+replicator|
        keyboard|keypad|mouse|mice|
        ram|memory\s+module|so-?dimm|
        ssd|hard\s+drive|hdd|nvme|storage\s+drive|
        cable|cord|dongle|
        replacement|repair|
        screen|display\s+panel|lcd|led\s+panel|digitizer|
        hinge|palmrest|bezel|housing|
        fan|heatsink|motherboard|logic\s+board|
        feet|rubber\s+foot|
        for\s+(macbook|laptop|notebook|chromebook|hp|dell|lenovo|asus|acer)
    )\b""",
    re.IGNORECASE | re.VERBOSE,
)


def _is_laptop(title: str | None, categories) -> bool:
    text = (title or "") + _cats_flat(categories)
    if not _LAPTOP_INCL.search(text):
        return False
    # Exclusions checked mainly on the title (categories can be broad).
    return not bool(_LAPTOP_EXCL.search(title or ""))


def _deepest_category(categories) -> str:
    """Return the last (most specific) category string, or empty."""
    if not isinstance(categories, list) or not categories:
        return ""
    last = categories[-1]
    if isinstance(last, list) and last:
        return str(last[-1])
    return str(last)


def _main_image(images) -> str | None:
    """Pick the product's primary photo URL from the meta `images` list.

    Each entry looks like {"thumb", "large", "variant", "hi_res"}. Prefer the
    MAIN variant and the `large` (~500px) size — crisp at the small sizes the UI
    renders, without pulling a 1500px hi-res for a thumbnail.
    """
    if not isinstance(images, list) or not images:
        return None
    main = next(
        (im for im in images if isinstance(im, dict) and im.get("variant") == "MAIN"),
        images[0],
    )
    if not isinstance(main, dict):
        return None
    return main.get("large") or main.get("hi_res") or main.get("thumb")


def load_meta(path: Path | None = None, keep=None) -> pd.DataFrame:
    """Load product meta, keeping only rows for which `keep(title, categories)`.

    Defaults to the appliance device filter; pass `_is_laptop` for the laptop
    corpus. Any category's meta file works via `path`.
    """
    path = path or config.META_FILE
    keep = keep or _is_device
    rows = []
    with open_text(path) as f:
        for line in f:
            rec = json.loads(line)
            parent_asin = rec.get("parent_asin") or rec.get("asin")
            if not parent_asin:
                continue
            title = rec.get("title") or ""
            categories = rec.get("categories") or []
            if not keep(title, categories):
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
                    "image": _main_image(rec.get("images")),
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
