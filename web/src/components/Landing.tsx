import { useState, useEffect } from 'react'
import type { ProductData, IndexEntry, HeroPair, SelItem } from '../types'
import { fetchIndex, fetchHeroPairs, loadProduct } from '../api'
import CompareView from './CompareView'
import ProductSearch from './ProductSearch'
import { INK, ON_INK, RUST, TEAL, inkAlpha } from '../theme'

const SLOT_COLOR = [RUST, TEAL]

// CompareView expects left = longer-lived (better), right = shorter-lived (worse).
function orderByMedian(a: ProductData, b: ProductData): [ProductData, ProductData] {
  return (a.median_months ?? 0) >= (b.median_months ?? 0) ? [a, b] : [b, a]
}

function medianText(m: number | null, lower: boolean) {
  if (m == null) return 'n/a'
  return lower ? `>${m.toFixed(0)} mo` : `${m.toFixed(0)} mo`
}

export default function Landing() {
  const [index, setIndex] = useState<IndexEntry[]>([])
  const [heroPairs, setHeroPairs] = useState<HeroPair[]>([])
  const [heroIndex, setHeroIndex] = useState(0)
  const [heroPair, setHeroPair] = useState<[ProductData, ProductData] | null>(null)

  const [selected, setSelected] = useState<SelItem[]>([])
  const [custom, setCustom] = useState<[ProductData, ProductData] | null>(null)
  const [comparing, setComparing] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  // Load the committed corpus + curated pairs once (static, offline).
  useEffect(() => {
    fetchIndex().then(setIndex).catch((e) => setError(e.message))
    fetchHeroPairs().then(setHeroPairs).catch(() => {})
  }, [])

  // Load the featured pair's products whenever the featured index changes.
  useEffect(() => {
    if (!heroPairs.length) return
    let active = true
    const hp = heroPairs[heroIndex]
    setHeroPair(null)
    Promise.all([loadProduct(hp.left), loadProduct(hp.right)])
      .then(([l, r]) => active && setHeroPair(orderByMedian(l, r)))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [heroPairs, heroIndex])

  const pick = (item: SelItem) =>
    setSelected((prev) => {
      if (prev.some((p) => p.asin === item.asin)) return prev
      return [...prev.slice(-1), item] // keep at most the last two
    })

  const toggle = (e: IndexEntry) =>
    setSelected((prev) =>
      prev.some((p) => p.asin === e.parent_asin)
        ? prev.filter((p) => p.asin !== e.parent_asin)
        : [...prev.slice(-1), { asin: e.parent_asin, title: e.title, image: e.image }],
    )

  const remove = (asin: string) => setSelected((prev) => prev.filter((p) => p.asin !== asin))

  const compare = async () => {
    if (selected.length < 2) return
    setComparing(true)
    setError('')
    setStatus('Reading reviews with the model … (first run for a product can take a few seconds)')
    try {
      const [a, b] = await Promise.all(
        selected.map((s) => s.preloaded ?? loadProduct(s.asin)),
      )
      if (!a.curve.length || !b.curve.length) {
        const thin = !a.curve.length ? a.title : b.title
        throw new Error(`Not enough dated failure/longevity mentions for "${thin}" yet.`)
      }
      setCustom(orderByMedian(a, b))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setComparing(false)
      setStatus('')
    }
  }

  const selectedAsins = selected.map((s) => s.asin)

  return (
    <div>
      {/* ── selection bar: chips + search/paste + compare ─────────────── */}
      <div className="mb-9 space-y-3">
        {selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {selected.map((s, i) => (
              <span
                key={s.asin}
                className="flex items-center gap-2 px-2.5 py-1.5 text-[12px] max-w-[340px]"
                style={{ border: `1px solid ${SLOT_COLOR[i]}`, color: inkAlpha(0.85) }}
              >
                <span className="font-mono text-[10px]" style={{ color: SLOT_COLOR[i] }}>
                  {i === 0 ? 'A' : 'B'}
                </span>
                <span className="truncate">{s.title}</span>
                <button
                  onClick={() => remove(s.asin)}
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

        <div className="flex gap-2 items-stretch">
          <div className="flex-1">
            <ProductSearch onPick={pick} selectedAsins={selectedAsins} />
          </div>
          <button
            onClick={compare}
            disabled={selected.length < 2 || comparing}
            className="px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors disabled:opacity-30 disabled:cursor-not-allowed self-start py-2"
            style={{ background: INK, color: ON_INK }}
          >
            {comparing ? 'Extracting …' : 'Compare'}
          </button>
        </div>

        {error && <p className="text-[12px]" style={{ color: RUST }}>{error}</p>}
        {status && <p className="text-[12px]" style={{ color: TEAL }}>{status}</p>}
        {!error && !status && selected.length === 1 && (
          <p className="font-mono text-[11px]" style={{ color: inkAlpha(0.5) }}>
            Pick one more product — from the list below or search — then Compare
          </p>
        )}
      </div>

      {/* ── comparison area ───────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5">
        <span
          className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.1em] px-2 py-1"
          style={{ background: INK, color: ON_INK }}
        >
          {custom ? 'Live Comparison' : 'Featured'}
        </span>
        {custom ? (
          <button
            onClick={() => setCustom(null)}
            className="font-mono text-[10.5px] uppercase tracking-[0.08em] transition-colors"
            style={{ color: inkAlpha(0.5) }}
          >
            ← Back to featured
          </button>
        ) : (
          heroPairs.length > 1 && (
            <div className="flex gap-1.5">
              {heroPairs.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setHeroIndex(i)}
                  className="w-2 h-2 rounded-full transition-colors"
                  style={{ background: i === heroIndex ? INK : inkAlpha(0.25) }}
                  aria-label={`Featured pair ${i + 1}`}
                />
              ))}
            </div>
          )
        )}
      </div>

      {custom ? (
        <CompareView left={custom[0]} right={custom[1]} />
      ) : heroPair ? (
        <>
          {heroPairs[heroIndex]?.note && (
            <p className="text-[12.5px] mb-6 max-w-3xl" style={{ color: inkAlpha(0.5) }}>
              {heroPairs[heroIndex].note}
            </p>
          )}
          <CompareView left={heroPair[0]} right={heroPair[1]} />
        </>
      ) : (
        <p className="font-mono text-[12px] py-10" style={{ color: inkAlpha(0.45) }}>
          Loading comparison …
        </p>
      )}

      {/* ── ready-to-compare list ─────────────────────────────────────── */}
      <div className="mt-12 pt-8" style={{ borderTop: `1.5px solid ${INK}` }}>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-serif text-[20px] font-semibold text-[#e8e6df]">Ready to compare</h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: inkAlpha(0.42) }}>
            {index.length} products · pick two
          </span>
        </div>

        <div className="flex flex-col">
          {index.map((e) => {
            const sel = selected.findIndex((s) => s.asin === e.parent_asin)
            const isSel = sel >= 0
            return (
              <button
                key={e.parent_asin}
                onClick={() => toggle(e)}
                className="flex items-center gap-3 text-left px-2.5 py-2.5 transition-colors"
                style={{
                  borderBottom: `1px solid ${inkAlpha(0.1)}`,
                  background: isSel ? inkAlpha(0.06) : 'transparent',
                  boxShadow: isSel ? `inset 2px 0 0 ${SLOT_COLOR[sel]}` : 'none',
                }}
                onMouseEnter={(ev) => !isSel && (ev.currentTarget.style.background = inkAlpha(0.04))}
                onMouseLeave={(ev) => !isSel && (ev.currentTarget.style.background = 'transparent')}
              >
                {isSel ? (
                  <span
                    className="w-9 h-9 shrink-0 flex items-center justify-center font-mono text-[12px] font-semibold"
                    style={{ border: `1px solid ${SLOT_COLOR[sel]}`, color: SLOT_COLOR[sel] }}
                  >
                    {sel === 0 ? 'A' : 'B'}
                  </span>
                ) : e.image ? (
                  <img
                    src={e.image}
                    alt=""
                    loading="lazy"
                    onError={(ev) => (ev.currentTarget.style.visibility = 'hidden')}
                    className="w-9 h-9 shrink-0 object-contain bg-white"
                    style={{ border: `1px solid ${inkAlpha(0.15)}` }}
                  />
                ) : (
                  <span className="w-9 h-9 shrink-0" style={{ border: `1px solid ${inkAlpha(0.12)}` }} />
                )}

                <span className="flex-1 min-w-0">
                  <span className="block truncate text-[13px]">{e.title}</span>
                  <span className="block font-mono text-[10.5px] mt-0.5" style={{ color: inkAlpha(0.45) }}>
                    {e.brand}{e.brand && e.price != null ? ' · ' : ''}
                    {e.price != null ? `$${e.price.toFixed(0)}` : ''}
                  </span>
                </span>

                <span className="hidden sm:flex flex-col items-end w-[92px] shrink-0">
                  <span className="font-mono text-[9px] uppercase tracking-[0.06em]" style={{ color: inkAlpha(0.38) }}>Median life</span>
                  <span className="font-mono text-[13px]">{medianText(e.median_months, e.median_is_lower_bound)}</span>
                </span>
                <span className="flex flex-col items-end w-[92px] shrink-0">
                  <span className="font-mono text-[9px] uppercase tracking-[0.06em]" style={{ color: inkAlpha(0.38) }}>Cost / yr</span>
                  <span className="font-mono text-[13px]">
                    {e.cost_per_year != null ? `$${e.cost_per_year.toFixed(0)}` : '—'}
                  </span>
                </span>
              </button>
            )
          })}
          {index.length === 0 && (
            <p className="font-mono text-[12px] py-6" style={{ color: inkAlpha(0.45) }}>
              Loading corpus …
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
