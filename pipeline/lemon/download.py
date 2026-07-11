"""Download raw review + meta files (McAuley Lab, Amazon Reviews 2023).

Uses the direct UCSD mirror, which serves gzipped .jsonl.gz — matching the
paths in config (REVIEWS_FILE / META_FILE) and the streaming readers. Files are
saved to data/raw/; existing files are skipped unless --force.

Run:
    python -m lemon.download                       # the configured category
    python -m lemon.download --category Electronics # a different category (e.g. laptops source)
    python -m lemon.download --force
"""

import argparse
import ssl
import urllib.request
from pathlib import Path

from . import config

# macOS framework Python ships without the system root CAs; use certifi's bundle
# so HTTPS verification succeeds (falls back to the default context if absent).
try:
    import certifi

    _SSL_CTX: ssl.SSLContext | None = ssl.create_default_context(cafile=certifi.where())
except Exception:  # pragma: no cover
    _SSL_CTX = None

_BASE = "https://mcauleylab.ucsd.edu/public_datasets/data/amazon_2023/raw"


def urls_for(category: str) -> dict[Path, str]:
    return {
        config.RAW / f"{category}.jsonl.gz": f"{_BASE}/review_categories/{category}.jsonl.gz",
        config.RAW / f"meta_{category}.jsonl.gz": f"{_BASE}/meta_categories/meta_{category}.jsonl.gz",
    }


def download_file(dest: Path, url: str, force: bool = False) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and not force:
        print(f"  skip  {dest.name}  ({dest.stat().st_size:,} bytes present; --force to re-download)")
        return
    print(f"  {dest.name}  ← {url}", flush=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    with urllib.request.urlopen(url, context=_SSL_CTX) as resp, open(tmp, "wb") as out:
        while chunk := resp.read(1 << 20):  # 1 MiB chunks
            out.write(chunk)
    tmp.rename(dest)
    print(f"  saved {dest.name}  ({dest.stat().st_size:,} bytes)", flush=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Download Amazon Reviews 2023 category files")
    ap.add_argument("--category", default=config.CATEGORY, help="category name (default: configured)")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    for dest, url in urls_for(args.category).items():
        download_file(dest, url, force=args.force)
    print("\nAll files ready.")
