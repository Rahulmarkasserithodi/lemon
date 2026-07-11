import { useState } from 'react'
import type { ProductData, SelItem } from '../types'
import SurvivalChart from './SurvivalChart'
import FailureModes from './FailureModes'
import SnippetDrawer from './SnippetDrawer'
import ProductSearch from './ProductSearch'
import {
  medianText,
  priceText,
  topFailureText,
  ratingText,
  shortTitle,
  ProductPhoto,
  StatRow,
  CostToOwn,
} from './productBits'
import { INK, RUST, inkAlpha } from '../theme'

interface Props {
  product: ProductData
  onCompareWith: (item: SelItem) => void
  busy?: boolean
  error?: string
}

export default function ProductDetail({ product, onCompareWith, busy, error }: Props) {
  const [activeMode, setActiveMode] = useState<string | null>(null)

  const failureMax = Math.max(
    1,
    ...product.failure_modes.map((m) => (product.n_events > 0 ? m.count / product.n_events : 0)),
  )

  return (
    <div className="space-y-0">
      {/* header */}
      <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] mb-3" style={{ color: inkAlpha(0.42) }}>
        Durability report{product.brand ? ` · ${product.brand}` : ''}
      </div>
      <h1 className="font-serif font-semibold text-[26px] leading-tight mb-1.5 max-w-3xl">{product.title}</h1>
      <div className="font-mono text-[12px] mb-8" style={{ color: inkAlpha(0.5) }}>
        {product.average_rating != null && <>{product.average_rating.toFixed(1)}★ · </>}
        {(product.n_reviews ?? product.n_obs).toLocaleString()} reviews · {priceText(product)}
      </div>

      {/* info | chart */}
      <div className="grid gap-8 lg:gap-10 items-start grid-cols-1 lg:[grid-template-columns:300px_1px_minmax(0,1fr)]">
        <div className="flex flex-col">
          <ProductPhoto product={product} color={INK} />
          <StatRow label="Price" value={priceText(product)} />
          <StatRow label="Rating" value={ratingText(product)} />
          <StatRow label="Median life" value={medianText(product)} />
          <StatRow label="Top failure" value={topFailureText(product)} last />
          <div className="mt-4">
            <CostToOwn product={product} color={INK} />
          </div>
        </div>

        <div className="hidden lg:block" style={{ background: inkAlpha(0.18) }} />

        <div className="flex flex-col items-center pt-1.5">
          <SurvivalChart left={product} soloColor={INK} />
        </div>
      </div>

      {/* failure modes */}
      <div className="mt-8 pt-8" style={{ borderTop: `1.5px solid ${INK}` }}>
        <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] mb-3" style={{ color: inkAlpha(0.42) }}>
          Failure modes — {shortTitle(product)}
        </div>
        <div className="max-w-2xl">
          <FailureModes
            modes={product.failure_modes}
            nEvents={product.n_events}
            scaleMax={failureMax}
            color={INK}
            onSelect={setActiveMode}
          />
        </div>
      </div>

      {/* compare-with CTA */}
      <div className="mt-10 pt-8" style={{ borderTop: `1px solid ${inkAlpha(0.18)}` }}>
        <h2 className="font-serif text-[19px] font-semibold mb-1">Compare with another product</h2>
        <p className="text-[13px] mb-4" style={{ color: inkAlpha(0.55) }}>
          Add a second product to overlay both survival curves on one chart.
        </p>
        <div className="max-w-[560px]">
          <ProductSearch onPick={onCompareWith} selectedAsins={[product.parent_asin]} />
        </div>
        {busy && (
          <p className="mt-3 text-[12px]" style={{ color: inkAlpha(0.6) }}>
            Reading reviews with the model … (first run for a product can take a few seconds)
          </p>
        )}
        {error && !busy && <p className="mt-3 text-[12px]" style={{ color: RUST }}>{error}</p>}
      </div>

      {activeMode && (
        <SnippetDrawer
          mode={activeMode}
          snippetsLeft={product.snippets[activeMode] ?? []}
          snippetsRight={[]}
          onClose={() => setActiveMode(null)}
          labelLeft="Review excerpts"
          colorLeft={INK}
        />
      )}
    </div>
  )
}
