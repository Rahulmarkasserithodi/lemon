import { useState } from 'react'
import type { ProductData } from '../types'
import { DEMO_PAIRS, DEMO_PRODUCTS } from '../demoData'
import CompareView from './CompareView'

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
          <span className="text-xs uppercase tracking-widest text-[#f5e642] bg-[#f5e64218] px-2 py-0.5 rounded">
            Demo Mode
          </span>
          {DEMO_PAIRS.length > 1 && (
            <div className="flex gap-1">
              {DEMO_PAIRS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setPairIndex(i)}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    i === pairIndex ? 'bg-[#f5e642]' : 'bg-[#333] hover:bg-[#555]'
                  }`}
                  aria-label={`Pair ${i + 1}`}
                />
              ))}
            </div>
          )}
        </div>
        <button
          onClick={onExit}
          className="text-xs text-[#555] hover:text-[#888] transition-colors"
        >
          ← Browse real data
        </button>
      </div>

      {pair.note && (
        <p className="text-xs text-[#555] mb-6 text-center">{pair.note}</p>
      )}

      <CompareView left={left} right={right} />

      <p className="text-center text-[10px] text-[#333] mt-8">
        Demo data is illustrative. Run the pipeline with a{' '}
        <code className="text-[#555]">GEMINI_API_KEY</code> to see real product pairs.
      </p>
    </div>
  )
}
