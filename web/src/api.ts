// Client for the local Lemon extraction server (proxied at /api by Vite).
import type { CatalogEntry, ProductData } from './types'

export interface HealthStatus {
  gemini_key: boolean
  reviews_db: boolean
  catalog: boolean
  model: string
}

export async function fetchHealth(): Promise<HealthStatus> {
  const res = await fetch('/api/health')
  if (!res.ok) throw new Error(`health: ${res.status}`)
  return res.json()
}

export async function fetchCatalog(q = '', limit = 200): Promise<CatalogEntry[]> {
  const params = new URLSearchParams({ q, limit: String(limit) })
  const res = await fetch(`/api/catalog?${params}`)
  if (!res.ok) throw new Error(`catalog: ${res.status}`)
  return res.json()
}

/** Extract (or load from cache) one product's survival curve. May take a few
 *  seconds on first call while the LLM reads the reviews. */
export async function fetchProductLive(asin: string): Promise<ProductData> {
  const res = await fetch(`/api/product/${asin}`)
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    throw new Error(detail?.detail || `product ${asin}: ${res.status}`)
  }
  return res.json()
}
