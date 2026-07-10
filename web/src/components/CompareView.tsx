import { useState } from 'react'
import type { ProductData } from '../types'
import SurvivalChart from './SurvivalChart'
import FailureModes from './FailureModes'
import SnippetDrawer from './SnippetDrawer'
import HonestyPanel from './HonestyPanel'

interface Props {
  left: ProductData   // longer-lived
  right: ProductData  // shorter-lived
}

function Stars({ rating }: { rating: number | null }) {
  if (rating == null) return <span className="text-[#555]">n/a</span>
  const full = Math.floor(rating)
  const half = rating - full >= 0.5
  return (
    <span className="text-[#f5c518] tracking-wide text-sm">
      {'★'.repeat(full)}
      {half ? '½' : ''}
      {'☆'.repeat(5 - full - (half ? 1 : 0))}
      <span className="text-[#666] ml-1 text-xs">{rating.toFixed(1)}</span>
    </span>
  )
}

function MoneyMetric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`text-center ${highlight ? 'text-[#ef4444]' : 'text-[#22c55e]'}`}>
      <div className="text-3xl font-bold tracking-tight">{value}</div>
      <div className="text-xs text-[#666] mt-0.5 uppercase tracking-widest">{label}</div>
    </div>
  )
}

function ProductCard({
  product,
  color,
  side,
}: {
  product: ProductData
  color: string
  side: 'left' | 'right'
}) {
  const medianDisplay =
    product.median_months == null
      ? 'n/a'
      : product.median_is_lower_bound
      ? `>${product.median_months}mo`
      : `${product.median_months.toFixed(0)}mo`

  const cpyDisplay =
    product.cost_per_year != null
      ? `$${product.cost_per_year.toFixed(0)}/yr`
      : 'n/a'

  const isWorse = side === 'right'

  return (
    <div
      className="flex-1 min-w-0 rounded-xl p-5 border"
      style={{ borderColor: color + '44', background: color + '08' }}
    >
      <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color }}>
        {side === 'left' ? 'Longer-lived' : 'Shorter-lived'}
      </div>
      <h3 className="text-sm font-semibold leading-snug text-[#e0e0e0] mb-3">
        {product.title}
      </h3>

      <div className="flex justify-between text-sm mb-4">
        <span className="text-[#aaa]">
          {product.price != null ? `$${product.price.toFixed(0)}` : 'price n/a'}
        </span>
        <Stars rating={product.average_rating} />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-[#0d0d0d] rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-[#f0f0f0]">{medianDisplay}</div>
          <div className="text-[10px] text-[#555] uppercase tracking-widest mt-0.5">median lifespan</div>
        </div>
        <div className="bg-[#0d0d0d] rounded-lg p-3 text-center">
          <div className={`text-2xl font-bold ${isWorse ? 'text-[#ef4444]' : 'text-[#22c55e]'}`}>
            {cpyDisplay}
          </div>
          <div className="text-[10px] text-[#555] uppercase tracking-widest mt-0.5">cost / year</div>
        </div>
      </div>

      <div className="text-[10px] text-[#555]">
        n={product.n_obs} · {product.n_events} failure events
        {product.median_is_lower_bound && (
          <span className="ml-1 text-[#f5c518]">(lifespan lower-bound)</span>
        )}
      </div>
    </div>
  )
}

export default function CompareView({ left, right }: Props) {
  const [activeMode, setActiveMode] = useState<string | null>(null)

  return (
    <div className="space-y-8">
      {/* Hero tagline */}
      <div className="text-center">
        <p className="text-[#555] text-sm uppercase tracking-widest mb-2">same category · similar price · similar stars</p>
        <h2 className="text-4xl font-bold tracking-tight text-white">
          Different fate.
        </h2>
      </div>

      {/* KM chart */}
      <SurvivalChart left={left} right={right} />

      {/* Product cards */}
      <div className="flex gap-4 flex-col sm:flex-row">
        <ProductCard product={left} color="#60a5fa" side="left" />
        <div className="flex items-center justify-center text-[#444] font-bold text-xl shrink-0 py-2">
          vs
        </div>
        <ProductCard product={right} color="#fb923c" side="right" />
      </div>

      {/* Cost-per-year callout */}
      {left.cost_per_year != null && right.cost_per_year != null && (
        <div className="bg-[#111] border border-[#222] rounded-xl p-6 text-center">
          <p className="text-[#666] text-xs uppercase tracking-widest mb-4">
            Cost per year of service life
          </p>
          <div className="flex items-center justify-center gap-8">
            <MoneyMetric label={left.brand || 'Product A'} value={`$${left.cost_per_year.toFixed(0)}/yr`} />
            <div className="text-[#333] text-2xl font-light">vs</div>
            <MoneyMetric
              label={right.brand || 'Product B'}
              value={`$${right.cost_per_year.toFixed(0)}/yr`}
              highlight
            />
          </div>
          {right.cost_per_year > left.cost_per_year && (
            <p className="text-[#555] text-xs mt-4">
              The cheaper product costs{' '}
              <span className="text-[#fb923c] font-semibold">
                {((right.cost_per_year / left.cost_per_year - 1) * 100).toFixed(0)}% more per year
              </span>{' '}
              to own.
            </p>
          )}
        </div>
      )}

      {/* Failure modes */}
      <div>
        <h3 className="text-xs uppercase tracking-widest text-[#555] mb-3">Failure modes</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-xs text-[#60a5fa] mb-2">{left.title.split(' ').slice(0, 4).join(' ')}</div>
            <FailureModes modes={left.failure_modes} color="#60a5fa" onSelect={setActiveMode} />
          </div>
          <div>
            <div className="text-xs text-[#fb923c] mb-2">{right.title.split(' ').slice(0, 4).join(' ')}</div>
            <FailureModes modes={right.failure_modes} color="#fb923c" onSelect={setActiveMode} />
          </div>
        </div>
      </div>

      {/* Snippet drawer */}
      {activeMode && (
        <SnippetDrawer
          mode={activeMode}
          snippetsLeft={left.snippets[activeMode] ?? []}
          snippetsRight={right.snippets[activeMode] ?? []}
          onClose={() => setActiveMode(null)}
        />
      )}

      {/* Honesty panel */}
      <HonestyPanel left={left} right={right} />
    </div>
  )
}
