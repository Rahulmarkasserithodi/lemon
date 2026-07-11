import { useState } from 'react'
import Landing from './components/Landing'
import TenureMark from './components/TenureMark'
import EwasteFinder from './components/EwasteFinder'
import { INK, ON_INK, inkAlpha } from './theme'

type Tab = 'demo' | 'ewaste' | 'about'

function Nav({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const btn = (id: Tab, label: string) => (
    <button
      onClick={() => setTab(id)}
      className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] px-3 py-1.5 border transition-colors"
      style={
        tab === id
          ? { background: INK, color: ON_INK, borderColor: INK }
          : { background: 'transparent', color: inkAlpha(0.5), borderColor: inkAlpha(0.28) }
      }
    >
      {label}
    </button>
  )
  return (
    <nav className="flex items-center gap-2">
      {btn('demo', 'Compare')}
      {btn('ewaste', 'E-Waste')}
      {btn('about', 'About')}
    </nav>
  )
}

export default function App() {
  const [tab, setTab] = useState<Tab>('demo')

  return (
    <div className="min-h-screen bg-[#f3f4f3] text-[#1c1f21]">
      <div className="w-full">
        {/* Header */}
        <header
          className="flex items-center justify-between px-6 sm:px-10 py-5 sticky top-0 z-40 bg-[#f3f4f3]"
          style={{ borderBottom: `1.5px solid ${INK}` }}
        >
          <div className="flex items-center gap-2.5">
            <TenureMark size={26} />
            <span className="font-serif font-semibold text-[21px] text-[#1c1f21] tracking-[-0.01em]">Tenure</span>
            <span
              className="hidden sm:inline font-mono text-[9.5px] font-semibold uppercase tracking-[0.1em] ml-1 self-center"
              style={{ color: inkAlpha(0.42) }}
            >
              Durability Ledger
            </span>
          </div>
          <Nav tab={tab} setTab={setTab} />
        </header>

        {/* Main content */}
        <main className="px-4 sm:px-10 py-10 max-w-[1440px] mx-auto">
          {tab === 'demo' && <Landing />}

          {tab === 'ewaste' && <EwasteFinder />}

          {tab === 'about' && (
            <div className="max-w-2xl space-y-5 text-[15px] leading-relaxed" style={{ color: inkAlpha(0.72) }}>
              <h1 className="font-serif text-[30px] font-bold text-[#1c1f21]">About Tenure</h1>
              <p>
                Star ratings tell you if people liked a product. They don't tell you how long it
                lasts. <strong className="text-[#1c1f21]">Tenure</strong> mines time-to-failure signals from
                Amazon review text, runs real Kaplan-Meier survival analysis (with right-censoring),
                and shows you the metric that actually matters for appliances: cost per year of life.
              </p>
              <h2 className="font-serif text-xl font-semibold text-[#1c1f21]">How it works</h2>
              <ol className="list-decimal list-inside space-y-2">
                <li>
                  Reviews matching time expressions (<em>"died after 14 months"</em>,{' '}
                  <em>"still going at 2 years"</em>) are extracted by a Gemini language model.
                </li>
                <li>
                  Each mention becomes a survival observation: a failure event or a right-censored
                  data point (the product was alive at time T, but we don't know what happened after).
                </li>
                <li>
                  Kaplan-Meier fits a non-parametric survival curve per product, with Greenwood
                  confidence intervals.
                </li>
                <li>
                  Median lifespan = the point where 50% of units have failed.{' '}
                  Cost per year = price ÷ median lifespan in years.
                </li>
              </ol>
              <h2 className="font-serif text-xl font-semibold text-[#1c1f21]">Limitations</h2>
              <ul className="list-disc list-inside space-y-1">
                <li>Self-reported durations are noisy; relative comparisons are more reliable than absolute numbers.</li>
                <li>Survivorship bias may be present — owners of failed products may be less likely to review.</li>
                <li>Sample sizes vary; always check n and n_events before drawing conclusions.</li>
                <li>Only products with ≥25 observations and ≥10 failure events are published.</li>
              </ul>
              <h2 className="font-serif text-xl font-semibold text-[#1c1f21]">Data & reproducibility</h2>
              <p>
                Source: McAuley Lab Amazon Reviews 2023 — Appliances category (2.1M reviews, 94K products).
                All pipeline code is open source. See the{' '}
                <code className="font-mono text-[13px]" style={{ color: inkAlpha(0.6) }}>pipeline/</code> directory for the Python extraction and
                survival analysis code.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
