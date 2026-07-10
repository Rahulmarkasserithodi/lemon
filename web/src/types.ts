// TypeScript types matching the JSON schema produced by pipeline/lemon/export.py

export interface CurvePoint {
  t: number   // time in months
  s: number   // survival probability [0, 1]
  lo: number  // Greenwood CI lower bound
  hi: number  // Greenwood CI upper bound
}

export interface FailureMode {
  mode: string
  count: number
}

export interface ProductData {
  parent_asin: string
  title: string
  brand: string
  price: number | null
  average_rating: number | null
  n_obs: number
  n_events: number
  median_months: number | null          // null means curve never crossed 0.5
  median_is_lower_bound: boolean        // true → median_months is a lower bound
  cost_per_year: number | null          // null if price or median unavailable
  curve: CurvePoint[]
  failure_modes: FailureMode[]
  snippets: Record<string, string[]>    // {failure_mode: [text, ...]}
}

export interface IndexEntry {
  parent_asin: string
  title: string
  brand: string
  subcategory: string
  price: number | null
  average_rating: number | null
  n_obs: number
  n_events: number
  median_months: number | null
  median_is_lower_bound: boolean
  cost_per_year: number | null
}

export interface HeroPair {
  left: string          // parent_asin of longer-lived product
  right: string         // parent_asin of shorter-lived product
  note: string
  median_ratio: number
}

// Merged data point for the overlaid chart
export interface MergedPoint {
  t: number
  s_a: number;  lo_a: number;  hi_a: number
  s_b: number;  lo_b: number;  hi_b: number
}
