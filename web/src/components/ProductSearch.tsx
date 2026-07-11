import { useState, useEffect, useRef } from 'react'
import type { CatalogEntry, SelItem } from '../types'
import { fetchCatalog, resolveProduct, looksLikeAmazonLink } from '../api'
import { INK, ON_INK, PANEL, TEAL, RUST, inkAlpha } from '../theme'

interface Props {
  onPick: (item: SelItem) => void
  selectedAsins: string[]
}

/**
 * Search-as-dropdown product finder. Type to reveal a dropdown of catalog
 * matches, or paste an Amazon link to resolve a product by ASIN. Each choice is
 * emitted via onPick; selection/compare state lives in the parent.
 */
export default function ProductSearch({ onPick, selectedAsins }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CatalogEntry[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [error, setError] = useState('')
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

  const reset = () => {
    setQuery('')
    setResults([])
    setOpen(false)
    setError('')
  }

  const pickCatalog = (e: CatalogEntry) => {
    onPick({ asin: e.parent_asin, title: e.title, image: e.image })
    reset()
  }

  const addFromLink = async () => {
    if (!isLink || resolving) return
    setResolving(true)
    setError('')
    try {
      const p = await resolveProduct(query)
      onPick({ asin: p.parent_asin, title: p.title, image: p.image, preloaded: p })
      reset()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setResolving(false)
    }
  }

  const onSubmit = () => {
    if (isLink) return addFromLink()
    if (results.length) pickCatalog(results[0])
  }

  return (
    <div className="relative" ref={boxRef}>
      <div className="flex bg-white" style={{ border: `1.5px solid ${INK}` }}>
        <input
          type="search"
          placeholder="Search a product — e.g. kettle, printer, earbuds"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onSubmit()
            }
          }}
          onFocus={() => query.trim() && setOpen(true)}
          className="flex-1 min-w-0 bg-transparent px-[18px] py-4 text-[15px] text-[#1c1f21] focus:outline-none"
        />
        <button
          onClick={onSubmit}
          className="px-[22px] font-mono text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors"
          style={{ borderLeft: `1.5px solid ${INK}`, background: INK, color: ON_INK }}
        >
          Search
        </button>
      </div>

      {open && query.trim() && (
        <div
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-[340px] overflow-y-auto"
          style={{ background: PANEL, border: `1px solid ${inkAlpha(0.3)}`, boxShadow: '0 4px 16px rgba(0,0,0,.08)' }}
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
            const chosen = selectedAsins.includes(e.parent_asin)
            return (
              <button
                key={e.parent_asin}
                onClick={() => pickCatalog(e)}
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
                      {e.latest_review != null && <span>reviewed thru ’{String(new Date(e.latest_review).getFullYear()).slice(2)}</span>}
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {error && (
        <p className="mt-2 text-[12px]" style={{ color: RUST }}>
          {error}{' '}
          {error.includes('Failed to fetch') && (
            <span style={{ color: inkAlpha(0.5) }}>
              — is the server running? <code className="font-mono">python -m lemon.server</code>
            </span>
          )}
        </p>
      )}
    </div>
  )
}
