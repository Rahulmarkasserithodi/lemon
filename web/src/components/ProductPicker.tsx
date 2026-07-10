import { useState, useEffect, useCallback } from 'react'
import type { IndexEntry, ProductData } from '../types'

interface Props {
  onSelectPair: (left: ProductData, right: ProductData) => void
}

async function fetchIndex(): Promise<IndexEntry[]> {
  const res = await fetch('/index.json')
  if (!res.ok) throw new Error(`index.json: ${res.status}`)
  return res.json()
}

async function fetchProduct(asin: string): Promise<ProductData> {
  const res = await fetch(`/products/${asin}.json`)
  if (!res.ok) throw new Error(`${asin}: ${res.status}`)
  return res.json()
}

function EntryRow({
  entry,
  selected,
  onToggle,
  selectionFull,
}: {
  entry: IndexEntry
  selected: boolean
  onToggle: () => void
  selectionFull: boolean
}) {
  const disabled = selectionFull && !selected
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors text-sm ${
        selected
          ? 'border-[#f5e642] bg-[#f5e64210]'
          : disabled
          ? 'border-[#1e1e1e] text-[#444] cursor-not-allowed'
          : 'border-[#222] hover:border-[#333] hover:bg-[#141414]'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[#d0d0d0] leading-snug flex-1">{entry.title}</span>
        {entry.cost_per_year != null && (
          <span className="shrink-0 text-[#888] text-xs">
            ${entry.cost_per_year.toFixed(0)}/yr
          </span>
        )}
      </div>
      <div className="flex gap-3 mt-1 text-[10px] text-[#555]">
        {entry.brand && <span>{entry.brand}</span>}
        {entry.price != null && <span>${entry.price.toFixed(0)}</span>}
        {entry.average_rating != null && <span>★ {entry.average_rating.toFixed(1)}</span>}
        {entry.median_months != null && (
          <span>
            {entry.median_is_lower_bound ? '>' : ''}
            {entry.median_months.toFixed(0)}mo
          </span>
        )}
        <span>n={entry.n_obs}</span>
      </div>
    </button>
  )
}

export default function ProductPicker({ onSelectPair }: Props) {
  const [index, setIndex] = useState<IndexEntry[]>([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [comparing, setComparing] = useState(false)

  useEffect(() => {
    fetchIndex()
      .then(setIndex)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const filtered = index.filter((e) => {
    if (!query) return true
    const q = query.toLowerCase()
    return (
      e.title.toLowerCase().includes(q) ||
      (e.brand && e.brand.toLowerCase().includes(q)) ||
      (e.subcategory && e.subcategory.toLowerCase().includes(q))
    )
  })

  const toggle = useCallback(
    (asin: string) => {
      setSelected((prev) =>
        prev.includes(asin) ? prev.filter((a) => a !== asin) : [...prev.slice(-1), asin],
      )
    },
    [],
  )

  const compare = async () => {
    if (selected.length < 2) return
    setComparing(true)
    try {
      const [a, b] = await Promise.all(selected.map(fetchProduct))
      // Put longer-lived product on the left
      const [left, right] =
        (a.median_months ?? 0) >= (b.median_months ?? 0) ? [a, b] : [b, a]
      onSelectPair(left, right)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setComparing(false)
    }
  }

  if (loading) return <p className="text-[#555] text-sm">Loading product index …</p>
  if (error) return <p className="text-[#ef4444] text-sm">Error: {error}</p>
  if (!index.length) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-[#555]">No products exported yet.</p>
        <p className="text-[#444] text-xs">
          Run the pipeline:{' '}
          <code className="text-[#666]">python -m lemon.validate --export</code>
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        <input
          type="search"
          placeholder="Search products …"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 bg-[#111] border border-[#222] rounded-lg px-3 py-2 text-sm text-[#e0e0e0] placeholder-[#444] focus:outline-none focus:border-[#444]"
        />
        <button
          onClick={compare}
          disabled={selected.length < 2 || comparing}
          className="px-4 py-2 text-sm font-medium rounded-lg transition-colors bg-[#f5e642] text-black disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#ffe600]"
        >
          {comparing ? 'Loading …' : 'Compare'}
        </button>
      </div>

      {selected.length > 0 && (
        <p className="text-xs text-[#555]">
          {selected.length === 1
            ? 'Select one more product to compare'
            : 'Ready — click Compare'}
        </p>
      )}

      <div className="space-y-1.5 max-h-[60vh] overflow-y-auto pr-1">
        {filtered.map((e) => (
          <EntryRow
            key={e.parent_asin}
            entry={e}
            selected={selected.includes(e.parent_asin)}
            onToggle={() => toggle(e.parent_asin)}
            selectionFull={selected.length >= 2}
          />
        ))}
        {filtered.length === 0 && (
          <p className="text-[#555] text-sm text-center py-8">No results for "{query}"</p>
        )}
      </div>
    </div>
  )
}
