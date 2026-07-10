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
import threading

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
_lock = threading.Lock()  # serialise extraction; SQLite conns aren't thread-safe


def _init() -> dict:
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
    _state.update(
        client=genai.Client(api_key=api_key),
        cache=None,  # opened per-request under lock (thread affinity)
        reviews_db=None,
        catalog=catalog,
        catalog_by_asin={c["parent_asin"]: c for c in catalog},
    )
    return _state


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


@app.get("/api/product/{asin}")
def product(asin: str) -> dict:
    st = _init()
    meta_row = st["catalog_by_asin"].get(asin)
    if meta_row is None:
        raise HTTPException(status_code=404, detail=f"Unknown product {asin}")

    with _lock:
        # SQLite connections have thread affinity; open under the lock.
        from .extract import open_cache

        reviews_db = open_reviews_db()
        cache = open_cache()
        try:
            reviews = get_reviews(reviews_db, asin)
            if not reviews:
                raise HTTPException(status_code=404, detail="No reviews indexed for product")
            return product_service.build_product(
                asin, meta_row, reviews, st["client"], cache
            )
        finally:
            reviews_db.close()
            cache.close()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
