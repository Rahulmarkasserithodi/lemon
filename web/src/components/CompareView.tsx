import { useState } from 'react'
import type { ProductData } from '../types'
import SurvivalChart from './SurvivalChart'
import FailureModes from './FailureModes'
import SnippetDrawer from './SnippetDrawer'
import HonestyPanel from './HonestyPanel'
import { INK, RUST, TEAL, inkAlpha } from '../theme'

interface Props {
  left: ProductData   // longer-lived  (better → teal, right column)
  right: ProductData  // shorter-lived (worse  → rust, left column)
}

// ── formatting helpers ──────────────────────────────────────────────
function medianText(p: ProductData) {
  if (p.median_months == null) return 'n/a'
  return p.median_is_lower_bound
    ? `>${p.median_months.toFixed(0)} mo`
    : `${p.median_months.toFixed(0)} mo`
}

function priceText(p: ProductData) {
  return p.price != null ? `$${p.price.toFixed(0)}` : '—'
}

function ratingText(p: ProductData) {
  if (p.average_rating == null) return '—'
  const n = p.n_reviews ?? p.n_obs
  return `${p.average_rating.toFixed(1)} / ${n.toLocaleString()}`
}

function costPerMo(p: ProductData) {
  return p.cost_per_year != null ? `$${(p.cost_per_year / 12).toFixed(2)}` : '—'
}

function label(mode: string) {
  return mode.replace(/_/g, ' ')
}

// Amazon titles are long; keep section headers to the brand + first few words.
function shortTitle(p: ProductData) {
  const t = p.brand && p.title.startsWith(p.brand) ? p.title : `${p.brand} ${p.title}`.trim()
  const words = t.split(/\s+/).slice(0, 5).join(' ')
  return words.replace(/[,:–—-]+$/, '')
}

function topFailureText(p: ProductData) {
  const m = p.failure_modes[0]
  if (!m) return '—'
  const pct = p.n_events > 0 ? Math.round((m.count / p.n_events) * 100) : null
  const name = label(m.mode)
  const short = name.charAt(0).toUpperCase() + name.slice(1)
  return pct != null ? `${short}, ${pct}%` : short
}

function tagText(p: ProductData, other: ProductData, worse: boolean) {
  const parts: string[] = []
  if (p.price != null && other.price != null && p.price !== other.price) {
    parts.push(p.price < other.price ? 'CHEAPER' : 'PRICIER')
  }
  parts.push(worse ? 'LESS DURABLE' : 'MORE DURABLE')
  return parts.join(' · ')
}

// ── product column ──────────────────────────────────────────────────
function StatRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
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

function ProductColumn({
  product,
  other,
  color,
  worse,
  align,
}: {
  product: ProductData
  other: ProductData
  color: string
  worse: boolean
  align: 'left' | 'right'
}) {
  return (
    <div className="flex flex-col pt-1.5">
      {/* photo placeholder */}
      <div
        className={`w-[72px] h-[72px] flex items-center justify-center mb-[18px] ${align === 'right' ? 'self-end' : ''}`}
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

      <div className="font-serif font-semibold text-[17px] leading-snug mb-0.5">{product.title}</div>
      <div className="font-mono text-[12px] mb-4" style={{ color: inkAlpha(0.5) }}>
        {tagText(product, other, worse)}
      </div>

      <StatRow label="Price" value={priceText(product)} />
      <StatRow label="Rating" value={ratingText(product)} />
      <StatRow label="Median life" value={medianText(product)} />
      <StatRow label="Top failure" value={topFailureText(product)} last />

      {/* cost-to-own box */}
      <div className="mt-4" style={{ border: `1px solid ${INK}`, padding: '14px 16px' }}>
        <div
          className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] mb-2"
          style={{ color: inkAlpha(0.45) }}
        >
          Cost to own
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-[44px] leading-none font-bold" style={{ color }}>
            {costPerMo(product)}
          </span>
          <span className="text-[12px]" style={{ color: inkAlpha(0.5) }}>/mo</span>
        </div>
        <div
          className="font-mono text-[10.5px] leading-snug mt-2.5 pt-2"
          style={{ borderTop: `1px solid ${inkAlpha(0.18)}`, color: inkAlpha(0.45) }}
        >
          {product.cost_per_year != null ? `$${product.cost_per_year.toFixed(2)}/YR · ` : ''}
          N={product.n_obs.toLocaleString()} · 95% CI
        </div>
      </div>
    </div>
  )
}

// ── legend table under the chart ────────────────────────────────────
function LegendRow({ product, color }: { product: ProductData; color: string }) {
  return (
    <div className="flex justify-between items-center text-[12.5px]">
      <span className="flex items-center gap-2">
        <span className="inline-block w-3 h-0.5" style={{ background: color }} />
        <span className="truncate max-w-[280px]">{product.title}</span>
      </span>
      <span className="flex gap-7 font-mono shrink-0">
        <span>{medianText(product)}</span>
        <span style={{ color }}>{costPerMo(product)}</span>
      </span>
    </div>
  )
}

export default function CompareView({ left, right }: Props) {
  const [activeMode, setActiveMode] = useState<string | null>(null)

  const better = left    // longer-lived → teal, right column
  const worse = right    // shorter-lived → rust, left column

  const failureMax = Math.max(
    1,
    ...worse.failure_modes.map((m) => (worse.n_events > 0 ? m.count / worse.n_events : 0)),
    ...better.failure_modes.map((m) => (better.n_events > 0 ? m.count / better.n_events : 0)),
  )

  return (
    <div className="space-y-0">
      {/* category strip */}
      <div
        className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] mb-5"
        style={{ color: inkAlpha(0.42) }}
      >
        Comparison — cost per year of life
      </div>

      {/* hero: worse | divider | chart | divider | better */}
      <div
        className="grid gap-8 lg:gap-10 items-stretch grid-cols-1 lg:[grid-template-columns:264px_1px_minmax(0,1fr)_1px_264px]"
      >
        <ProductColumn product={worse} other={better} color={RUST} worse align="left" />
        <div className="hidden lg:block" style={{ background: inkAlpha(0.18) }} />

        {/* center: chart + legend */}
        <div className="flex flex-col items-center gap-3.5 pt-1.5 order-first lg:order-none">
          <SurvivalChart left={better} right={worse} />
          <div
            className="w-full max-w-[540px] pt-2.5 flex flex-col gap-1.5"
            style={{ borderTop: `1px solid ${inkAlpha(0.2)}` }}
          >
            <div
              className="flex justify-between font-mono text-[9.5px] font-semibold uppercase tracking-[0.06em]"
              style={{ color: inkAlpha(0.4) }}
            >
              <span>Product</span>
              <span className="flex gap-7"><span>Median</span><span>Cost / mo</span></span>
            </div>
            <LegendRow product={worse} color={RUST} />
            <LegendRow product={better} color={TEAL} />
          </div>
        </div>

        <div className="hidden lg:block" style={{ background: inkAlpha(0.18) }} />
        <ProductColumn product={better} other={worse} color={TEAL} worse={false} align="right" />
      </div>

      {/* failure modes */}
      <div
        className="grid gap-8 lg:gap-10 grid-cols-1 sm:grid-cols-2 mt-8 pt-8"
        style={{ borderTop: `1.5px solid ${INK}` }}
      >
        <div className="flex flex-col gap-2.5">
          <div
            className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] mb-1"
            style={{ color: inkAlpha(0.42) }}
          >
            Failure modes — {shortTitle(worse)}
          </div>
          <FailureModes modes={worse.failure_modes} nEvents={worse.n_events} scaleMax={failureMax} color={RUST} onSelect={setActiveMode} />
        </div>
        <div className="flex flex-col gap-2.5">
          <div
            className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] mb-1"
            style={{ color: inkAlpha(0.42) }}
          >
            Failure modes — {shortTitle(better)}
          </div>
          <FailureModes modes={better.failure_modes} nEvents={better.n_events} scaleMax={failureMax} color={TEAL} onSelect={setActiveMode} />
        </div>
      </div>

      {/* snippet drawer */}
      {activeMode && (
        <SnippetDrawer
          mode={activeMode}
          snippetsLeft={better.snippets[activeMode] ?? []}
          snippetsRight={worse.snippets[activeMode] ?? []}
          onClose={() => setActiveMode(null)}
        />
      )}

      {/* honesty panel */}
      <div className="mt-8">
        <HonestyPanel left={better} right={worse} />
      </div>
    </div>
  )
}
