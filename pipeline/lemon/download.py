"""Download raw Appliances review and meta files from HuggingFace (McAuley-Lab/Amazon-Reviews-2023).

Files are saved to data/raw/. Existing files are skipped unless --force is passed.

Run:
    python -m lemon.download
    python -m lemon.download --force   # re-download even if files exist
"""

import sys
from pathlib import Path

from huggingface_hub import hf_hub_download

from . import config

_REPO = "McAuley-Lab/Amazon-Reviews-2023"
_HF_PATHS: dict[Path, str] = {
    config.REVIEWS_FILE: f"raw/review_categories/{config.CATEGORY}.jsonl",
    config.META_FILE:    f"raw/meta_categories/meta_{config.CATEGORY}.jsonl",
}


def download_file(dest: Path, repo_path: str, force: bool = False) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and not force:
        size = dest.stat().st_size
        print(f"  skip  {dest.name}  ({size:,} bytes already present; pass --force to re-download)")
        return
    print(f"  {dest.name}  ← huggingface:{repo_path}", flush=True)
    tmp = hf_hub_download(
        repo_id=_REPO,
        filename=repo_path,
        repo_type="dataset",
        local_dir=dest.parent,
        local_dir_use_symlinks=False,
    )
    # hf_hub_download saves to a nested path; move to our expected location
    src = Path(tmp)
    if src.resolve() != dest.resolve():
        dest.unlink(missing_ok=True)
        src.rename(dest)
    print(f"  saved {dest.name}  ({dest.stat().st_size:,} bytes)")


if __name__ == "__main__":
    force = "--force" in sys.argv
    for dest, repo_path in _HF_PATHS.items():
        download_file(dest, repo_path, force=force)
    print("\nAll files ready.")
