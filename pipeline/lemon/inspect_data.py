"""Print the REAL schema of the downloaded category files before any loader is written.

Reads the first N lines of each jsonl.gz, unions the keys, infers types, and
prints example values plus basic stats. Run:
    python -m lemon.inspect_data
"""

import gzip
import json
import random
from collections import Counter, defaultdict
from pathlib import Path

RAW = Path(__file__).resolve().parents[2] / "data" / "raw"
SAMPLE_LINES = 5000


def describe(path: Path, n: int = SAMPLE_LINES) -> None:
    print(f"\n{'=' * 70}\n{path.name}\n{'=' * 70}")
    keys: Counter[str] = Counter()
    types: dict[str, Counter] = defaultdict(Counter)
    examples: dict[str, object] = {}
    rows = 0
    with gzip.open(path, "rt", encoding="utf-8") as f:
        for line in f:
            rows += 1
            if rows > n:
                break
            rec = json.loads(line)
            for k, v in rec.items():
                keys[k] += 1
                types[k][type(v).__name__] += 1
                if k not in examples and v not in (None, "", [], {}):
                    examples[k] = v
    print(f"(sampled first {min(rows, n)} rows)\n")
    for k, count in keys.most_common():
        tys = ", ".join(f"{t}×{c}" for t, c in types[k].most_common())
        ex = repr(examples.get(k))
        if len(ex) > 90:
            ex = ex[:90] + "…"
        print(f"  {k:<20} present {count:>5}  types: {tys:<28} e.g. {ex}")


def review_stats(path: Path, n: int = 20000) -> None:
    """Rating distribution, verified share, timestamp range, text length."""
    ratings: Counter = Counter()
    verified = 0
    lengths = []
    ts_min, ts_max = None, None
    rows = 0
    with gzip.open(path, "rt", encoding="utf-8") as f:
        for line in f:
            rows += 1
            if rows > n:
                break
            r = json.loads(line)
            ratings[r.get("rating")] += 1
            verified += bool(r.get("verified_purchase"))
            lengths.append(len(r.get("text") or ""))
            ts = r.get("timestamp")
            if isinstance(ts, (int, float)):
                ts_min = ts if ts_min is None else min(ts_min, ts)
                ts_max = ts if ts_max is None else max(ts_max, ts)
    lengths.sort()
    print(f"\n  rating dist: {dict(sorted(ratings.items(), key=lambda x: str(x[0])))}")
    print(f"  verified_purchase: {verified}/{rows - 1}")
    print(f"  text length p50={lengths[len(lengths) // 2]} p90={lengths[int(len(lengths) * 0.9)]}")
    print(f"  timestamp range: {ts_min} .. {ts_max}")


if __name__ == "__main__":
    random.seed(0)
    describe(RAW / "meta_Appliances.jsonl.gz")
    describe(RAW / "Appliances.jsonl.gz")
    review_stats(RAW / "Appliances.jsonl.gz")
