import { useState } from 'react'
import type { ProductData } from './types'
import DemoMode from './components/DemoMode'
import CompareView from './components/CompareView'
import ProductPicker from './components/ProductPicker'

type Tab = 'demo' | 'browse' | 'about'

function Nav({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const btn = (id: Tab, label: string) => (
    <button
      onClick={() => setTab(id)}
      className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
        tab === id
          ? 'bg-[#1e1e1e] text-white'
          : 'text-[#555] hover:text-[#888]'
      }`}
    >
      {label}
    </button>
  )
  return (
    <nav className="flex items-center gap-1">
      {btn('demo', 'Demo')}
      {btn('browse', 'Browse')}
      {btn('about', 'About')}
    </nav>
  )
}

export default function App() {
  const [tab, setTab] = useState<Tab>('demo')
  const [pair, setPair] = useState<[ProductData, ProductData] | null>(null)

  const handlePair = (left: ProductData, right: ProductData) => {
    setPair([left, right])
    setTab('browse')
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d]">
      {/* Header */}
      <header className="border-b border-[#1a1a1a] px-6 py-4 flex items-center justify-between sticky top-0 bg-[#0d0d0d]/95 backdrop-blur-sm z-40">
        <div className="flex items-center gap-3">
          <span className="text-[#f5e642] text-xl font-bold tracking-tight">🍋 lemon</span>
          <span className="hidden sm:inline text-[#333] text-sm">
            cost per year of life · Amazon Appliances
          </span>
        </div>
        <Nav tab={tab} setTab={setTab} />
      </header>

      {/* Main content */}
      <main className="max-w-3xl mx-auto px-4 py-10">
        {tab === 'demo' && (
          <DemoMode onExit={() => setTab('browse')} />
        )}

        {tab === 'browse' && (
          <div>
            {pair ? (
              <div className="space-y-8">
                <button
                  onClick={() => setPair(null)}
                  className="text-xs text-[#555] hover:text-[#888] transition-colors"
                >
                  ← Back to product list
                </button>
                <CompareView left={pair[0]} right={pair[1]} />
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-bold text-white mb-1">Browse products</h1>
                  <p className="text-[#555] text-sm">
                    Select two products and click Compare to see their survival curves side by side.
                  </p>
                </div>
                <ProductPicker onSelectPair={handlePair} />
              </div>
            )}
          </div>
        )}

        {tab === 'about' && (
          <div className="prose prose-invert max-w-none space-y-5 text-[#aaa] text-sm leading-relaxed">
            <h1 className="text-3xl font-bold text-white">About Lemon</h1>
            <p>
              Star ratings tell you if people liked a product. They don't tell you how long it
              lasts. <strong className="text-white">Lemon</strong> mines time-to-failure signals from
              Amazon review text, runs real Kaplan-Meier survival analysis (with right-censoring),
              and shows you the metric that actually matters for appliances: cost per year of life.
            </p>
            <h2 className="text-xl font-semibold text-white">How it works</h2>
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
            <h2 className="text-xl font-semibold text-white">Limitations</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>Self-reported durations are noisy; relative comparisons are more reliable than absolute numbers.</li>
              <li>Survivorship bias may be present — owners of failed products may be less likely to review.</li>
              <li>Sample sizes vary; always check n and n_events before drawing conclusions.</li>
              <li>Only products with ≥25 observations and ≥10 failure events are published.</li>
            </ul>
            <h2 className="text-xl font-semibold text-white">Data & reproducibility</h2>
            <p>
              Source: McAuley Lab Amazon Reviews 2023 — Appliances category (2.1M reviews, 94K products).
              All pipeline code is open source. See the{' '}
              <code className="text-[#888]">pipeline/</code> directory for the Python extraction and
              survival analysis code.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
