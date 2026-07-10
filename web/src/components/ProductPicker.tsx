import { useState, useEffect, useCallback } from 'react'
import type { CatalogEntry, ProductData } from '../types'
import { fetchCatalog, fetchProductLive } from '../api'
import { INK, ON_INK, RUST, TEAL, inkAlpha } from '../theme'

interface Props {
  onSelectPair: (left: ProductData, right: ProductData) => void
}

function EntryRow({
  entry,
  selected,
  onToggle,
  selectionFull,
}: {
  entry: CatalogEntry
  selected: boolean
  onToggle: () => void
  selectionFull: boolean
}) {
  const disabled = selectionFull && !selected
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className="w-full text-left px-3 py-2.5 border transition-colors text-[13px]"
      style={
        selected
          ? { borderColor: INK, background: inkAlpha(0.08) }
          : disabled
          ? { borderColor: inkAlpha(0.12), color: inkAlpha(0.3), cursor: 'not-allowed' }
          : { borderColor: inkAlpha(0.22) }
      }
    >
      <div className="flex items-start justify-between gap-2">
        <span className="leading-snug flex-1">{entry.title}</span>
        <span className="shrink-0 font-mono text-[11px]" style={{ color: inkAlpha(0.42) }}>
          {entry.n_reviews.toLocaleString()} rev.
        </span>
      </div>
      <div className="flex gap-3 mt-1 font-mono text-[10.5px]" style={{ color: inkAlpha(0.45) }}>
        {entry.brand && <span>{entry.brand}</span>}
        {entry.price != null && <span>${entry.price.toFixed(0)}</span>}
        {entry.average_rating != null && <span>★ {entry.average_rating.toFixed(1)}</span>}
        {entry.subcategory && <span>{entry.subcategory}</span>}
      </div>
    </button>
  )
}

export default function ProductPicker({ onSelectPair }: Props) {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [comparing, setComparing] = useState(false)
  const [status, setStatus] = useState('')

  // Debounced server-side catalog search.
  useEffect(() => {
    let active = true
    const id = setTimeout(() => {
      fetchCatalog(query, 200)
        .then((c) => active && setCatalog(c))
        .catch((e) => active && setError(e.message))
        .finally(() => active && setLoading(false))
    }, 200)
    return () => {
      active = false
      clearTimeout(id)
    }
  }, [query])

  const toggle = useCallback((asin: string) => {
    setSelected((prev) =>
      prev.includes(asin) ? prev.filter((a) => a !== asin) : [...prev.slice(-1), asin],
    )
  }, [])

  const compare = async () => {
    if (selected.length < 2) return
    setComparing(true)
    setError('')
    try {
      setStatus('Reading reviews with the model … (first run can take a few seconds)')
      const [a, b] = await Promise.all(selected.map(fetchProductLive))
      if (!a.curve.length || !b.curve.length) {
        const thin = !a.curve.length ? a.title : b.title
        throw new Error(`Not enough dated failure/longevity mentions for "${thin}" yet.`)
      }
      const [left, right] =
        (a.median_months ?? 0) >= (b.median_months ?? 0) ? [a, b] : [b, a]
      onSelectPair(left, right)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setComparing(false)
      setStatus('')
    }
  }

  if (loading) {
    return <p className="font-mono text-[12px]" style={{ color: inkAlpha(0.5) }}>Loading catalog from the server …</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        <input
          type="search"
          placeholder="Search products — kettle, printer, earbuds…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 bg-transparent px-3 py-2 text-[13px] text-[#e8e6df] focus:outline-none"
          style={{ border: `1px solid ${inkAlpha(0.28)}` }}
        />
        <button
          onClick={compare}
          disabled={selected.length < 2 || comparing}
          className="px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ background: INK, color: ON_INK }}
        >
          {comparing ? 'Extracting …' : 'Compare'}
        </button>
      </div>

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
      {!error && !status && selected.length > 0 && (
        <p className="font-mono text-[11px]" style={{ color: inkAlpha(0.5) }}>
          {selected.length === 1
            ? 'Select one more product to compare'
            : 'Ready — click Compare'}
        </p>
      )}

      <div className="space-y-1.5 max-h-[60vh] overflow-y-auto pr-1">
        {catalog.map((e) => (
          <EntryRow
            key={e.parent_asin}
            entry={e}
            selected={selected.includes(e.parent_asin)}
            onToggle={() => toggle(e.parent_asin)}
            selectionFull={selected.length >= 2}
          />
        ))}
        {catalog.length === 0 && (
          <p className="text-[13px] text-center py-8" style={{ color: inkAlpha(0.45) }}>No results for "{query}"</p>
        )}
      </div>
    </div>
  )
}
