/**
 * Hardcoded, pre-verified demo pairs for Demo Mode.
 * These are replaced with real data after Phase 3 runs.
 * The placeholder curves are synthetic but realistic-looking.
 */
import type { ProductData } from './types'

function makeCurve(
  medianMonths: number,
  n: number,
  seed: number,
): { t: number; s: number; lo: number; hi: number }[] {
  // Simple exponential KM-like curve for placeholder display
  const lambda = Math.log(2) / medianMonths
  const points: { t: number; s: number; lo: number; hi: number }[] = []
  const band = 1.2 / Math.sqrt(n)
  for (let t = 0; t <= Math.min(medianMonths * 2.5, 84); t += t < 12 ? 1 : 3) {
    const s = Math.exp(-lambda * t)
    const lo = Math.max(0, s - band * Math.sqrt(s * (1 - s)))
    const hi = Math.min(1, s + band * Math.sqrt(s * (1 - s)))
    points.push({ t: Math.round(t * 10) / 10, s: Math.round(s * 1000) / 1000, lo: Math.round(lo * 1000) / 1000, hi: Math.round(hi * 1000) / 1000 })
  }
  return points
}

export const DEMO_PRODUCTS: Record<string, ProductData> = {
  DEMO_A: {
    parent_asin: 'DEMO_A',
    title: 'IceMaster Pro 26-lb Countertop Ice Maker (Brand A)',
    brand: 'Brand A',
    price: 89.99,
    average_rating: 4.3,
    n_obs: 312,
    n_events: 187,
    median_months: 54,
    median_is_lower_bound: false,
    cost_per_year: 19.99,
    curve: makeCurve(54, 312, 1),
    failure_modes: [
      { mode: 'stopped_working', count: 61 },
      { mode: 'cooling_failure', count: 58 },
      { mode: 'leak', count: 34 },
      { mode: 'control_failure', count: 22 },
      { mode: 'motor_failure', count: 12 },
    ],
    snippets: {
      cooling_failure: [
        'Still cranking out ice after 4.5 years of daily use. No issues at all.',
        'Going on 5 years, works perfectly. My third one of this brand.',
      ],
      stopped_working: [
        'Just crossed the 4-year mark and it\'s still going strong.',
      ],
    },
  },
  DEMO_B: {
    parent_asin: 'DEMO_B',
    title: 'ArcticFreeze 26-lb Countertop Ice Maker (Brand B)',
    brand: 'Brand B',
    price: 79.99,
    average_rating: 4.1,
    n_obs: 278,
    n_events: 201,
    median_months: 22,
    median_is_lower_bound: false,
    cost_per_year: 43.63,
    curve: makeCurve(22, 278, 2),
    failure_modes: [
      { mode: 'stopped_working', count: 74 },
      { mode: 'cooling_failure', count: 63 },
      { mode: 'control_failure', count: 41 },
      { mode: 'motor_failure', count: 23 },
    ],
    snippets: {
      stopped_working: [
        'Stopped making ice completely after 18 months. Worked great until it didn\'t.',
        'Died right after the 1-year warranty expired. Classic.',
      ],
      cooling_failure: [
        'Compressor quit at about 2 years. Very disappointed given the price.',
      ],
    },
  },
}

export const DEMO_PAIRS = [
  {
    left: 'DEMO_A',
    right: 'DEMO_B',
    note: 'Same capacity, similar price, very different lifespans',
    median_ratio: 2.45,
  },
]
