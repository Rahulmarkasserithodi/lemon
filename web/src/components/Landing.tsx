import { useState, useEffect } from 'react'
import type { ProductData, HeroPair, SelItem } from '../types'
import { fetchHeroPairs, fetchIndex, loadProduct } from '../api'
import CompareView from './CompareView'
import ProductDetail from './ProductDetail'
import ProductSearch from './ProductSearch'
import LedgerBackdrop from './LedgerBackdrop'
import { INK, RUST, TEAL, inkAlpha } from '../theme'

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
  worse: ProductData
  better: ProductData
  maxMonth: number
}

export default function Landing() {
  const [cards, setCards] = useState<Card[]>([])
  const [single, setSingle] = useState<ProductData | null>(null)
  const [pair, setPair] = useState<[ProductData, ProductData] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

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

  const load = async (item: SelItem) => {
    const p = item.preloaded ?? (await loadProduct(item.asin))
    if (!p.curve.length) {
      throw new Error(`Not enough dated failure/longevity mentions for "${p.title}" yet.`)
    }
    return p
  }

  // Search / paste a single product → its detail view.
  const openSingle = async (item: SelItem) => {
    setBusy(true)
    setError('')
    try {
      setSingle(await load(item))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  // From the detail view: add a second product → the two-product comparison.
  const compareWith = async (item: SelItem) => {
    if (!single) return
    setBusy(true)
    setError('')
    try {
      const second = await load(item)
      setPair(orderByMedian(single, second))
      setSingle(null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const openCompare = (a: ProductData, b: ProductData) => setPair(orderByMedian(a, b))

  const reset = () => {
    setSingle(null)
    setPair(null)
    setError('')
  }

  const backButton = (labelText: string) => (
    <button
      onClick={reset}
      className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em] mb-6 transition-colors flex items-center gap-1.5"
      style={{ color: inkAlpha(0.55) }}
    >
      <span>←</span> {labelText}
    </button>
  )

  // ── two-product comparison ──────────────────────────────────────────
  if (pair) {
    return (
      <div>
        {backButton('New comparison')}
        <CompareView left={pair[0]} right={pair[1]} />
      </div>
    )
  }

  // ── single-product detail ───────────────────────────────────────────
  if (single) {
    return (
      <div>
        {backButton('New search')}
        <ProductDetail product={single} onCompareWith={compareWith} busy={busy} error={error} />
      </div>
    )
  }

  // ── initial extraction of a searched product ────────────────────────
  if (busy) {
    return (
      <div className="max-w-[560px] mx-auto py-28 text-center">
        <div className="font-mono text-[13px]" style={{ color: inkAlpha(0.6) }}>
          Reading reviews with the model …
        </div>
        <div className="mt-2 text-[12px]" style={{ color: inkAlpha(0.45) }}>
          First run for a product can take a few seconds.
        </div>
      </div>
    )
  }

  // ── landing ─────────────────────────────────────────────────────────
  return (
    <>
      <LedgerBackdrop />
      <div className="relative z-[1] max-w-[720px] mx-auto pt-[clamp(24px,6vw,64px)] pb-24">
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
            Tenure converts purchase reviews into a survival curve for each product — so
            cost-per-year of ownership, not sticker price, tells you what's worth buying.
          </p>
        </div>

        {/* search — one product opens its durability report */}
        <div className="max-w-[560px] mx-auto mt-10">
          <ProductSearch onPick={openSingle} selectedAsins={[]} />
          {error && <p className="mt-2 text-[12px] text-center" style={{ color: RUST }}>{error}</p>}
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
    </>
  )
}
