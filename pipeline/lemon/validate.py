"""Phase 1 end-to-end validation: scan raw data → prefilter → extract → KM → optional export.

Scans the first --scan reviews, measures prefilter density, runs sync Gemini extraction
on candidates, fits KM curves where data allows, and prints a full summary.

Run:
    python -m lemon.validate                   # scan 3000 reviews (default)
    python -m lemon.validate --scan 500        # quick smoke-test
    python -m lemon.validate --no-llm          # prefilter density only, no API calls
    python -m lemon.validate --export          # write data/processed/ after extraction
"""

import argparse
import gzip
import json
import os
import sys
from collections import Counter, defaultdict

from . import config
from .prefilter import is_candidate


def run(scan: int, use_llm: bool, do_export: bool) -> None:
    if not config.REVIEWS_FILE.exists():
        print(f"ERROR: reviews file not found at {config.REVIEWS_FILE}")
        print("  Run:  python -m lemon.download")
        sys.exit(1)

    # ── 1. Scan + prefilter ───────────────────────────────────────────────────
    print(f"\n[1/4] Scanning first {scan:,} reviews …")
    reviews: list[dict] = []
    candidates: list[dict] = []

    with open(config.REVIEWS_FILE, "r", encoding="utf-8") as f:
        for i, line in enumerate(f):
            if i >= scan:
                break
            r = json.loads(line)
            reviews.append(r)
            if is_candidate(r.get("text") or ""):
                candidates.append(r)

    density = len(candidates) / len(reviews) if reviews else 0
    print(f"  Scanned:    {len(reviews):,}")
    print(f"  Candidates: {len(candidates):,}  ({density:.1%})")
    if density < 0.04:
        print("  WARNING — density below 4%. Check prefilter or category choice.")
    elif density > 0.20:
        print("  NOTE — density above 20%; prefilter may be too permissive (more LLM cost).")

    # Rating distribution of candidates
    ratings = Counter(r.get("rating") for r in candidates)
    print(f"  Candidate rating dist: {dict(sorted(ratings.items(), key=str))}")

    if not use_llm:
        print("\n[--no-llm] Stopping after prefilter step.")
        return

    if not os.environ.get("GEMINI_API_KEY"):
        print("\nERROR: GEMINI_API_KEY not set.")
        print("  Set it and re-run, or pass --no-llm to skip extraction.")
        sys.exit(1)

    # ── 2. Extract ────────────────────────────────────────────────────────────
    from google import genai
    from .extract import extract_sync, open_cache

    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    db = open_cache()

    print(f"\n[2/4] Extracting {len(candidates):,} candidates via Gemini sync API …")
    results_by_asin: dict[str, list[dict]] = defaultdict(list)
    n_failed = n_censored = n_dropped = n_errors = 0

    for i, r in enumerate(candidates):
        try:
            result = extract_sync(client, r, db)
        except Exception as exc:
            n_errors += 1
            print(f"  WARN [{i}]: {exc}")
            continue

        asin = r.get("parent_asin") or r.get("asin") or "unknown"
        results_by_asin[asin].append(result)

        conf = result.get("confidence") or 0
        if result.get("failed") and result.get("time_to_failure_months") and conf >= config.MIN_CONFIDENCE:
            n_failed += 1
        elif result.get("last_known_good_months") and conf >= config.MIN_CONFIDENCE:
            n_censored += 1
        else:
            n_dropped += 1

        if (i + 1) % 25 == 0:
            print(f"  {i + 1}/{len(candidates)} …", flush=True)

    db.close()
    total_useful = n_failed + n_censored
    print(f"\n  Events (failures with TTF):  {n_failed}")
    print(f"  Censored (still-working):    {n_censored}")
    print(f"  Dropped (low conf / no time):{n_dropped}")
    print(f"  API errors:                  {n_errors}")
    if total_useful:
        print(f"  Usable survival obs:         {total_useful}  ({total_useful / len(candidates):.0%} of candidates)")

    # Failure mode distribution
    modes: Counter = Counter()
    for results in results_by_asin.values():
        for res in results:
            if res.get("failed") and (res.get("confidence") or 0) >= config.MIN_CONFIDENCE:
                modes[res.get("failure_mode") or "other"] += 1
    if modes:
        print(f"\n  Top failure modes: {dict(modes.most_common(5))}")

    # ── 3. KM fitting ─────────────────────────────────────────────────────────
    from .survival import fit_km, to_observation, cost_per_year

    print(f"\n[3/4] Fitting KM curves for {len(results_by_asin)} products …")
    publishable = []
    for asin, results in results_by_asin.items():
        obs = [o for r in results if (o := to_observation(r)) is not None]
        km = fit_km(obs)
        if km is None:
            continue
        publishable.append((asin, km))
        med = (
            f">{km.max_t:.0f}" if km.median_is_lower_bound
            else f"{km.median_months:.0f}"
        )
        print(f"  {asin}  n={km.n_obs}  events={km.n_events}  median={med} mo")

    if not publishable:
        print(
            f"  No products met thresholds "
            f"(≥{config.MIN_OBSERVATIONS} obs, ≥{config.MIN_EVENTS} events). "
            "Normal for a small sample — run Phase 2 batch for scale."
        )

    # ── 4. Export (optional) ─────────────────────────────────────────────────
    if do_export:
        if publishable:
            print(f"\n[4/4] Exporting to {config.PROCESSED} …")
            from .export import export
            export(skip_snippets=False)
        else:
            print("\n[4/4] Export skipped — nothing met publication thresholds.")
    else:
        print("\n[4/4] Export skipped (pass --export to write data/processed/).")

    print("\nPhase 1 validation complete.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Phase 1 end-to-end validation")
    ap.add_argument("--scan", type=int, default=3000, metavar="N",
                    help="Number of raw reviews to scan (default: 3000)")
    ap.add_argument("--no-llm", action="store_true",
                    help="Skip Gemini extraction — prefilter stats only")
    ap.add_argument("--export", action="store_true",
                    help="Write data/processed/ JSON artifacts after extraction")
    args = ap.parse_args()
    run(scan=args.scan, use_llm=not args.no_llm, do_export=args.export)
