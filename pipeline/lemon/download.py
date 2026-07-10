"""Download raw Appliances review + meta files (McAuley Lab, Amazon Reviews 2023).

Uses the direct UCSD mirror, which serves gzipped .jsonl.gz — matching the
paths in config (REVIEWS_FILE / META_FILE) and the streaming readers in load.py.
Files are saved to data/raw/; existing files are skipped unless --force.

Run:
    python -m lemon.download
    python -m lemon.download --force
"""

import sys
import urllib.request
from pathlib import Path

from . import config

_BASE = "https://mcauleylab.ucsd.edu/public_datasets/data/amazon_2023/raw"
_URLS: dict[Path, str] = {
    config.REVIEWS_FILE: f"{_BASE}/review_categories/{config.CATEGORY}.jsonl.gz",
    config.META_FILE: f"{_BASE}/meta_categories/meta_{config.CATEGORY}.jsonl.gz",
}


def download_file(dest: Path, url: str, force: bool = False) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and not force:
        print(f"  skip  {dest.name}  ({dest.stat().st_size:,} bytes present; --force to re-download)")
        return
    print(f"  {dest.name}  ← {url}", flush=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    urllib.request.urlretrieve(url, tmp)
    tmp.rename(dest)
    print(f"  saved {dest.name}  ({dest.stat().st_size:,} bytes)")


if __name__ == "__main__":
    force = "--force" in sys.argv
    for dest, url in _URLS.items():
        download_file(dest, url, force=force)
    print("\nAll files ready.")
