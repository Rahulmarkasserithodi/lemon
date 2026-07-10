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

```
OFFLINE (Python, run once, cached)                      DEMO (static, nothing can fail)
┌──────────────────────────────────────────────┐        ┌──────────────────────────┐
│ 1. download.py   raw category files          │        │  Vite + React + Tailwind │
│ 2. inspect.py    print REAL schema + stats   │        │  reads /data/processed   │
│ 3. select.py     pick products (meta filter) │        │  Recharts survival plot  │
│ 4. prefilter.py  regex → candidate reviews   │  JSON  │  + CI bands              │
│ 5. extract.py    Gemini Flash-Lite batch,    │ ─────► │  hero comparison view    │
│                  strict JSON, cached/review  │        │  demo mode (hardcoded    │
│ 6. survival.py   lifelines KM + CI + median  │        │  pre-verified pairs)     │
│ 7. export.py     per-product JSON artifacts  │        │  NO live LLM calls       │
└──────────────────────────────────────────────┘        └──────────────────────────┘
```

Key de-risking property: the demo path is a static frontend + committed JSON. The expensive/fragile parts (LLM, dataset) run offline with caching, so reruns are cheap and deterministic.

## 3. Repo structure

```
lemon/
├── PLAN.md / README.md
├── data/
│   ├── raw/            # downloaded jsonl.gz (gitignored)
│   ├── cache/          # extractions.sqlite — LLM results keyed by review id (gitignored)
│   └── processed/      # exported JSON artifacts (COMMITTED — the demo data layer)
├── pipeline/           # Python (venv + requirements.txt)
│   ├── requirements.txt
│   └── lemon/
│       ├── download.py, inspect.py, select.py, prefilter.py,
│       ├── extract.py, survival.py, export.py, pairs.py
│       └── config.py   # category, thresholds, vocab — one place
└── web/                # Vite + React + TS + Tailwind + Recharts
    └── src/ (components: SurvivalChart, CompareView, FailureModes, SnippetDrawer, DemoMode, ProductPicker)
```

## 4. Pipeline design

**Prefilter (regex, recall-oriented):** run the LLM only on reviews matching (time pattern: `\d+ (day|week|month|year)s?`, "a year", "six months"…) AND (failure lexicon: stopped/died/broke/quit/failed/leaks/"no longer"… OR longevity lexicon: "still works", "going strong", "years later"). Expected candidate density ~8–15%; measured for real at Phase 1.

**Extraction (Gemini 2.5 Flash-Lite, `gemini-2.5-flash-lite`, via the Gemini Batch API):** strict JSON per review via structured output (`response_mime_type: "application/json"` + `response_schema` from a Pydantic model — guaranteed-valid JSON, no parsing failures; verified supported per-request inside batch jobs):

```json
{ "failed": bool,
  "time_to_failure_months": number|null,
  "last_known_good_months": number|null,
  "failure_mode": enum|null,        // small vocab set per category at Phase 1, + "other"
  "confidence": 0..1 }
```

- **Cache:** SQLite keyed by `sha256(user_id|parent_asin|timestamp)` (dataset has no review id). Batch results are merged into the cache on retrieval; rerun = free.
- **Batch mechanics (`google-genai` SDK):** build a JSONL of requests (one per uncached candidate review), upload via the Files API, `client.batches.create(...)`, poll `client.batches.get(...)`, download the results JSONL. Submitted as **several chunked jobs, kicked off at the start of Phase 2**, so partial results land early and no single job gates the schedule. Batch mode sidesteps rate limits entirely.
- **Phase 1 validation path:** the ~100-review shape test runs on the synchronous API (same model, same schema, pennies) for a fast iteration loop; batch is for the scaled run.
- **Cost estimate:** ~40–60k calls × (~500 in + ~80 out tokens) at $0.10/$0.40 per MTok ≈ **$4–5 realtime, ~$2–2.50 via the Batch API's 50% discount.** Effectively free; validated on 100 reviews first.

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
- **Product picker:** simple search/select from `index.json`.
- **Demo Mode:** keyboard-drivable, loads hardcoded verified pairs instantly. The pitch never depends on live search.
- **Honesty panel (always visible, small):** n per product; note that self-reported durations are noisy but relative ranking is robust at scale; corpus is right-censored and KM handles that — judges reward this candour.
- **Design:** intentional and restrained — strong typography, dark editorial palette, generous whitespace; no default-Tailwind look. Chart craft matters most (I'll apply the dataviz design method when building). Recharts for speed; drop to D3 only if step-curves + CI bands fight back.
- Everything served statically; `npm run build` output + JSON works fully offline.

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

- **`GEMINI_API_KEY` will be in the env when Phase 1's extraction test runs** (not needed before then). Note: the original brief mentioned `ANTHROPIC_API_KEY` — with the switch to Gemini, a Google AI Studio key is what's needed instead.
- Extraction model: **Gemini 2.5 Flash-Lite** (`gemini-2.5-flash-lite`, $0.10/$0.40 per MTok; Batch API −50% → $0.05/$0.20) with structured output (`response_schema`) for guaranteed-valid JSON. Pricing, batch discount, and batch structured-output support verified against Google's docs today.
- Python 3.13 + venv/pip (no uv installed; not worth adding tooling), Node 22 + npm. `lifelines`, `pandas`, `datasets`/`huggingface_hub`, `google-genai` as core Python deps.
- Directory isn't a git repo yet → `git init` at Phase 1. `data/raw` + `data/cache` gitignored; `data/processed` committed (kept under ~20MB by capping curve points and snippets).
- Dataset has no per-review id → cache key is `sha256(user_id|parent_asin|timestamp)`.
- Price coverage in meta is partial → products without price still get curves; cost-per-year shown only when price exists.
- "Anonymised snippets" = review text excerpts with no reviewer identifiers (dataset user_ids are already pseudonymous; we never export them).
