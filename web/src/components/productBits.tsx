// Shared formatting helpers + small presentational bits used by both the
// single-product detail view and the two-product comparison view.
import { useState } from 'react'
import type { ProductData } from '../types'
import { INK, inkAlpha } from '../theme'

export function medianText(p: ProductData) {
  if (p.median_months == null) return 'n/a'
  return p.median_is_lower_bound
    ? `>${p.median_months.toFixed(0)} mo`
    : `${p.median_months.toFixed(0)} mo`
}

export function priceText(p: ProductData) {
  return p.price != null ? `$${p.price.toFixed(0)}` : '—'
}

export function ratingText(p: ProductData) {
  if (p.average_rating == null) return '—'
  const n = p.n_reviews ?? p.n_obs
  return `${p.average_rating.toFixed(1)} / ${n.toLocaleString()}`
}

export function costPerMo(p: ProductData) {
  return p.cost_per_year != null ? `$${(p.cost_per_year / 12).toFixed(2)}` : '—'
}

export function label(mode: string) {
  return mode.replace(/_/g, ' ')
}

// Amazon titles are long; keep section headers to the brand + first few words.
export function shortTitle(p: ProductData) {
  const t = p.brand && p.title.startsWith(p.brand) ? p.title : `${p.brand} ${p.title}`.trim()
  const words = t.split(/\s+/).slice(0, 5).join(' ')
  return words.replace(/[,:–—-]+$/, '')
}

export function topFailureText(p: ProductData) {
  const m = p.failure_modes[0]
  if (!m) return '—'
  const pct = p.n_events > 0 ? Math.round((m.count / p.n_events) * 100) : null
  const name = label(m.mode)
  const short = name.charAt(0).toUpperCase() + name.slice(1)
  return pct != null ? `${short}, ${pct}%` : short
}

export function tagText(p: ProductData, other: ProductData, worse: boolean) {
  const parts: string[] = []
  if (p.price != null && other.price != null && p.price !== other.price) {
    parts.push(p.price < other.price ? 'CHEAPER' : 'PRICIER')
  }
  parts.push(worse ? 'LESS DURABLE' : 'MORE DURABLE')
  return parts.join(' · ')
}

// ── product photo (real image, hatched placeholder as fallback) ─────
export function ProductPhoto({
  product,
  color,
  align = 'left',
}: {
  product: ProductData
  color: string
  align?: 'left' | 'right'
}) {
  const [errored, setErrored] = useState(false)
  const cls = `w-[72px] h-[72px] flex items-center justify-center mb-[18px] ${align === 'right' ? 'self-end' : ''}`

  if (product.image && !errored) {
    return (
      <img
        src={product.image}
        alt={product.title}
        loading="lazy"
        onError={() => setErrored(true)}
        className={`${cls} object-contain bg-white`}
        style={{ border: `1px solid ${color}4d` }}
      />
    )
  }

  return (
    <div
      className={cls}
      style={{
        border: `1px solid ${color}4d`,
        backgroundColor: `${color}0d`,
        backgroundImage: `repeating-linear-gradient(135deg, ${color}29 0 2px, transparent 2px 9px)`,
      }}
    >
      <span className="font-mono text-[8.5px] leading-tight tracking-wide" style={{ color: `${color}a6` }}>
        PHOTO
      </span>
    </div>
  )
}

// ── dashed stat row ─────────────────────────────────────────────────
export function StatRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      className="flex justify-between items-baseline py-[7px]"
      style={last ? undefined : { borderBottom: `1px dashed ${inkAlpha(0.25)}` }}
    >
      <span className="text-[12px]" style={{ color: inkAlpha(0.55) }}>{label}</span>
      <span className="font-mono text-[13px] font-semibold text-right ml-3">{value}</span>
    </div>
  )
}

// ── cost-to-own box ─────────────────────────────────────────────────
export function CostToOwn({
  product,
  color = INK,
  align = 'left',
}: {
  product: ProductData
  color?: string
  align?: 'left' | 'right'
}) {
  return (
    <div style={{ border: `1px solid ${INK}`, padding: '14px 16px' }}>
      <div
        className={`font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] mb-2 ${align === 'right' ? 'text-right' : ''}`}
        style={{ color: inkAlpha(0.45) }}
      >
        Cost to own
      </div>
      <div className={`flex items-baseline gap-1.5 ${align === 'right' ? 'justify-end' : ''}`}>
        <span className="font-mono text-[44px] leading-none font-bold" style={{ color }}>
          {costPerMo(product)}
        </span>
        <span className="text-[12px]" style={{ color: inkAlpha(0.5) }}>/mo</span>
      </div>
      <div
        className={`font-mono text-[10.5px] leading-snug mt-2.5 pt-2 ${align === 'right' ? 'text-right' : ''}`}
        style={{ borderTop: `1px solid ${inkAlpha(0.18)}`, color: inkAlpha(0.45) }}
      >
        {product.cost_per_year != null ? `$${product.cost_per_year.toFixed(2)}/YR · ` : ''}
        N={product.n_obs.toLocaleString()} · 95% CI
      </div>
    </div>
  )
}
