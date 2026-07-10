import { useState } from 'react'
import type { ProductData } from '../types'
import { DEMO_PAIRS, DEMO_PRODUCTS } from '../demoData'
import CompareView from './CompareView'
import { INK, ON_INK, inkAlpha } from '../theme'

interface Props {
  onExit: () => void
}

export default function DemoMode({ onExit }: Props) {
  const [pairIndex, setPairIndex] = useState(0)

  const pair = DEMO_PAIRS[pairIndex]
  const left = DEMO_PRODUCTS[pair.left] as ProductData
  const right = DEMO_PRODUCTS[pair.right] as ProductData

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <span
            className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.1em] px-2 py-1"
            style={{ background: INK, color: ON_INK }}
          >
            Demo Mode
          </span>
          {DEMO_PAIRS.length > 1 && (
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
        <button
          onClick={onExit}
          className="font-mono text-[10.5px] uppercase tracking-[0.08em] transition-colors"
          style={{ color: inkAlpha(0.5) }}
        >
          Browse real data →
        </button>
      </div>

      {pair.note && (
        <p className="text-[12.5px] mb-6" style={{ color: inkAlpha(0.5) }}>{pair.note}</p>
      )}

      <CompareView left={left} right={right} />

      <p className="text-center font-mono text-[10px] mt-8" style={{ color: inkAlpha(0.38) }}>
        Demo data is illustrative. Run the pipeline with a{' '}
        <code style={{ color: inkAlpha(0.55) }}>GEMINI_API_KEY</code> to see real product pairs.
      </p>
    </div>
  )
}
