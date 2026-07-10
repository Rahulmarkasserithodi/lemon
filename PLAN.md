# Lemon — PLAN.md

**One-liner:** Star ratings hide product death. Lemon mines time-to-failure signals from Amazon review text, runs real Kaplan-Meier survival analysis (with censoring), and shows shoppers which products are engineered to die — headline metric: **cost per year of life**, not sticker price.

---

## 1. Chosen category: `Appliances` (Amazon Reviews 2023, McAuley Lab)

**Why Appliances:**
- **Tractable size.** 2.1M reviews / 94K products — the full category downloads in minutes and filters locally in pandas. Home_and_Kitchen (67M) and Electronics (44M) would burn hours of hackathon time on streaming/filtering alone.
- **Maximum failure salience.** Appliances *break*, and reviewers narrate it with timestamps: "ice maker died after 14 months", "compressor quit at 2 years". This is the single biggest lever on extraction density (our #1 risk).
- **Clear price points + brand identity** for the cost-per-year story and per-brand curves.
- **Relatable hero products** exist inside it: countertop ice makers, mini fridges, garbage disposals, portable washers, kettle/toaster-adjacent small appliances — all famous for dying young.

**Verified facts (from the dataset site, 2026-07-10):** per-category `.jsonl` files via HuggingFace `McAuley-Lab/Amazon-Reviews-2023` (configs `raw_review_Appliances`, `raw_meta_Appliances`) or direct download. Review fields: `rating`, `title`, `text`, `asin`, `parent_asin`, `user_id`, `timestamp`, `verified_purchase`, `helpful_vote`. Meta fields: `title`, `price`, `main_category`, `categories`, `details`, `store` (brand), `average_rating`, `rating_number`. Exact schema re-verified in code at Phase 1 before any loader is written.

**Pivot criterion (decided at end of Phase 1, not re-litigated after):** if Appliances yields fewer than ~10 relatable products with ≥30 usable survival observations each on the 100-review validation + a density probe, fall back to streaming Home_and_Kitchen metadata for kettle/blender/coffee-maker ASINs and streaming reviews filtered to those ASINs (slower but contained; runs overnight in background).

---

## 2. Architecture

**Pivot (decided in Phase 2):** the original plan pre-computed *every* product via the Gemini Batch API into static JSON. For a demo that only ever shows a handful of products, that's wasted spend and wall-clock. We pivoted to a **cache-backed, on-demand local server**: clicking a product in the UI triggers a live extraction that is cached in SQLite and *also* persisted to `data/processed/`, so the committed offline demo layer fills in as you browse. Best of both worlds — cheap live exploration during dev, and a fully static demo path once products are warmed.

```
ONE-TIME INDEX (Python, cached)          LOCAL SERVER (on-demand, cached)        FRONTEND (Vite + React)
┌──────────────────────────────┐         ┌──────────────────────────────┐        ┌────────────────────────┐
│ download.py    raw jsonl.gz  │         │ server.py  FastAPI           │  /api  │ Vite + React + Tailwind│
│ reviews_index  reviews.db    │  read   │  GET /api/health             │ ◄────► │ Browse: live picker    │
│  build         (2.1M reviews)│ ◄─────  │  GET /api/catalog?q=         │        │ Recharts KM + CI bands │
│ reviews_index  catalog.json  │         │  GET /api/product/{asin}     │        │ hero compare view      │
│  catalog       (2.4k devices)│         │    └ product_service.build   │        │ Demo Mode (static JSON)│
└──────────────────────────────┘         │       prefilter → extract →  │        └────────────────────────┘
                                         │       KM fit → persist JSON  │                 ▲
   extract.py  Gemini 3.1 Flash-Lite ◄───┤  cache: extractions.sqlite   │   reads /data/processed
   survival.py lifelines KM + CI     ◄───┤  persist: data/processed/    │ ────────────────┘  (committed)
                                         └──────────────────────────────┘
```

Key de-risking property: two independent paths. **Live path** (Browse tab) hits the local server for on-demand extraction — cheap, cached, incremental. **Static path** (Demo Mode) reads only committed JSON in `data/processed/` and needs no server and no API key. Every product warmed through the live path lands in the static path automatically, so the pitch never depends on a live LLM call.

## 3. Repo structure

```
lemon/
├── PLAN.md / README.md
├── .env                # GEMINI_API_KEY (gitignored, loaded by config.py)
├── data/
│   ├── raw/            # downloaded jsonl.gz (gitignored)
│   ├── cache/          # gitignored: extractions.sqlite (LLM results),
│   │                   #   reviews.db (per-product review index), catalog.json (browsable devices)
│   └── processed/      # exported JSON artifacts (COMMITTED — the static demo data layer)
│       ├── index.json, hero_pairs.json, products/{asin}.json
├── pipeline/           # Python 3.10 (venv + requirements.txt)
│   ├── requirements.txt
│   └── lemon/
│       ├── download.py, inspect_data.py, select.py, prefilter.py,
│       ├── extract.py, survival.py, export.py, pairs.py, validate.py,
│       ├── reviews_index.py   # build reviews.db + catalog.json from raw
│       ├── product_service.py # on-demand: 1 asin → prefilter → extract → KM → persist
│       ├── server.py          # FastAPI: /api/health, /api/catalog, /api/product/{asin}
│       └── config.py          # category, thresholds, vocab, paths — one place
└── web/                # Vite + React + TS + Tailwind + Recharts
    └── src/ (api.ts; components: SurvivalChart, CompareView, FailureModes, SnippetDrawer, DemoMode, ProductPicker)
```

## 4. Pipeline design

**Prefilter (regex, recall-oriented):** run the LLM only on reviews matching (time pattern: `\d+ (day|week|month|year)s?`, "a year", "six months"…) AND (failure lexicon: stopped/died/broke/quit/failed/leaks/"no longer"… OR longevity lexicon: "still works", "going strong", "years later"). Expected candidate density ~8–15%; measured for real at Phase 1.

**Extraction (Gemini 3.1 Flash-Lite, `gemini-3.1-flash-lite`, synchronous on-demand):** strict JSON per review via structured output (`response_schema` from a Pydantic `Extraction` model — guaranteed-valid JSON, no parsing failures). One product's candidate reviews are extracted on the fly when its detail is requested:

```json
{ "failed": bool,
  "time_to_failure_months": number|null,
  "last_known_good_months": number|null,
  "failure_mode": enum|null,        // small vocab set (12 modes + "other")
  "confidence": 0..1 }
```

- **Cache:** SQLite (`extractions.sqlite`) keyed by `sha256(user_id|parent_asin|timestamp)` (dataset has no review id). Every extraction is written through the cache, so re-viewing a product (or restarting the server) is free — no repeat LLM calls. `_generate_with_backoff` retries 429/503.
- **On-demand mechanics:** `product_service.build_product(asin)` looks up the product's reviews via `reviews.db`, prefilters to candidates, extracts each uncached candidate synchronously, fits KM, then persists the result to `data/processed/products/{asin}.json` and upserts `index.json`. A single `threading.Lock` in the server serialises extraction (SQLite connections have thread affinity). First view of a ~500-review product ≈ 40–60s; cached views are instant.
- **Two threshold tiers:** relaxed live thresholds (`LIVE_MIN_OBS=8`, `LIVE_MIN_EVENTS=3`) let *any* product render a curve for exploration; the stricter config thresholds (`MIN_OBSERVATIONS=25`, `MIN_EVENTS=10`) set the `published` flag that marks a product as demo-worthy.
- **Cost estimate:** a demo warms ~5–15 products × ~30–60 candidate reviews each ≈ a few hundred calls total at $0.10/$0.40 per MTok — pennies. The batch API is unnecessary at this scale; on-demand + cache is both cheaper and simpler.

**Survival model (lifelines):**
- Event = `time_to_failure_months` stated (confidence ≥ 0.5). Right-censored = `last_known_good_months` ("still going after 2 years"). Neither → dropped from survival input (failure-mode histogram still counts untimed failures).
- Sanity filters: durations clipped to (0, 120] months; publish a product only with ≥25 observations and ≥10 events; always export `n_obs`/`n_events`.
- Per-product AND per-brand KM fit → curve points, Greenwood CI, median lifespan. If S(t) never crosses 0.5, median is reported as a lower bound (">36 months") and flagged — never hidden.
- **cost_per_year = price / median_lifespan_years** (omitted, with reason, when price missing or median unbounded).
- Stretch (only if hours remain): Cox model for failure-mode hazard ranking.

**Exports (`data/processed/`):** `index.json` (search/select list + summary stats), `products/{parent_asin}.json` (curve + CI + median + n + price + cost_per_year + failure-mode histogram + 2–3 real anonymized snippets per mode), `hero_pairs.json` (curated, pre-verified).

**Hero-pair finder (`pairs.py`, automated):** scan exported products for pairs with same subcategory, price within ±30%, average star rating within ±0.4, both `n_events ≥ 15`, median lifespan ratio ≥ 1.6, and visibly separated CI bands. Manually verify top 5 → hardcode 2–3 into Demo Mode.

## 5. Frontend design

- **Hero comparison view (the money shot):** two overlaid KM step-curves with translucent CI bands, big cost-per-year callouts, price + avg-star context (to hammer "same price, same stars, different fate"), failure-mode bars beneath; clicking a mode reveals the real review snippets behind it.
- **Product picker (Browse tab):** server-side search over `catalog.json` via `GET /api/catalog?q=` (debounced), shows review counts; selecting two products + Compare triggers live extraction (`GET /api/product/{asin}`) with a "reading reviews with the model…" status, and surfaces a hint if the server isn't running. Longer-lived product is placed on the left.
- **Demo Mode:** keyboard-drivable, loads hardcoded verified pairs from committed static JSON instantly — no server, no API key. The pitch never depends on a live call.
- **Honesty panel (always visible, small):** n per product; note that self-reported durations are noisy but relative ranking is robust at scale; corpus is right-censored and KM handles that — judges reward this candour.
- **Design:** intentional and restrained — strong typography, dark editorial palette, generous whitespace; no default-Tailwind look. Chart craft matters most (I'll apply the dataviz design method when building). Recharts for speed; drop to D3 only if step-curves + CI bands fight back.
- Two runtime modes: **static** (`npm run build` output + committed JSON works fully offline — Demo Mode) and **live** (`npm run dev` proxies `/api` → local FastAPI server on `127.0.0.1:8000` for on-demand Browse). The demo never depends on the server being up.

## 6. Milestones & hour budget (≈20h)

| Phase | Work | Budget | Acceptance criteria |
|---|---|---:|---|
| 0 | PLAN.md (this) | 0.5h | You approve the plan |
| 1 | Scaffold repo + git; download Appliances; **inspect + print real schema**; prefilter density probe; full pipeline end-to-end on ~100 sampled reviews; commit | 3h | 100 reviews → extracted JSON → a (tiny) KM curve renders from exported JSON; density number known; category pivot decision made |
| 2 | Product selection; submit chunked Gemini batch jobs (~40–60k candidate reviews) **first thing**; poll + merge results into cache while frontend scaffolding starts; commit | 3.5h | ≥30 products with ≥25 survival observations; cache hit on rerun |
| 3 | KM + cost-per-year + failure modes; exports; automated hero-pair finder; **verify ≥1 pair diverges cleanly**; commit | 3h | `data/processed/` complete; ≥2 candidate hero pairs with separated CIs |
| 4 | Frontend: chart component first, then compare view, picker, drill-down snippets; commit | 5h | Hero comparison renders beautifully from static JSON |
| 5 | Polish + Demo Mode + honesty panel + README (repro steps, 60-second pitch, limitations); commit | 3h | Full offline demo run-through works twice in a row |
| — | Buffer / integration slack | 2h | — |

Sequencing note: Phase 2 extraction is mostly wall-clock — batch jobs churn on Google's side while frontend scaffolding (Phase 4 start) begins, which is how 5h of frontend fits.

## 7. Risks & mitigations

1. **Extraction density too low** (the big one) → high-salience category; prefilter measured at Phase 1 on real data before scaling; scale product count up if per-product density is thin; explicit pivot criterion (§1).
2. **Appliances is parts/filters-heavy, hero products unrelatable** → meta `categories`/title filter to durable devices; pivot path defined.
3. **No hero pair diverges** → automated pair-finder over *all* exported products (we need 2 pairs out of ~30+ products, likely); brand-level curves as backup narrative; worst case, a cross-price-tier pair ("the $40 one costs more per year than the $120 one") is an equally good story.
4. **Batch turnaround vs the 20h clock** (batch SLO is 24h, though usually much faster) → chunked jobs submitted at the very start of Phase 2 so partial results land early; any job still pending after ~2h gets cancelled and rerun on the synchronous API — at Flash-Lite prices the realtime fallback costs ~$4–5 total, so cost never blocks us. Prefilter (~85% volume cut) + per-review cache keep every path cheap.
5. **Implausible curves** (duration heaping at 12/24 months, tiny n) → publish thresholds, n shown in UI, flagged-not-hidden anomalies, honesty panel.
6. **Frontend time overrun** → chart component built first; Demo Mode before deep polish; scope guardrails honored (no accounts/backend/multi-category).
7. **Network/dataset flakiness** → raw files kept locally after first download; direct-download URLs as HF fallback; processed JSON committed so the demo never depends on the pipeline.

## 8. Definition of done

- Real KM curves (with CI) computed from real review text in the chosen category.
- Beautiful diverging hero comparison: CI bands, cost-per-year, failure modes, snippet drill-down.
- Demo runs fully offline (static frontend + committed JSON; no API key needed to present).
- README: reproduction steps, honest limitations, 60-second pitch.

## 9. Assumptions log

- **`GEMINI_API_KEY` is read from `.env` at the repo root** (loaded by `config.py` via `python-dotenv`); needed only for the live path (extraction / Browse tab), never for the static Demo. Note: the original brief mentioned `ANTHROPIC_API_KEY` — with the switch to Gemini, a Google AI Studio key is what's needed instead.
- Extraction model: **Gemini 3.1 Flash-Lite** (`gemini-3.1-flash-lite`) with structured output (`response_schema`) for guaranteed-valid JSON. (2.5 Flash-Lite was deprecated; 3.1 validated end-to-end with a real call.) Pivoted from the Batch API to synchronous on-demand extraction — cheaper and simpler for a few-product demo (see §2, §4).
- Python 3.10 + venv/pip (rebuilt from 3.9 — code uses PEP 604 `X | None` syntax that fails at runtime pre-3.10), Node 22 + npm. Core Python deps: `lifelines`, `pandas`, `datasets`/`huggingface_hub`, `google-genai`, plus server deps `fastapi`, `uvicorn[standard]`, `python-dotenv`.
- Directory isn't a git repo yet → `git init` at Phase 1. `data/raw` + `data/cache` gitignored; `data/processed` committed (kept under ~20MB by capping curve points and snippets).
- Dataset has no per-review id → cache key is `sha256(user_id|parent_asin|timestamp)`.
- Price coverage in meta is partial → products without price still get curves; cost-per-year shown only when price exists.
- "Anonymised snippets" = review text excerpts with no reviewer identifiers (dataset user_ids are already pseudonymous; we never export them).
