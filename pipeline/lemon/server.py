"""Local FastAPI server for on-demand, cache-backed product extraction.

Endpoints:
  GET /api/health            → sanity/status (key present, index built, sizes)
  GET /api/catalog?q=&limit= → browsable product list (from catalog.json)
  GET /api/product/{asin}    → extract-on-demand survival curve (cached)

The first request for a product runs the LLM extraction (a few seconds); every
later request is served from the SQLite cache instantly. Run with:

    python -m lemon.server
    # or: uvicorn lemon.server:app --reload --port 8000
"""

import json
import os
import re
import threading
from collections import defaultdict

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import config
from . import product_service
from .reviews_index import get_reviews, open_reviews_db

app = FastAPI(title="Lemon API", version="0.1.0")

# Vite dev server origins.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

# ── Lazily-initialised shared state ───────────────────────────────────────────
_state: dict = {}

# Per-parent_asin locks so two *different* products extract concurrently while a
# duplicate request for the *same* product waits (and then hits the cache).
# WAL mode on the SQLite caches makes the concurrent connections safe.
_init_lock = threading.Lock()
_asin_locks: dict[str, threading.Lock] = defaultdict(threading.Lock)

# Amazon product URLs embed a 10-char ASIN, e.g. …/dp/B0XXXXXXXX/…
_ASIN_RE = re.compile(r"(?:/dp/|/gp/product/|/d/|[?&]asin=|^)([A-Z0-9]{10})(?:[/?&]|$)", re.I)


def parse_asin(raw: str) -> str | None:
    """Pull an ASIN out of a pasted Amazon URL, or accept a bare ASIN."""
    raw = (raw or "").strip()
    m = _ASIN_RE.search(raw)
    if m:
        return m.group(1).upper()
    if re.fullmatch(r"[A-Z0-9]{10}", raw, re.I):
        return raw.upper()
    return None


def _init() -> dict:
    if _state:
        return _state
    with _init_lock:
        if _state:
            return _state
        from google import genai

        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY not set (check the repo-root .env).")
        if not config.CATALOG_FILE.exists():
            raise RuntimeError(
                "catalog.json missing — run `python -m lemon.reviews_index all` first."
            )

        catalog = json.loads(config.CATALOG_FILE.read_text())
        asin_map = (
            json.loads(config.ASIN_MAP_FILE.read_text())
            if config.ASIN_MAP_FILE.exists()
            else {}
        )
        _state.update(
            client=genai.Client(api_key=api_key),
            catalog=catalog,
            catalog_by_asin={c["parent_asin"]: c for c in catalog},
            asin_to_parent=asin_map,
        )
    return _state


def _resolve_parent(st: dict, asin: str) -> str | None:
    """Map any (parent or child) ASIN to a parent_asin present in the catalog."""
    if asin in st["catalog_by_asin"]:
        return asin
    parent = st["asin_to_parent"].get(asin)
    return parent if parent in st["catalog_by_asin"] else None


@app.get("/api/health")
def health() -> dict:
    return {
        "gemini_key": bool(os.environ.get("GEMINI_API_KEY")),
        "reviews_db": config.REVIEWS_DB.exists(),
        "catalog": config.CATALOG_FILE.exists(),
        "model": config.GEMINI_MODEL,
    }


@app.get("/api/catalog")
def catalog(q: str = "", limit: int = 200) -> list[dict]:
    st = _init()
    items = st["catalog"]
    if q:
        ql = q.lower()
        items = [
            c
            for c in items
            if ql in c["title"].lower()
            or ql in (c.get("brand") or "").lower()
            or ql in (c.get("subcategory") or "").lower()
        ]
    return items[: max(1, min(limit, 500))]


def _build(st: dict, parent_asin: str) -> dict:
    """Extract (or cache-load) one catalog product, serialised per-asin."""
    meta_row = st["catalog_by_asin"][parent_asin]
    with _asin_locks[parent_asin]:
        # SQLite connections have thread affinity; open fresh per request.
        from .extract import open_cache

        reviews_db = open_reviews_db()
        cache = open_cache()
        try:
            reviews = get_reviews(reviews_db, parent_asin)
            if not reviews:
                raise HTTPException(status_code=404, detail="No reviews indexed for product")
            return product_service.build_product(
                parent_asin, meta_row, reviews, st["client"], cache
            )
        finally:
            reviews_db.close()
            cache.close()


@app.get("/api/product/{asin}")
def product(asin: str) -> dict:
    st = _init()
    parent = _resolve_parent(st, asin)
    if parent is None:
        raise HTTPException(status_code=404, detail=f"Unknown product {asin}")
    return _build(st, parent)


@app.get("/api/resolve")
def resolve(url: str = "") -> dict:
    """Resolve a pasted Amazon URL (or bare ASIN) to a product survival curve.

    404s with a clear reason when the ASIN can't be parsed, or the product
    isn't in our review corpus — we never scrape Amazon live.
    """
    st = _init()
    asin = parse_asin(url)
    if not asin:
        raise HTTPException(status_code=400, detail="Couldn't find an ASIN in that link.")
    parent = _resolve_parent(st, asin)
    if parent is None:
        raise HTTPException(
            status_code=404,
            detail=f"{asin} isn't in our Appliances review corpus.",
        )
    return _build(st, parent)


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("LEMON_PORT", "8000"))
    uvicorn.run(app, host="127.0.0.1", port=port)
