"""Single place for category choice, paths, model, and thresholds."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
CACHE = ROOT / "data" / "cache"
PROCESSED = ROOT / "data" / "processed"

CATEGORY = "Appliances"
REVIEWS_FILE = RAW / f"{CATEGORY}.jsonl"
META_FILE = RAW / f"meta_{CATEGORY}.jsonl"

GEMINI_MODEL = "gemini-2.5-flash-lite"
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
