"""Ensure the data files the server needs exist in config.CACHE.

On Render we point LEMON_DATA_ROOT at a persistent disk. The disk starts empty,
so on first boot we populate it:

  • Small, git-tracked files (catalog.json, extractions.sqlite) are copied from
    the repo checkout at data/cache/.
  • Large files not in git (reviews.db ≈ 834 MB, asin_to_parent.json) are
    downloaded from URLs given via env vars, if set:
        REVIEWS_DB_URL   → reviews.db      (e.g. a GitHub Release asset)
        ASIN_MAP_URL     → asin_to_parent.json

Everything is idempotent: a file that already exists is left untouched, so on a
persistent disk the download happens exactly once and survives redeploys. With
LEMON_DATA_ROOT unset (local dev) CACHE == the repo checkout, so this is a no-op.
"""

import shutil
import ssl
import urllib.request
from pathlib import Path

from . import config

# Where the git-tracked copies live (always the repo checkout, never the disk).
_REPO_CACHE = config.ROOT / "data" / "cache"

# macOS framework Python lacks system CAs; use certifi's bundle where available
# (a no-op on Render/Linux, which already has them).
try:
    import certifi

    _SSL_CTX: ssl.SSLContext | None = ssl.create_default_context(cafile=certifi.where())
except Exception:  # pragma: no cover
    _SSL_CTX = None


def _download(url: str, dest: Path) -> None:
    """Stream a URL to dest, writing to a .part file first so a crashed download
    never leaves a truncated file that looks complete on the next boot."""
    tmp = dest.with_suffix(dest.suffix + ".part")
    print(f"[bootstrap] downloading {dest.name} from {url} …", flush=True)
    with urllib.request.urlopen(url, context=_SSL_CTX) as resp, open(tmp, "wb") as out:
        while chunk := resp.read(1 << 20):  # 1 MiB chunks
            out.write(chunk)
    tmp.replace(dest)
    print(f"[bootstrap] {dest.name} ready ({dest.stat().st_size:,} bytes)", flush=True)


def _ensure_download(dest: Path, url: str) -> None:
    """Download dest from url, re-downloading whenever the URL changes.

    The source URL is remembered in a sidecar `<name>.src` marker; if it matches
    the current env var, the (possibly large) file is left untouched, so a
    persistent disk downloads once per URL and survives redeploys. Point the env
    var at a new URL to force a refresh — no need to shell in and delete the file.
    """
    marker = dest.with_suffix(dest.suffix + ".src")
    if dest.exists() and marker.exists() and marker.read_text().strip() == url.strip():
        return
    _download(url, dest)
    marker.write_text(url.strip())


def ensure_data() -> None:
    config.CACHE.mkdir(parents=True, exist_ok=True)

    # catalog.json is read-only reference data shipped in git — always refresh it
    # from the repo checkout so catalog edits (e.g. adding laptops) reach the disk
    # on redeploy, not just on first provision.
    # extractions.sqlite is a runtime-written cache — copy only if absent so we
    # never clobber extractions the server has accumulated on the disk.
    for name, overwrite in (("catalog.json", True), ("extractions.sqlite", False)):
        dest = config.CACHE / name
        src = _REPO_CACHE / name
        if not src.exists() or src.resolve() == dest.resolve():
            continue
        existed = dest.exists()
        if overwrite or not existed:
            shutil.copy2(src, dest)
            print(f"[bootstrap] {'refreshed' if existed else 'copied'} {name} from repo checkout")

    # Large files (not in git): download from configured URLs, re-downloading
    # when the URL changes (so updating the env var + redeploy refreshes them).
    import os

    for dest, env in (
        (config.REVIEWS_DB, "REVIEWS_DB_URL"),
        (config.ASIN_MAP_FILE, "ASIN_MAP_URL"),
    ):
        url = os.environ.get(env)
        if not url:
            continue
        _ensure_download(dest, url)
