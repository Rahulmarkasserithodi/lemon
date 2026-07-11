import { useState, useEffect } from 'react'
import type { ProductData, HeroPair, SelItem } from '../types'
import { fetchHeroPairs, fetchIndex, loadProduct } from '../api'
import CompareView from './CompareView'
import ProductSearch from './ProductSearch'
import { INK, ON_INK, RUST, TEAL, inkAlpha } from '../theme'

const SLOT_COLOR = [RUST, TEAL]

// CompareView expects left = longer-lived (better), right = shorter-lived (worse).
function orderByMedian(a: ProductData, b: ProductData): [ProductData, ProductData] {
  return (a.median_months ?? 0) >= (b.median_months ?? 0) ? [a, b] : [b, a]
}

function cardName(p: ProductData) {
  return p.title.split(/\s+/).slice(0, 5).join(' ')
}

function costMo(p: ProductData) {
  return p.cost_per_year != null ? (p.cost_per_year / 12).toFixed(2) : '—'
}

function medianText(m: number | null) {
  return m == null ? 'n/a' : `${m.toFixed(0)}mo`
}

const rnd = (n: number) => Math.round(n * 10) / 10

// Mini survival sparkline path (month → x, survival → y).
function sparkPath(curve: ProductData['curve'], maxMonth: number, w = 150, h = 56, pad = 5) {
  const plotW = w - pad * 2
  const plotH = h - pad * 2
  const max = maxMonth || 1
  return curve
    .map((pt, i) => {
      const x = pad + (pt.t / max) * plotW
      const y = pad + (1 - pt.s) * plotH
      return (i === 0 ? 'M' : 'L') + rnd(x) + ',' + rnd(y)
    })
    .join(' ')
}

interface Card {
  key: string
  category: string
  worse: ProductData   // shorter-lived → rust
  better: ProductData  // longer-lived → teal
  maxMonth: number
}

export default function Landing() {
  const [cards, setCards] = useState<Card[]>([])
  const [selected, setSelected] = useState<SelItem[]>([])
  const [custom, setCustom] = useState<[ProductData, ProductData] | null>(null)
  const [comparing, setComparing] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  // Build featured comparison cards from the curated pairs (static, offline).
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const [pairs, index] = await Promise.all([fetchHeroPairs(), fetchIndex().catch(() => [])])
        const subcat: Record<string, string> = {}
        for (const e of index) subcat[e.parent_asin] = e.subcategory || ''
        const built = await Promise.all(
          pairs.map(async (hp: HeroPair) => {
            const [l, r] = await Promise.all([loadProduct(hp.left), loadProduct(hp.right)])
            const [better, worse] = orderByMedian(l, r)
            return {
              key: `${hp.left}-${hp.right}`,
              category: subcat[hp.left] || subcat[hp.right] || 'Comparison',
              worse,
              better,
              maxMonth: Math.max(worse.curve.at(-1)?.t ?? 0, better.curve.at(-1)?.t ?? 0),
            } as Card
          }),
        )
        if (active) setCards(built)
      } catch {
        /* featured cards are optional */
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const pick = (item: SelItem) =>
    setSelected((prev) => {
      if (prev.some((p) => p.asin === item.asin)) return prev
      return [...prev.slice(-1), item] // keep at most the last two
    })

  const remove = (asin: string) => setSelected((prev) => prev.filter((p) => p.asin !== asin))

  const openCompare = (a: ProductData, b: ProductData) => setCustom(orderByMedian(a, b))

  const compare = async () => {
    if (selected.length < 2) return
    setComparing(true)
    setError('')
    setStatus('Reading reviews with the model … (first run for a product can take a few seconds)')
    try {
      const [a, b] = await Promise.all(selected.map((s) => s.preloaded ?? loadProduct(s.asin)))
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

  const reset = () => {
    setCustom(null)
    setSelected([])
    setError('')
  }

  // ── comparison view ─────────────────────────────────────────────────
  if (custom) {
    return (
      <div>
        <button
          onClick={reset}
          className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em] mb-6 transition-colors flex items-center gap-1.5"
          style={{ color: inkAlpha(0.55) }}
        >
          <span>←</span> New comparison
        </button>
        <CompareView left={custom[0]} right={custom[1]} />
      </div>
    )
  }

  // ── landing ─────────────────────────────────────────────────────────
  return (
    <div className="max-w-[720px] mx-auto pt-[clamp(24px,6vw,64px)] pb-24">
      {/* hero */}
      <div className="text-center">
        <div
          className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] mb-[18px]"
          style={{ color: inkAlpha(0.42) }}
        >
          Modeled from verified purchase reviews
        </div>
        <h1 className="font-serif font-semibold leading-[1.15] tracking-[-0.01em] text-[clamp(28px,5.2vw,44px)] text-[#1c1f21]">
          How long does a product<br />actually last?
        </h1>
        <p className="mx-auto mt-5 max-w-[480px] text-[15px] leading-[1.6]" style={{ color: inkAlpha(0.6) }}>
          Lemon converts purchase reviews into a survival curve for each product — so
          cost-per-year of ownership, not sticker price, tells you what's worth buying.
        </p>
      </div>

      {/* search */}
      <div className="max-w-[560px] mx-auto mt-10">
        <ProductSearch onPick={pick} selectedAsins={selected.map((s) => s.asin)} />

        {selected.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 justify-center">
            {selected.map((s, i) => (
              <span
                key={s.asin}
                className="flex items-center gap-2 px-2.5 py-1.5 text-[12px] max-w-[300px] bg-white"
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
            <button
              onClick={compare}
              disabled={selected.length < 2 || comparing}
              className="px-4 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ background: INK, color: ON_INK }}
            >
              {comparing ? 'Extracting …' : 'Compare'}
            </button>
          </div>
        )}
        {error && <p className="mt-2 text-[12px] text-center" style={{ color: RUST }}>{error}</p>}
        {status && <p className="mt-2 text-[12px] text-center" style={{ color: TEAL }}>{status}</p>}
        {!error && !status && selected.length === 1 && (
          <p className="mt-2 font-mono text-[11px] text-center" style={{ color: inkAlpha(0.5) }}>
            Search for one more product, then Compare
          </p>
        )}
      </div>

      {/* featured comparisons */}
      {cards.length > 0 && (
        <div className="mt-16">
          <div
            className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] mb-4 text-center"
            style={{ color: inkAlpha(0.42) }}
          >
            Featured comparisons
          </div>
          <div className="flex flex-col gap-3.5">
            {cards.map((c) => (
              <button
                key={c.key}
                onClick={() => openCompare(c.better, c.worse)}
                className="flex flex-wrap items-center gap-5 text-left px-6 py-[22px] bg-white transition-colors"
                style={{ border: `1px solid ${inkAlpha(0.28)}` }}
                onMouseEnter={(ev) => (ev.currentTarget.style.borderColor = INK)}
                onMouseLeave={(ev) => (ev.currentTarget.style.borderColor = inkAlpha(0.28))}
              >
                <div className="flex-1 min-w-[220px]">
                  <div
                    className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] mb-2.5"
                    style={{ color: inkAlpha(0.4) }}
                  >
                    {c.category}
                  </div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="flex items-center gap-[7px]">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: RUST }} />
                      <span className="font-serif font-semibold text-[15.5px]">{cardName(c.worse)}</span>
                    </span>
                    <span className="font-mono text-[11px]" style={{ color: inkAlpha(0.35) }}>vs</span>
                    <span className="flex items-center gap-[7px]">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: TEAL }} />
                      <span className="font-serif font-semibold text-[15.5px]">{cardName(c.better)}</span>
                    </span>
                  </div>
                  <div className="mt-2 font-mono text-[12px]" style={{ color: inkAlpha(0.5) }}>
                    {medianText(c.worse.median_months)} · ${costMo(c.worse)}/mo&nbsp;&nbsp;vs&nbsp;&nbsp;
                    {medianText(c.better.median_months)} · ${costMo(c.better)}/mo
                  </div>
                </div>
                <svg width="150" height="56" viewBox="0 0 150 56" className="shrink-0 block">
                  <path d={sparkPath(c.worse.curve, c.maxMonth)} fill="none" stroke={RUST} strokeWidth="2" />
                  <path d={sparkPath(c.better.curve, c.maxMonth)} fill="none" stroke={TEAL} strokeWidth="2" />
                </svg>
                <div className="font-mono text-[10px] font-semibold tracking-[0.06em] shrink-0" style={{ color: INK }}>
                  VIEW →
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
