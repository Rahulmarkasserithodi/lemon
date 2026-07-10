import type { FailureMode } from '../types'
import { inkAlpha } from '../theme'

interface Props {
  modes: FailureMode[]
  nEvents: number
  scaleMax: number   // shared max share across both products, for comparable bar widths
  color: string
  onSelect: (mode: string) => void
}

function label(mode: string) {
  return mode.replace(/_/g, ' ')
}

export default function FailureModes({ modes, nEvents, scaleMax, color, onSelect }: Props) {
  if (!modes.length) {
    return <p className="text-[12px]" style={{ color: inkAlpha(0.4) }}>No failure data</p>
  }

  return (
    <div className="flex flex-col gap-2.5">
      {modes.slice(0, 4).map((m) => {
        const share = nEvents > 0 ? m.count / nEvents : 0
        const pct = Math.round(share * 100)
        const width = Math.min(100, scaleMax > 0 ? (share / scaleMax) * 100 : 0)
        return (
          <button
            key={m.mode}
            onClick={() => onSelect(m.mode)}
            className="flex items-center gap-3 w-full text-left group"
            title="Click to see review snippets"
          >
            <span className="w-[150px] text-[13px] capitalize leading-snug group-hover:underline">
              {label(m.mode)}
            </span>
            <span className="flex-1 h-1" style={{ background: inkAlpha(0.1) }}>
              <span className="block h-full" style={{ width: `${width}%`, background: color }} />
            </span>
            <span className="w-9 text-right font-mono text-[12.5px] font-semibold" style={{ color }}>
              {pct}%
            </span>
          </button>
        )
      })}
    </div>
  )
}
