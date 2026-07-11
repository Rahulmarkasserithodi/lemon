// Client for the Lemon extraction server
import type { CatalogEntry, ProductData, IndexEntry, HeroPair } from './types'

// Use Render backend in production, local proxy in dev
const API_BASE = import.meta.env.VITE_API_URL || '/api'

// Debug: log what API URL is being used
if (typeof window !== 'undefined') {
  console.log('API_BASE:', API_BASE)
  console.log('VITE_API_URL env:', import.meta.env.VITE_API_URL)
}

export interface HealthStatus {
  gemini_key: boolean
  reviews_db: boolean
  catalog: boolean
  model: string
}

export async function fetchHealth(): Promise<HealthStatus> {
  const res = await fetch(`${API_BASE}/health`)
  if (!res.ok) throw new Error(`health: ${res.status}`)
  return res.json()
}

export async function fetchCatalog(q = '', limit = 200): Promise<CatalogEntry[]> {
  const params = new URLSearchParams({ q, limit: String(limit) })
  const res = await fetch(`${API_BASE}/catalog?${params}`)
  if (!res.ok) throw new Error(`catalog: ${res.status}`)
  return res.json()
}

/** Extract (or load from cache) one product's survival curve. May take a few
 *  seconds on first call while the LLM reads the reviews. */
export async function fetchProductLive(asin: string): Promise<ProductData> {
  const res = await fetch(`${API_BASE}/product/${asin}`)
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    throw new Error(detail?.detail || `product ${asin}: ${res.status}`)
  }
  return res.json()
}

/** Resolve a pasted Amazon product URL (or bare ASIN) to a product. Throws a
 *  human-readable message when the ASIN isn't in our review corpus. */
export async function resolveProduct(url: string): Promise<ProductData> {
  const res = await fetch(`${API_BASE}/resolve?url=${encodeURIComponent(url)}`)
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    throw new Error(detail?.detail || `resolve failed: ${res.status}`)
  }
  return res.json()
}

/** True when the text looks like an Amazon URL or a bare 10-char ASIN. */
export function looksLikeAmazonLink(text: string): boolean {
  const t = text.trim()
  if (/^[A-Z0-9]{10}$/i.test(t)) return true
  return /amazon\.[a-z.]+|amzn\.|\/dp\/|\/gp\/product\//i.test(t) && /[A-Z0-9]{10}/i.test(t)
}

// ── Static, committed data (served from data/processed/, works fully offline) ──

/** The published corpus — products ready to compare, with summary stats. */
export async function fetchIndex(): Promise<IndexEntry[]> {
  const res = await fetch('/index.json')
  if (!res.ok) throw new Error(`index: ${res.status}`)
  return res.json()
}

/** Curated, pre-verified hero comparison pairs. */
export async function fetchHeroPairs(): Promise<HeroPair[]> {
  const res = await fetch('/hero_pairs.json')
  if (!res.ok) throw new Error(`hero_pairs: ${res.status}`)
  return res.json()
}

/** Load a committed product JSON directly (no server / LLM needed). */
export async function fetchProductStatic(asin: string): Promise<ProductData> {
  const res = await fetch(`/products/${asin}.json`)
  if (!res.ok) throw new Error(`static ${asin}: ${res.status}`)
  return res.json()
}

/** Load a product the cheapest way: committed static JSON first (instant,
 *  offline), falling back to on-demand live extraction for anything else. */
export async function loadProduct(asin: string): Promise<ProductData> {
  try {
    return await fetchProductStatic(asin)
  } catch {
    return await fetchProductLive(asin)
  }
}
