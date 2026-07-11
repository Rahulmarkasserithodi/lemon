import { useState } from 'react'
import type { ProductData } from '../types'
import SurvivalChart from './SurvivalChart'
import FailureModes from './FailureModes'
import SnippetDrawer from './SnippetDrawer'
import HonestyPanel from './HonestyPanel'
import {
  medianText,
  priceText,
  ratingText,
  costPerMo,
  shortTitle,
  topFailureText,
  tagText,
  ProductPhoto,
  StatRow,
  CostToOwn,
} from './productBits'
import { repairTip, ifixitUrl } from './repairTips'
import { INK, ON_INK, RUST, TEAL, inkAlpha } from '../theme'

// Compact "make it last" hint — the product's top failure mode → a repair tip
// and an iFixit link, so the comparison also nudges repair over replacement.
function RepairHint({ product, color }: { product: ProductData; color: string }) {
  const top = product.failure_modes[0]
  const t = top && repairTip(top.mode)
  if (!t) return null
  return (
    <div className="mt-3.5 pt-3 flex flex-col gap-1.5" style={{ borderTop: `1px dashed ${inkAlpha(0.2)}` }}>
      <div className="flex items-center gap-2">
        <span
          className="font-mono text-[8.5px] font-semibold uppercase tracking-[0.06em] px-1.5 py-0.5"
          style={{ background: color, color: ON_INK }}
        >
          {t.effort}
        </span>
        <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em]" style={{ color: inkAlpha(0.5) }}>
          Make it last
        </span>
      </div>
      <p className="text-[12px] leading-snug" style={{ color: inkAlpha(0.65) }}>{t.tip}</p>
      <a
        href={ifixitUrl(product.brand, product.title)}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em]"
        style={{ color }}
      >
        Repair guides →
      </a>
    </div>
  )
}

interface Props {
  left: ProductData   // longer-lived  (better → teal, right column)
  right: ProductData  // shorter-lived (worse  → rust, left column)
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
      <ProductPhoto product={product} color={color} align={align} />

      <div className="font-serif font-semibold text-[17px] leading-snug mb-0.5">{product.title}</div>
      <div className="font-mono text-[12px] mb-4" style={{ color: inkAlpha(0.5) }}>
        {tagText(product, other, worse)}
      </div>

      <StatRow label="Price" value={priceText(product)} />
      <StatRow label="Rating" value={ratingText(product)} />
      <StatRow label="Median life" value={medianText(product)} />
      <StatRow label="Top failure" value={topFailureText(product)} last />

      <div className="mt-4">
        <CostToOwn product={product} color={color} />
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
          <RepairHint product={worse} color={RUST} />
        </div>
        <div className="flex flex-col gap-2.5">
          <div
            className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] mb-1"
            style={{ color: inkAlpha(0.42) }}
          >
            Failure modes — {shortTitle(better)}
          </div>
          <FailureModes modes={better.failure_modes} nEvents={better.n_events} scaleMax={failureMax} color={TEAL} onSelect={setActiveMode} />
          <RepairHint product={better} color={TEAL} />
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
