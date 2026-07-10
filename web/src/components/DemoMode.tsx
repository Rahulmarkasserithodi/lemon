import { useState } from 'react'
import type { ProductData } from '../types'
import { DEMO_PAIRS, DEMO_PRODUCTS } from '../demoData'
import CompareView from './CompareView'
import ProductSearch from './ProductSearch'
import { INK, ON_INK, inkAlpha } from '../theme'

export default function DemoMode() {
  const [pairIndex, setPairIndex] = useState(0)
  const [custom, setCustom] = useState<[ProductData, ProductData] | null>(null)

  const pair = DEMO_PAIRS[pairIndex]
  const demoLeft = DEMO_PRODUCTS[pair.left] as ProductData
  const demoRight = DEMO_PRODUCTS[pair.right] as ProductData

  return (
    <div>
      {/* header row */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <span
            className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.1em] px-2 py-1"
            style={{ background: INK, color: ON_INK }}
          >
            {custom ? 'Live Comparison' : 'Demo Mode'}
          </span>
          {!custom && DEMO_PAIRS.length > 1 && (
            <div className="flex gap-1.5">
              {DEMO_PAIRS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setPairIndex(i)}
                  className="w-2 h-2 rounded-full transition-colors"
                  style={{ background: i === pairIndex ? INK : inkAlpha(0.25) }}
                  aria-label={`Pair ${i + 1}`}
                />
              ))}
            </div>
          )}
        </div>
        {custom && (
          <button
            onClick={() => setCustom(null)}
            className="font-mono text-[10.5px] uppercase tracking-[0.08em] transition-colors"
            style={{ color: inkAlpha(0.5) }}
          >
            ← Back to demo pair
          </button>
        )}
      </div>

      {/* search-as-dropdown: pick two real products to compare */}
      <div className="mb-8">
        <ProductSearch onCompare={(l, r) => setCustom([l, r])} />
      </div>

      {custom ? (
        <CompareView left={custom[0]} right={custom[1]} />
      ) : (
        <>
          {pair.note && (
            <p className="text-[12.5px] mb-6" style={{ color: inkAlpha(0.5) }}>{pair.note}</p>
          )}
          <CompareView left={demoLeft} right={demoRight} />
          <p className="text-center font-mono text-[10px] mt-8" style={{ color: inkAlpha(0.38) }}>
            Demo pair is illustrative — search above to compare any two real products.
          </p>
        </>
      )}
    </div>
  )
}
