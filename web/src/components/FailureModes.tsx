import type { FailureMode } from '../types'

interface Props {
  modes: FailureMode[]
  color: string
  onSelect: (mode: string) => void
}

function label(mode: string) {
  return mode.replace(/_/g, ' ')
}

export default function FailureModes({ modes, color, onSelect }: Props) {
  if (!modes.length) return <p className="text-[#555] text-xs">No failure data</p>

  const max = Math.max(...modes.map((m) => m.count))

  return (
    <div className="space-y-1.5">
      {modes.map((m) => (
        <button
          key={m.mode}
          onClick={() => onSelect(m.mode)}
          className="w-full text-left group"
          title="Click to see review snippets"
        >
          <div className="flex items-center justify-between text-xs mb-0.5">
            <span className="text-[#aaa] group-hover:text-white transition-colors capitalize">
              {label(m.mode)}
            </span>
            <span className="text-[#555]">{m.count}</span>
          </div>
          <div className="h-1.5 rounded-full bg-[#1e1e1e] overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${(m.count / max) * 100}%`,
                background: color,
                opacity: 0.7,
              }}
            />
          </div>
        </button>
      ))}
    </div>
  )
}
