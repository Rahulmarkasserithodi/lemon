"""Streaming readers for the gzipped category files (no decompression on disk)."""

import gzip
import json
from pathlib import Path
from typing import Iterator, Optional

from . import config


def iter_jsonl_gz(path: Path, limit: Optional[int] = None) -> Iterator[dict]:
    with gzip.open(path, "rt", encoding="utf-8") as f:
        for i, line in enumerate(f):
            if limit is not None and i >= limit:
                break
            line = line.strip()
            if line:
                yield json.loads(line)


def iter_reviews(limit: Optional[int] = None) -> Iterator[dict]:
    return iter_jsonl_gz(config.REVIEWS_FILE, limit)


def iter_meta(limit: Optional[int] = None) -> Iterator[dict]:
    return iter_jsonl_gz(config.META_FILE, limit)


def parse_price(raw) -> Optional[float]:
    """Meta price is a string like '$79.99' or None; normalise to float."""
    if raw in (None, "", "None"):
        return None
    try:
        return float(str(raw).replace("$", "").replace(",", "").split()[0])
    except (ValueError, IndexError):
        return None
