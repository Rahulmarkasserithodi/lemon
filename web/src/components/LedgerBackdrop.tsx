import { RUST, TEAL } from '../theme'

/**
 * Faint full-bleed "ledger" decoration for the landing gutters: hairline
 * horizontal rules (graph-paper), vertical rules framing the content column,
 * and a ghosted survival-curve pair (copper dips, teal holds) echoing the brand
 * mark. Purely decorative — sits behind content and never intercepts events.
 */
export default function LedgerBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-0 pointer-events-none overflow-hidden"
      style={{
        backgroundImage:
          'repeating-linear-gradient(to bottom, transparent 0 47px, rgba(28,31,33,0.022) 47px 48px)',
      }}
    >
      {/* vertical ledger margins framing the content column */}
      <div
        className="mx-auto h-full max-w-[860px]"
        style={{
          borderLeft: '1px solid rgba(28,31,33,0.05)',
          borderRight: '1px solid rgba(28,31,33,0.05)',
        }}
      />

      {/* ghosted survival curves spanning the full width */}
      <svg
        className="absolute inset-x-0 bottom-0 w-full"
        style={{ height: '58%' }}
        viewBox="0 0 1440 560"
        preserveAspectRatio="none"
      >
        {/* teal — durable, holds high */}
        <path
          d="M0,60 C 320,84 640,150 960,210 C 1160,248 1300,262 1440,272"
          fill="none"
          stroke={TEAL}
          strokeWidth="2.5"
          strokeOpacity="0.06"
          vectorEffect="non-scaling-stroke"
        />
        {/* copper — declines, then flattens low */}
        <path
          d="M0,74 C 230,88 330,250 560,318 C 780,382 1010,398 1440,404"
          fill="none"
          stroke={RUST}
          strokeWidth="2.5"
          strokeOpacity="0.07"
          vectorEffect="non-scaling-stroke"
        />
        {/* origin dot echoing the brand mark */}
        <circle cx="0" cy="74" r="6" fill={RUST} fillOpacity="0.07" />
      </svg>
    </div>
  )
}
