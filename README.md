<p align="center">
  <img src="assets/tenure-logo.svg" alt="Tenure — Durability Ledger" width="400">
</p>

<h3 align="center">Cost per year of life, not sticker price</h3>

Star ratings tell you if people *liked* a product, not how long it *lasts*. **Tenure** mines
time-to-failure signals from Amazon review text, runs real Kaplan–Meier survival analysis
(with right-censoring), and surfaces the metric that actually matters: **cost per year of
life** — across appliances and laptops.

See [PLAN.md](PLAN.md) for the full design, data sources, and methodology.

> The Python package is still named `lemon` (`pipeline/lemon/`, `python -m lemon.…`) — the
> project's original name. Only the product/brand was renamed to Tenure; renaming the module
> would break every command below, so it's intentionally left as-is.

## Two ways to run

- **Static demo** — the committed `data/processed/` JSON drives an offline demo (curated
  hero pairs). No server, no API key, no pipeline build required.
- **Live mode** — search the catalog (or paste an Amazon link) to extract any product
  on demand. Needs the pipeline artifacts below plus a `GEMINI_API_KEY`.

## Frontend

```bash
cd web
npm install
npm run dev        # http://localhost:5173 — proxies /api to the local server
```

The **Compare** tab works fully offline (demo pair). To compare real products, run the
server and rebuild the pipeline artifacts.

## Pipeline (live mode)

Requires Python 3.10+ and a `GEMINI_API_KEY` in a repo-root `.env`.

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r pipeline/requirements.txt
cd pipeline

# 1. Download the raw Appliances reviews + metadata (McAuley Amazon Reviews 2023)
python -m lemon.download

# 2. Build the local indices — reviews.db, catalog.json, AND asin_to_parent.json
python -m lemon.reviews_index all

# 3. (optional) warm a corpus so common products are instant + land in data/processed/
python -m lemon.product_service --top 25

# 4. Run the on-demand extraction server (http://127.0.0.1:8000)
python -m lemon.server
```

> **Note:** `data/cache/` (including `reviews.db`, `catalog.json`, and
> `asin_to_parent.json`) is **gitignored**, so a fresh clone must run
> `python -m lemon.reviews_index all` before live mode works. The
> `asin_to_parent.json` map is what lets the search bar **resolve a pasted Amazon
> product link** to its parent product — without it, link-paste returns
> "not in our review corpus." To (re)build just that map:
>
> ```bash
> python -m lemon.reviews_index asin-map        # add --force to rebuild
> ```

## Layout

```
pipeline/lemon/   # download, indexing, prefilter, LLM extraction, KM survival, server
web/              # Vite + React + Tailwind + Recharts frontend
data/processed/   # committed exports — the offline demo layer
data/raw/, cache/ # gitignored — rebuilt by the pipeline
```
