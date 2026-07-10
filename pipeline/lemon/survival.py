"""Kaplan-Meier fitting from cached extractions.

Turns extraction records into (duration, event_observed) pairs and fits
lifelines' KaplanMeierFitter per product (and per brand), with Greenwood CI.
"""

from dataclasses import dataclass
from typing import Optional

import pandas as pd
from lifelines import KaplanMeierFitter

from . import config


def to_observation(extraction: dict) -> Optional[tuple[float, bool]]:
    """(duration_months, event_observed) or None if unusable.

    Stated failure time  -> event at t.
    "Still works after t" -> right-censored at t.
    """
    if (extraction.get("confidence") or 0) < config.MIN_CONFIDENCE:
        return None
    ttf = extraction.get("time_to_failure_months")
    lkg = extraction.get("last_known_good_months")
    if extraction.get("failed") and isinstance(ttf, (int, float)) and ttf > 0:
        return (min(float(ttf), config.MAX_DURATION_MONTHS), True)
    if isinstance(lkg, (int, float)) and lkg > 0:
        return (min(float(lkg), config.MAX_DURATION_MONTHS), False)
    return None


@dataclass
class KMResult:
    n_obs: int
    n_events: int
    median_months: Optional[float]      # None => never crosses 0.5
    median_is_lower_bound: bool
    curve: list[dict]                   # [{t, s, lo, hi}]

    @property
    def median_display_months(self) -> float:
        """Median, or the last observed time as a lower bound."""
        return self.median_months if self.median_months is not None else self.max_t

    @property
    def max_t(self) -> float:
        return self.curve[-1]["t"] if self.curve else 0.0


def fit_km(observations: list[tuple[float, bool]], max_points: int = 120) -> Optional[KMResult]:
    n_events = sum(1 for _, e in observations if e)
    if len(observations) < config.MIN_OBSERVATIONS or n_events < config.MIN_EVENTS:
        return None

    durations = [d for d, _ in observations]
    events = [e for _, e in observations]
    kmf = KaplanMeierFitter()
    kmf.fit(durations, event_observed=events)

    median = kmf.median_survival_time_
    median_unbounded = median == float("inf") or pd.isna(median)

    ci = kmf.confidence_interval_survival_function_
    sf = kmf.survival_function_
    lo_col, hi_col = ci.columns[0], ci.columns[1]
    rows = []
    for t in sf.index:
        rows.append(
            {
                "t": round(float(t), 2),
                "s": round(float(sf.loc[t].iloc[0]), 4),
                "lo": round(float(ci.loc[t, lo_col]), 4),
                "hi": round(float(ci.loc[t, hi_col]), 4),
            }
        )
    # Thin very long curves for payload size, always keeping first and last.
    if len(rows) > max_points:
        step = len(rows) / max_points
        keep = {int(i * step) for i in range(max_points)} | {0, len(rows) - 1}
        rows = [r for i, r in enumerate(rows) if i in keep]

    return KMResult(
        n_obs=len(observations),
        n_events=n_events,
        median_months=None if median_unbounded else round(float(median), 1),
        median_is_lower_bound=median_unbounded,
        curve=rows,
    )


def cost_per_year(price: Optional[float], km: KMResult) -> Optional[float]:
    """price / median-lifespan-in-years; None when price missing.

    When the median is unbounded we use the observation horizon as a lower
    bound on lifespan, which makes cost_per_year an UPPER bound — callers
    must surface `median_is_lower_bound` alongside this number.
    """
    if price is None or price <= 0:
        return None
    years = km.median_display_months / 12.0
    if years <= 0:
        return None
    return round(price / years, 2)
