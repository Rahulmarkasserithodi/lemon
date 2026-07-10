interface Props {
  mode: string
  snippetsLeft: string[]
  snippetsRight: string[]
  onClose: () => void
}

function Snippet({ text }: { text: string }) {
  return (
    <blockquote className="border-l-2 border-[#333] pl-3 text-[#aaa] text-sm leading-relaxed italic">
      "{text}"
    </blockquote>
  )
}

export default function SnippetDrawer({ mode, snippetsLeft, snippetsRight, onClose }: Props) {
  const label = mode.replace(/_/g, ' ')
  const hasAny = snippetsLeft.length > 0 || snippetsRight.length > 0

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-[#111] border border-[#222] rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-semibold capitalize">"{label}" — review excerpts</h3>
          <button
            onClick={onClose}
            className="text-[#555] hover:text-white text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {!hasAny && (
          <p className="text-[#555] text-sm">No snippets collected for this failure mode.</p>
        )}

        {snippetsLeft.length > 0 && (
          <section>
            <div className="text-[10px] uppercase tracking-widest text-[#60a5fa] mb-2">
              Longer-lived product
            </div>
            <div className="space-y-3">
              {snippetsLeft.map((s, i) => <Snippet key={i} text={s} />)}
            </div>
          </section>
        )}

        {snippetsRight.length > 0 && (
          <section>
            <div className="text-[10px] uppercase tracking-widest text-[#fb923c] mb-2">
              Shorter-lived product
            </div>
            <div className="space-y-3">
              {snippetsRight.map((s, i) => <Snippet key={i} text={s} />)}
            </div>
          </section>
        )}

        <p className="text-[10px] text-[#444]">
          Excerpts from verified Amazon reviews · reviewer identifiers not exported
        </p>
      </div>
    </div>
  )
}
