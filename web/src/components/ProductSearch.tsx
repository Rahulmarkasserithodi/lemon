import { useState, useEffect, useRef, useCallback } from 'react'
import type { CatalogEntry, ProductData } from '../types'
import { fetchCatalog, fetchProductLive, resolveProduct, looksLikeAmazonLink } from '../api'
import { INK, ON_INK, PANEL, RUST, TEAL, inkAlpha } from '../theme'

// A resolved product carries every field a CatalogEntry chip needs.
function toEntry(p: ProductData): CatalogEntry {
  return {
    parent_asin: p.parent_asin,
    title: p.title,
    brand: p.brand,
    subcategory: '',
    price: p.price,
    average_rating: p.average_rating,
    n_reviews: p.n_reviews ?? 0,
    image: p.image,
  }
}

interface Props {
  onCompare: (left: ProductData, right: ProductData) => void
}

const SLOT_COLOR = [RUST, TEAL]

/**
 * Search-as-dropdown product picker. Type to reveal a dropdown of catalog
 * matches; pick two products; Compare triggers a live (cached) extraction and
 * hands the ordered pair back to the parent.
 */
export default function ProductSearch({ onCompare }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CatalogEntry[]>([])
  const [selected, setSelected] = useState<CatalogEntry[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [comparing, setComparing] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)

  const isLink = looksLikeAmazonLink(query)

  // Debounced server-side catalog search (skipped when the query is a link).
  useEffect(() => {
    const q = query.trim()
    if (!q || looksLikeAmazonLink(q)) {
      setResults([])
      setSearching(false)
      return
    }
    let active = true
    setSearching(true)
    const id = setTimeout(() => {
      fetchCatalog(q, 40)
        .then((c) => active && setResults(c))
        .catch((e) => active && setError(e.message))
        .finally(() => active && setSearching(false))
    }, 200)
    return () => {
      active = false
      clearTimeout(id)
    }
  }, [query])

  // Close the dropdown on outside click.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const pick = useCallback((entry: CatalogEntry) => {
    setSelected((prev) => {
      if (prev.some((p) => p.parent_asin === entry.parent_asin)) return prev
      return [...prev.slice(-1), entry] // keep at most the last two
    })
    setQuery('')
    setResults([])
    setOpen(false)
    setError('')
  }, [])

  const remove = (asin: string) =>
    setSelected((prev) => prev.filter((p) => p.parent_asin !== asin))

  const addFromLink = async () => {
    if (!isLink || resolving) return
    setResolving(true)
    setError('')
    setStatus('Resolving product from link …')
    try {
      const p = await resolveProduct(query)
      pick(toEntry(p)) // clears query + dropdown
    } catch (e: any) {
      setError(e.message)
    } finally {
      setResolving(false)
      setStatus('')
    }
  }

  const compare = async () => {
    if (selected.length < 2) return
    setComparing(true)
    setError('')
    setStatus('Reading reviews with the model … (first run can take a few seconds)')
    try {
      const [a, b] = await Promise.all(selected.map((s) => fetchProductLive(s.parent_asin)))
      if (!a.curve.length || !b.curve.length) {
        const thin = !a.curve.length ? a.title : b.title
        throw new Error(`Not enough dated failure/longevity mentions for "${thin}" yet.`)
      }
      const [left, right] =
        (a.median_months ?? 0) >= (b.median_months ?? 0) ? [a, b] : [b, a]
      onCompare(left, right)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setComparing(false)
      setStatus('')
    }
  }

  return (
    <div className="space-y-3">
      {/* selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {selected.map((s, i) => (
            <span
              key={s.parent_asin}
              className="flex items-center gap-2 px-2.5 py-1.5 text-[12px] max-w-[340px]"
              style={{ border: `1px solid ${SLOT_COLOR[i]}`, color: inkAlpha(0.85) }}
            >
              <span className="font-mono text-[10px]" style={{ color: SLOT_COLOR[i] }}>
                {i === 0 ? 'A' : 'B'}
              </span>
              <span className="truncate">{s.title}</span>
              <button
                onClick={() => remove(s.parent_asin)}
                className="shrink-0 leading-none text-[15px]"
                style={{ color: inkAlpha(0.5) }}
                aria-label="Remove"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* search + compare */}
      <div className="flex gap-2 items-stretch" ref={boxRef}>
        <div className="relative flex-1">
          <input
            type="search"
            placeholder="Search a product, or paste an Amazon link…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && isLink) {
                e.preventDefault()
                addFromLink()
              }
            }}
            onFocus={() => query.trim() && setOpen(true)}
            className="w-full bg-transparent px-3 py-2 text-[13px] text-[#e8e6df] focus:outline-none"
            style={{ border: `1px solid ${inkAlpha(0.28)}` }}
          />

          {/* dropdown */}
          {open && query.trim() && (
            <div
              className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-[340px] overflow-y-auto"
              style={{ background: PANEL, border: `1px solid ${INK}` }}
            >
              {/* pasted Amazon link → resolve action */}
              {isLink && (
                <button
                  onClick={addFromLink}
                  disabled={resolving}
                  className="w-full text-left px-3 py-3 text-[13px] transition-colors disabled:opacity-50"
                  onMouseEnter={(ev) => (ev.currentTarget.style.background = inkAlpha(0.06))}
                  onMouseLeave={(ev) => (ev.currentTarget.style.background = 'transparent')}
                >
                  <span className="font-mono text-[11px]" style={{ color: TEAL }}>
                    {resolving ? '↻ Resolving…' : '↵ Add product from link'}
                  </span>
                  <span className="block mt-0.5 font-mono text-[10.5px]" style={{ color: inkAlpha(0.45) }}>
                    Looks up the ASIN in our review corpus
                  </span>
                </button>
              )}
              {!isLink && searching && results.length === 0 && (
                <div className="px-3 py-3 font-mono text-[11px]" style={{ color: inkAlpha(0.5) }}>
                  Searching …
                </div>
              )}
              {!isLink && !searching && results.length === 0 && (
                <div className="px-3 py-3 text-[12px]" style={{ color: inkAlpha(0.45) }}>
                  No results for "{query.trim()}"
                </div>
              )}
              {results.map((e) => {
                const chosen = selected.some((s) => s.parent_asin === e.parent_asin)
                return (
                  <button
                    key={e.parent_asin}
                    onClick={() => pick(e)}
                    disabled={chosen}
                    className="w-full text-left px-3 py-2.5 text-[13px] transition-colors disabled:opacity-40"
                    style={{ borderBottom: `1px solid ${inkAlpha(0.12)}` }}
                    onMouseEnter={(ev) => (ev.currentTarget.style.background = inkAlpha(0.06))}
                    onMouseLeave={(ev) => (ev.currentTarget.style.background = 'transparent')}
                  >
                    <div className="flex gap-2.5">
                      {e.image && (
                        <img
                          src={e.image}
                          alt=""
                          loading="lazy"
                          onError={(ev) => (ev.currentTarget.style.display = 'none')}
                          className="w-9 h-9 shrink-0 object-contain bg-white"
                          style={{ border: `1px solid ${inkAlpha(0.15)}` }}
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <span className="leading-snug flex-1">{e.title}</span>
                          <span className="shrink-0 font-mono text-[11px]" style={{ color: inkAlpha(0.42) }}>
                            {e.n_reviews.toLocaleString()} rev.
                          </span>
                        </div>
                        <div className="flex gap-3 mt-1 font-mono text-[10.5px]" style={{ color: inkAlpha(0.45) }}>
                          {e.brand && <span>{e.brand}</span>}
                          {e.price != null && <span>${e.price.toFixed(0)}</span>}
                          {e.average_rating != null && <span>★ {e.average_rating.toFixed(1)}</span>}
                          {e.subcategory && <span>{e.subcategory}</span>}
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <button
          onClick={compare}
          disabled={selected.length < 2 || comparing}
          className="px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ background: INK, color: ON_INK }}
        >
          {comparing ? 'Extracting …' : 'Compare'}
        </button>
      </div>

      {/* status / hints */}
      {error && (
        <p className="text-[12px]" style={{ color: RUST }}>
          {error}{' '}
          {error.includes('Failed to fetch') && (
            <span style={{ color: inkAlpha(0.5) }}>
              — is the server running? <code className="font-mono">python -m lemon.server</code>
            </span>
          )}
        </p>
      )}
      {status && <p className="text-[12px]" style={{ color: TEAL }}>{status}</p>}
      {!error && !status && selected.length === 1 && (
        <p className="font-mono text-[11px]" style={{ color: inkAlpha(0.5) }}>
          Add one more product, then Compare
        </p>
      )}
    </div>
  )
}
