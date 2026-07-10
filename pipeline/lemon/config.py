"""Single place for category choice, paths, model, and thresholds."""

from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
CACHE = ROOT / "data" / "cache"
PROCESSED = ROOT / "data" / "processed"

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

# Survival-model publication thresholds (honesty: never show curves built on air)
MIN_OBSERVATIONS = 25
MIN_EVENTS = 10
MAX_DURATION_MONTHS = 120  # clip; longer self-reported durations are noise
MIN_CONFIDENCE = 0.5

# Normalised failure-mode vocabulary. The LLM must pick from these (or null).
# Initial guess for Appliances — revisited after the 100-review validation.
FAILURE_MODES = [
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
    "other",
]
