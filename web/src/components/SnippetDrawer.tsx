import { INK, PANEL, RUST, TEAL, inkAlpha } from '../theme'

interface Props {
  mode: string
  snippetsLeft: string[]
  snippetsRight: string[]
  onClose: () => void
}

function Snippet({ text }: { text: string }) {
  return (
    <blockquote
      className="pl-3 text-[13px] leading-relaxed italic"
      style={{ borderLeft: `2px solid ${inkAlpha(0.25)}`, color: inkAlpha(0.7) }}
    >
      "{text}"
    </blockquote>
  )
}

export default function SnippetDrawer({ mode, snippetsLeft, snippetsRight, onClose }: Props) {
  const label = mode.replace(/_/g, ' ')
  const hasAny = snippetsLeft.length > 0 || snippetsRight.length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.65)' }}>
      <div
        className="w-full max-w-2xl max-h-[80vh] overflow-y-auto p-6 space-y-5"
        style={{ background: PANEL, border: `1.5px solid ${INK}` }}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-serif font-semibold text-[17px] capitalize">"{label}" — review excerpts</h3>
          <button
            onClick={onClose}
            className="text-2xl leading-none transition-colors"
            style={{ color: inkAlpha(0.5) }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {!hasAny && (
          <p className="text-[13px]" style={{ color: inkAlpha(0.45) }}>No snippets collected for this failure mode.</p>
        )}

        {snippetsLeft.length > 0 && (
          <section>
            <div className="font-mono text-[10px] uppercase tracking-[0.1em] mb-2" style={{ color: TEAL }}>
              Longer-lived product
            </div>
            <div className="space-y-3">
              {snippetsLeft.map((s, i) => <Snippet key={i} text={s} />)}
            </div>
          </section>
        )}

        {snippetsRight.length > 0 && (
          <section>
            <div className="font-mono text-[10px] uppercase tracking-[0.1em] mb-2" style={{ color: RUST }}>
              Shorter-lived product
            </div>
            <div className="space-y-3">
              {snippetsRight.map((s, i) => <Snippet key={i} text={s} />)}
            </div>
          </section>
        )}

        <p className="font-mono text-[10px]" style={{ color: inkAlpha(0.4) }}>
          Excerpts from verified Amazon reviews · reviewer identifiers not exported
        </p>
      </div>
    </div>
  )
}
