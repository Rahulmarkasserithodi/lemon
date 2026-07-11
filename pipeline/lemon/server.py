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
import math
import os
import re
import ssl
import threading
import urllib.parse
import urllib.request
from collections import defaultdict

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import config
from . import product_service
from .reviews_index import get_reviews, open_reviews_db

app = FastAPI(title="Lemon API", version="0.1.0")

# Allow localhost (dev) + any deployed frontend set via CORS_ORIGINS env var.
# Set CORS_ORIGINS on Render to your Vercel URL, e.g.:
#   https://lemon-xyz.vercel.app,https://yourdomain.com
_cors_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
_extra = os.environ.get("CORS_ORIGINS", "")
if _extra:
    _cors_origins.extend([o.strip() for o in _extra.split(",") if o.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
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

        # Populate the data root (e.g. Render's persistent disk) on first boot:
        # copies committed files and downloads reviews.db / asin_to_parent.json.
        from .bootstrap_data import ensure_data

        ensure_data()

        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY not set (check the repo-root .env).")
        if not config.CATALOG_FILE.exists():
            raise RuntimeError(
                "catalog.json missing — run `python -m lemon.reviews_index all` first."
            )
        # A missing reviews.db is the #1 deploy foot-gun: open_reviews_db() would
        # silently create an empty one, so every /product call 404s with a
        # misleading "No reviews indexed". Fail loudly with the real cause.
        if not config.REVIEWS_DB.exists():
            raise RuntimeError(
                f"reviews.db missing at {config.REVIEWS_DB} — set REVIEWS_DB_URL "
                "so it downloads on boot, or upload it to the data disk."
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
            rank=_build_rank(catalog),
        )
    return _state


def _build_rank(catalog: list[dict]) -> dict[str, float]:
    """Per-product search score: recency-dominant, with a review-volume term so
    fresh-but-substantial products rank first. (No-price handling is applied at
    query time so those products always sort to the bottom.)"""
    ts = [c["latest_review"] for c in catalog if c.get("latest_review")]
    ts_min, ts_max = (min(ts), max(ts)) if ts else (0, 1)
    span = (ts_max - ts_min) or 1
    max_logrev = max((math.log1p(c.get("n_reviews") or 0) for c in catalog), default=1.0) or 1.0
    rank: dict[str, float] = {}
    for c in catalog:
        rec = ((c.get("latest_review") or ts_min) - ts_min) / span          # 0..1 recency
        vol = math.log1p(c.get("n_reviews") or 0) / max_logrev              # 0..1 volume
        rank[c["parent_asin"]] = 0.7 * rec + 0.3 * vol
    return rank


def _resolve_parent(st: dict, asin: str) -> str | None:
    """Map any (parent or child) ASIN to a parent_asin present in the catalog."""
    if asin in st["catalog_by_asin"]:
        return asin
    parent = st["asin_to_parent"].get(asin)
    return parent if parent in st["catalog_by_asin"] else None


@app.get("/api/health")
def health() -> dict:
    # Report the actual review row count, not just file existence — an empty
    # auto-created reviews.db "exists" but serves nothing, which is the exact
    # failure we keep hitting. n_reviews == 0 means the DB never got populated.
    n_reviews = None
    if config.REVIEWS_DB.exists():
        try:
            import sqlite3

            con = sqlite3.connect(f"file:{config.REVIEWS_DB}?mode=ro", uri=True)
            try:
                n_reviews = con.execute("SELECT COUNT(*) FROM reviews").fetchone()[0]
            finally:
                con.close()
        except Exception:
            n_reviews = -1  # table missing / unreadable
    return {
        "gemini_key": bool(os.environ.get("GEMINI_API_KEY")),
        "reviews_db": config.REVIEWS_DB.exists(),
        "reviews_db_path": str(config.REVIEWS_DB),
        "n_reviews": n_reviews,
        "catalog": config.CATALOG_FILE.exists(),
        "data_root": str(config.CACHE.parent),
        "model": config.GEMINI_MODEL,
    }


@app.get("/api/catalog")
def catalog(q: str = "", limit: int = 200) -> list[dict]:
    st = _init()
    items = st["catalog"]
    ql = q.strip().lower()
    if ql:
        items = [
            c
            for c in items
            if ql in c["title"].lower()
            or ql in (c.get("brand") or "").lower()
            or ql in (c.get("subcategory") or "").lower()
        ]

    rank = st["rank"]

    def sort_key(c: dict):
        has_price = c.get("price") is not None            # priceless products sort last
        score = rank.get(c["parent_asin"], 0.0)
        # small relevance nudge when the query hits the start of the title/brand
        if ql and (c["title"].lower().startswith(ql) or (c.get("brand") or "").lower().startswith(ql)):
            score += 0.15
        return (has_price, score)

    items = sorted(items, key=sort_key, reverse=True)
    return items[: max(1, min(limit, 500))]


# ── e-waste drop-off finder: server-side Overpass proxy ───────────────────────
# The browser can't call Overpass directly (it doesn't return CORS headers), so
# the finder calls this endpoint and we run the OpenStreetMap query server-side.
try:
    import certifi

    _OVERPASS_SSL: ssl.SSLContext | None = ssl.create_default_context(cafile=certifi.where())
except Exception:  # pragma: no cover
    _OVERPASS_SSL = None

_OVERPASS_ENDPOINTS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
)
_OVERPASS_UA = "Tenure/1.0 (e-waste drop-off finder)"
_OVERPASS_SANITISE = re.compile(r'["\[\]();\\{}]')  # keep untrusted input out of the QL


@app.get("/api/ewaste")
def ewaste(lat: float, lon: float, radius_m: int = 15000, brands: str = "") -> dict:
    """Nearby recycling / waste-transfer points + named retailer take-back stores
    (brands passed pipe-delimited), as raw Overpass JSON for the client to parse."""
    radius_m = max(100, min(int(radius_m), 60000))
    around = f"{radius_m},{lat},{lon}"
    brand_q = "".join(
        f'nwr["brand"="{b}"](around:{around});'
        for b in (_OVERPASS_SANITISE.sub("", x).strip() for x in brands.split("|"))
        if b
    )
    query = (
        "[out:json][timeout:25];("
        f'nwr["amenity"="recycling"](around:{around});'
        f'nwr["amenity"="waste_transfer_station"](around:{around});'
        f"{brand_q});out center tags;"
    )
    body = urllib.parse.urlencode({"data": query}).encode()
    last_err: Exception | None = None
    for url in _OVERPASS_ENDPOINTS:
        try:
            req = urllib.request.Request(
                url,
                data=body,
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": _OVERPASS_UA,
                },
            )
            with urllib.request.urlopen(req, timeout=30, context=_OVERPASS_SSL) as resp:
                return json.loads(resp.read())
        except Exception as exc:  # try the next mirror
            last_err = exc
    raise HTTPException(status_code=502, detail=f"Location service unavailable: {last_err}")


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

    # Render injects PORT; fall back to LEMON_PORT for local override, then 8000.
    port = int(os.environ.get("PORT") or os.environ.get("LEMON_PORT") or "8000")
    # Must bind 0.0.0.0 on Render (127.0.0.1 is unreachable from their load balancer).
    host = os.environ.get("LEMON_HOST", "0.0.0.0")
    uvicorn.run(app, host=host, port=port)
