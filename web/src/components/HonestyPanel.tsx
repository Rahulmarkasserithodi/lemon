import type { ProductData } from '../types'

interface Props {
  left: ProductData
  right: ProductData
}

export default function HonestyPanel({ left, right }: Props) {
  return (
    <details className="border border-[#222] rounded-xl group">
      <summary className="px-4 py-3 text-xs text-[#555] cursor-pointer list-none flex items-center justify-between hover:text-[#888] transition-colors">
        <span>About this analysis</span>
        <span className="text-[#333] group-open:rotate-180 transition-transform">▾</span>
      </summary>
      <div className="px-4 pb-4 text-xs text-[#555] space-y-2 leading-relaxed">
        <p>
          <span className="text-[#777]">Sample sizes:</span>{' '}
          {left.title.split(' ').slice(0, 3).join(' ')} — {left.n_obs} observations,{' '}
          {left.n_events} failure events.{' '}
          {right.title.split(' ').slice(0, 3).join(' ')} — {right.n_obs} observations,{' '}
          {right.n_events} failure events.
        </p>
        <p>
          <span className="text-[#777]">How durations were extracted:</span>{' '}
          Amazon reviewers who mentioned a time ("died after 14 months", "still going after 2
          years") were extracted by a Gemini language model and validated for confidence.
          Self-reported durations are noisy, but <em>relative ranking</em> is robust at scale.
        </p>
        <p>
          <span className="text-[#777]">Right-censoring:</span>{' '}
          Reviews reporting "still works after N months" are treated as right-censored
          observations. The Kaplan-Meier estimator accounts for this correctly; it does not
          assume those products will fail at N months.
        </p>
        <p>
          <span className="text-[#777]">Survival probability at 0.5:</span>{' '}
          The dashed line marks where exactly half the units in the dataset have failed —
          the median lifespan. If the curve never crosses that line, the median is reported as a
          lower bound.
        </p>
        {(left.median_is_lower_bound || right.median_is_lower_bound) && (
          <p className="text-[#f5c518]">
            ⚠ One or both medians are lower bounds (the KM curve never crossed 0.5 in the
            observation window). Cost-per-year for those products is an upper bound.
          </p>
        )}
        <p>
          <span className="text-[#777]">Limitations:</span>{' '}
          This corpus is Amazon reviews, not a controlled reliability study. Survivorship bias
          may be present (owners of failed products may be less likely to leave a review). The
          analysis is most useful for relative comparisons within the same product category and
          price tier.
        </p>
      </div>
    </details>
  )
}
