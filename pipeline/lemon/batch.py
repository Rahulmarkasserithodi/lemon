"""Batch extraction via the Gemini Batch API for large-scale runs.

Workflow (run in sequence):
  1. build   — scan reviews, prefilter, write uncached candidates to JSONL
  2. submit  — chunk the JSONL into ≤MAX_JOB_SIZE jobs, upload + submit each
  3. poll    — wait for all jobs to reach a terminal state
  4. merge   — download result JSONLs, parse and merge into the SQLite cache
  5. all     — convenience: build + submit + poll + merge in one shot

Each batch request embeds a hidden <!-- lemon_key:... --> marker so responses
can be mapped back to the originating review without relying on output order.

Run:
    python -m lemon.batch build
    python -m lemon.batch submit
    python -m lemon.batch poll [--timeout-minutes 120]
    python -m lemon.batch merge
    python -m lemon.batch all
"""

import argparse
import gzip
import json
import os
import time
import urllib.request
from pathlib import Path

from google import genai
from google.genai import types

from . import config
from .extract import (
    Extraction,
    build_prompt,
    cache_get,
    cache_put,
    open_cache,
    review_key,
)
from .prefilter import is_candidate

_JOBS_FILE = config.CACHE / "batch_jobs.json"
_REQUESTS_FILE = config.CACHE / "batch_requests.jsonl"
MAX_JOB_SIZE = 20_000   # requests per batch job (stay well under API limits)


# ── request / response helpers ────────────────────────────────────────────────

def _build_request_line(review: dict) -> dict:
    """One line of the input batch JSONL (a GenerateContentRequest object)."""
    key = review_key(review)
    # Embed the key as a hidden comment so we can match responses back.
    prompt = f"<!-- lemon_key:{key} -->\n" + build_prompt(review)
    schema = Extraction.model_json_schema()
    schema["properties"]["failure_mode"]["enum"] = config.FAILURE_MODES + [None]
    return {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": schema,
            "temperature": 0.0,
        },
    }


def _extract_key(contents: list) -> str | None:
    """Pull the embedded lemon_key marker out of a request's contents."""
    try:
        text: str = contents[0]["parts"][0]["text"]
        for line in text.split("\n"):
            if line.startswith("<!-- lemon_key:"):
                return line.removeprefix("<!-- lemon_key:").removesuffix(" -->").strip()
    except (IndexError, KeyError, TypeError):
        pass
    return None


# ── subcommands ───────────────────────────────────────────────────────────────

def cmd_build(_client) -> None:
    """Scan reviews, prefilter, skip cached reviews, write JSONL."""
    config.CACHE.mkdir(parents=True, exist_ok=True)
    db = open_cache()
    total = candidates = written = 0

    with (
        gzip.open(config.REVIEWS_FILE, "rt", encoding="utf-8") as rf,
        open(_REQUESTS_FILE, "w", encoding="utf-8") as wf,
    ):
        for line in rf:
            total += 1
            r = json.loads(line)
            if not is_candidate(r.get("text") or ""):
                continue
            candidates += 1
            if cache_get(db, review_key(r)) is not None:
                continue
            wf.write(json.dumps(_build_request_line(r)) + "\n")
            written += 1
            if written % 10_000 == 0:
                print(f"  {written:,} requests written …", flush=True)

    db.close()
    density = candidates / total if total else 0
    print(f"\nReviews scanned:         {total:,}")
    print(f"Candidates (prefiltered):{candidates:,}  ({density:.1%})")
    print(f"Uncached requests:       {written:,}")
    print(f"Written to:              {_REQUESTS_FILE}")


def cmd_submit(client: genai.Client) -> None:
    """Chunk the requests JSONL and submit each chunk as a separate batch job."""
    if not _REQUESTS_FILE.exists():
        raise SystemExit("Run `python -m lemon.batch build` first.")

    all_lines = _REQUESTS_FILE.read_text(encoding="utf-8").splitlines(keepends=True)
    chunks = [all_lines[i: i + MAX_JOB_SIZE] for i in range(0, len(all_lines), MAX_JOB_SIZE)]
    print(f"Submitting {len(chunks)} batch job(s) ({len(all_lines):,} requests total) …")

    jobs = []
    for idx, chunk in enumerate(chunks):
        chunk_path = config.CACHE / f"batch_chunk_{idx:03d}.jsonl"
        chunk_path.write_text("".join(chunk), encoding="utf-8")

        print(f"  [{idx + 1}/{len(chunks)}] uploading {len(chunk):,} requests …", end=" ", flush=True)
        file_resource = client.files.upload(
            file=chunk_path,
            config=types.UploadFileConfig(mime_type="text/plain"),
        )
        print(f"uri={file_resource.uri}")

        batch = client.batches.create(
            model=config.GEMINI_MODEL,
            src=file_resource.uri,
        )
        state_str = batch.state.name if hasattr(batch.state, "name") else str(batch.state)
        jobs.append({"name": batch.name, "chunk": idx, "state": state_str})
        print(f"     job: {batch.name}  state={state_str}")

    _JOBS_FILE.write_text(json.dumps(jobs, indent=2))
    print(f"\nJob manifest saved to {_JOBS_FILE}")


def cmd_poll(client: genai.Client, timeout_minutes: int = 120) -> None:
    """Poll job states until all are terminal (or timeout)."""
    if not _JOBS_FILE.exists():
        raise SystemExit("Run `python -m lemon.batch submit` first.")

    jobs: list[dict] = json.loads(_JOBS_FILE.read_text())
    deadline = time.time() + timeout_minutes * 60
    _TERMINAL = {"SUCCEEDED", "FAILED", "CANCELLED"}

    while time.time() < deadline:
        done = 0
        for j in jobs:
            job = client.batches.get(name=j["name"])
            state_name = job.state.name if hasattr(job.state, "name") else str(job.state)
            j["state"] = state_name
            if hasattr(job, "output_uri") and job.output_uri:
                j["output_uri"] = str(job.output_uri)
            if any(t in state_name for t in _TERMINAL):
                done += 1

        _JOBS_FILE.write_text(json.dumps(jobs, indent=2))
        ts = time.strftime("%H:%M:%S")
        summary = "  ".join(f"{j['name'].split('/')[-1]}={j['state']}" for j in jobs)
        print(f"[{ts}] {summary}")

        if done == len(jobs):
            print("All jobs reached terminal state.")
            return
        time.sleep(30)

    print(f"Timed out after {timeout_minutes} min. Check {_JOBS_FILE} for current states.")


def cmd_merge(client: genai.Client) -> None:
    """Download result JSONLs and merge into the SQLite cache."""
    if not _JOBS_FILE.exists():
        raise SystemExit("Run `python -m lemon.batch submit` and `poll` first.")

    jobs: list[dict] = json.loads(_JOBS_FILE.read_text())

    # Build key → parent_asin index from the reviews file (needed for cache_put)
    print("Building review-key → parent_asin index …")
    key_to_asin: dict[str, str] = {}
    with gzip.open(config.REVIEWS_FILE, "rt", encoding="utf-8") as f:
        for line in f:
            r = json.loads(line)
            key_to_asin[review_key(r)] = r.get("parent_asin") or r.get("asin") or ""

    db = open_cache()
    total_merged = 0

    for j in jobs:
        if "SUCCEEDED" not in j.get("state", ""):
            print(f"  skip {j['name']} (state={j.get('state')})")
            continue

        output_uri = j.get("output_uri") or ""
        if not output_uri:
            job = client.batches.get(name=j["name"])
            output_uri = str(getattr(job, "output_uri", "") or "")
        if not output_uri:
            print(f"  WARNING: no output_uri for {j['name']} — skipping")
            continue

        dest = config.CACHE / f"results_{j['name'].split('/')[-1]}.jsonl"
        print(f"  downloading {j['name']} …")
        _download_output(client, output_uri, dest)

        merged = 0
        with open(dest, encoding="utf-8") as f:
            for line in f:
                rec = json.loads(line)
                status = rec.get("status") or {}
                if (status.get("code") or 0) != 0:
                    continue
                request = rec.get("request") or {}
                response = rec.get("response") or {}
                key = _extract_key(request.get("contents") or [])
                if not key:
                    continue
                try:
                    text = response["candidates"][0]["content"]["parts"][0]["text"]
                    result = json.loads(text)
                except (KeyError, IndexError, json.JSONDecodeError):
                    continue
                cache_put(db, key, key_to_asin.get(key, ""), result)
                merged += 1

        db.commit()
        total_merged += merged
        print(f"    merged {merged:,} results")

    db.close()
    print(f"\nTotal merged into cache: {total_merged:,}")


def _download_output(client: genai.Client, output_uri: str, dest: Path) -> None:
    """Download a batch result file; handles HTTPS and GCS URIs."""
    if output_uri.startswith("https://"):
        urllib.request.urlretrieve(output_uri, dest)
    elif output_uri.startswith("gs://"):
        try:
            from google.cloud import storage as gcs  # type: ignore
            bucket_name, blob_path = output_uri[5:].split("/", 1)
            gcs.Client().bucket(bucket_name).blob(blob_path).download_to_filename(str(dest))
        except ImportError:
            raise RuntimeError(
                "Install google-cloud-storage to download GCS output: "
                "`pip install google-cloud-storage`"
            )
    else:
        raise RuntimeError(f"Unrecognised output_uri scheme: {output_uri!r}")


# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Gemini batch extraction for lemon pipeline")
    ap.add_argument("command", choices=["build", "submit", "poll", "merge", "all"])
    ap.add_argument("--timeout-minutes", type=int, default=120)
    args = ap.parse_args()

    # `build` doesn't touch the API
    client = None
    if args.command != "build":
        key = os.environ.get("GEMINI_API_KEY")
        if not key:
            raise SystemExit("Set GEMINI_API_KEY in your environment.")
        client = genai.Client(api_key=key)

    if args.command == "build":
        cmd_build(client)
    elif args.command == "submit":
        cmd_submit(client)
    elif args.command == "poll":
        cmd_poll(client, args.timeout_minutes)
    elif args.command == "merge":
        cmd_merge(client)
    elif args.command == "all":
        cmd_build(client)
        cmd_submit(client)
        cmd_poll(client, args.timeout_minutes)
        cmd_merge(client)
