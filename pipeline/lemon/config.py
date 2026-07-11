"""Single place for category choice, paths, model, and thresholds."""

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]

# On Render, set LEMON_DATA_ROOT to the persistent disk mount path (e.g. /data).
# Locally this is unset and the repo-relative data/ directory is used as normal.
_DATA_ROOT = Path(os.environ.get("LEMON_DATA_ROOT", "")).resolve() if os.environ.get("LEMON_DATA_ROOT") else ROOT / "data"

RAW = _DATA_ROOT / "raw"
CACHE = _DATA_ROOT / "cache"
PROCESSED = _DATA_ROOT / "processed"

# Load environment variables from the repo-root .env (GEMINI_API_KEY, etc.).
load_dotenv(ROOT / ".env")

CATEGORY = "Appliances"
REVIEWS_FILE = RAW / f"{CATEGORY}.jsonl.gz"
META_FILE = RAW / f"meta_{CATEGORY}.jsonl.gz"

# Fast per-product lookup index + browsable catalog (built once from the raw files).
REVIEWS_DB = CACHE / "reviews.db"
CATALOG_FILE = CACHE / "catalog.json"

# gemini-2.5-flash-lite is retired for new API keys; 3.1-flash-lite is the
# pinned successor (deterministic across the hackathon). Verified working.
GEMINI_MODEL = "gemini-3.1-flash-lite"
EXTRACTION_CACHE_DB = CACHE / "extractions.sqlite"

# Per-product extraction fans its uncached candidate reviews out concurrently
# (each is an independent network call). Bounded so we stay under rate limits.
EXTRACTION_CONCURRENCY = 8

# child_asin → parent_asin map (for resolving pasted Amazon product links).
ASIN_MAP_FILE = CACHE / "asin_to_parent.json"

# Survival-model publication thresholds (honesty: never show curves built on air)
MIN_OBSERVATIONS = 25
MIN_EVENTS = 10
MAX_DURATION_MONTHS = 120  # clip; longer self-reported durations are noise
MIN_CONFIDENCE = 0.5

# Normalised failure-mode vocabulary. The LLM must pick from these (or null).
# A union across the product domains we cover so one enum serves every product;
# irrelevant modes simply never get picked for a given category.
_APPLIANCE_MODES = [
    "stopped_working",      # complete death, cause unstated
    "wont_power_on",
    "cooling_failure",      # fridges, ice makers, AC
    "heating_failure",      # heating elements, dryers
    "motor_failure",
    "leak",
    "physical_breakage",    # cracked housing, broken hinge/handle
    "electrical_fault",     # sparks, tripped breaker, burnt smell
    "control_failure",      # buttons, display, thermostat, board
    "noise_vibration",
    "rust_corrosion",
]
_LAPTOP_MODES = [
    "battery_failure",      # battery won't hold charge / swelling
    "screen_failure",       # dead pixels, backlight, cracked/black display
    "keyboard_failure",     # keys stop working, trackpad dead
    "hinge_failure",        # cracked/loose hinge, lid separation
    "storage_failure",      # SSD/HDD failure, boot drive died
    "overheating",          # thermal throttling, shuts off from heat, fan
    "wont_boot",            # powers on but won't boot / stuck
    "charging_port_failure",# charging port / power jack, won't charge
]
FAILURE_MODES = [*_APPLIANCE_MODES, *_LAPTOP_MODES, "other"]
