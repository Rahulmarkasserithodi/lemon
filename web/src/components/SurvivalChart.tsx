/**
 * SurvivalChart — Kaplan-Meier step curve(s) with Greenwood CI bands.
 * Styled for the "Lab Ledger": clinical, light, monospace ticks.
 *
 * Two products (left = longer-lived/teal, right = shorter-lived/rust) overlay on
 * one axis. Omit `right` for a single-product chart (one curve in `soloColor`).
 */
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import type { ProductData, MergedPoint } from '../types'
import { BG, PANEL, RUST, TEAL, INK, inkAlpha } from '../theme'

const MONO = "'IBM Plex Mono', ui-monospace, monospace"

function mergeCurves(a: ProductData['curve'], b: ProductData['curve'] | null): MergedPoint[] {
  const bb = b ?? a
  const times = Array.from(
    new Set([...a.map((p) => p.t), ...bb.map((p) => p.t)]),
  ).sort((x, y) => x - y)

  let ai = 0, bi = 0
  return times.map((t) => {
    while (ai + 1 < a.length && a[ai + 1].t <= t) ai++
    while (bi + 1 < bb.length && bb[bi + 1].t <= t) bi++
    return {
      t,
      s_a: a[ai].s,  lo_a: a[ai].lo,  hi_a: a[ai].hi,
      s_b: bb[bi].s, lo_b: bb[bi].lo, hi_b: bb[bi].hi,
    }
  })
}

interface Props {
  left: ProductData          // longer-lived (teal), or the sole product in solo mode
  right?: ProductData        // shorter-lived (rust); omit for a single-product chart
  soloColor?: string         // curve colour when there is no `right`
}

function fmt(v: number) {
  return `${Math.round(v * 100)}%`
}

export default function SurvivalChart({ left, right, soloColor = INK }: Props) {
  const solo = !right
  const colorA = solo ? soloColor : TEAL
  const colorB = RUST

  const data = mergeCurves(left.curve, right?.curve ?? null)
  const maxT = Math.max(left.curve.at(-1)?.t ?? 0, right?.curve.at(-1)?.t ?? 0)

  const short = (p: ProductData) => p.title.split(' ').slice(0, 4).join(' ')

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const d = payload[0]?.payload as MergedPoint
    return (
      <div className="text-[11px] space-y-1 px-3 py-2" style={{ background: PANEL, border: `1px solid ${INK}` }}>
        <div className="font-mono" style={{ color: inkAlpha(0.5) }}>Month {label}</div>
        <div style={{ color: colorA }}>
          {short(left)}: {fmt(d.s_a)}
          <span className="ml-1" style={{ color: inkAlpha(0.45) }}>[{fmt(d.lo_a)}–{fmt(d.hi_a)}]</span>
        </div>
        {right && (
          <div style={{ color: colorB }}>
            {short(right)}: {fmt(d.s_b)}
            <span className="ml-1" style={{ color: inkAlpha(0.45) }}>[{fmt(d.lo_b)}–{fmt(d.hi_b)}]</span>
          </div>
        )}
      </div>
    )
  }

  const medLabel = (p: ProductData) =>
    p.median_months == null ? '' : `MED ${p.median_months.toFixed(0)}${p.median_is_lower_bound ? '+' : ''}`

  // When two medians sit close together, lift one label to a second row.
  const near =
    !solo &&
    left.median_months != null &&
    right!.median_months != null &&
    Math.abs(left.median_months - right!.median_months) / (maxT || 1) < 0.16

  const medLabelRender = (text: string, color: string, raised: boolean) =>
    ({ viewBox }: any) => (
      <text
        x={viewBox?.x ?? 0}
        y={(viewBox?.y ?? 0) - (raised ? 16 : 4)}
        textAnchor="middle"
        fill={color}
        fontFamily={MONO}
        fontSize={10}
        fontWeight={600}
      >
        {text}
      </text>
    )

  return (
    <div className="w-full max-w-[540px]">
      <div
        className="flex justify-between font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] mb-2"
        style={{ color: inkAlpha(0.42) }}
      >
        <span>% still working (y)</span>
        <span>months owned (x)</span>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data} margin={{ top: 26, right: 8, bottom: 24, left: 0 }}>
          <CartesianGrid stroke={inkAlpha(0.1)} />
          <XAxis
            dataKey="t"
            type="number"
            domain={[0, maxT]}
            tickCount={6}
            stroke={inkAlpha(0.45)}
            tick={{ fill: inkAlpha(0.5), fontSize: 10.5, fontFamily: MONO }}
          />
          <YAxis
            domain={[0, 1]}
            tickFormatter={fmt}
            stroke={inkAlpha(0.45)}
            tick={{ fill: inkAlpha(0.5), fontSize: 10.5, fontFamily: MONO }}
            width={40}
          />
          <Tooltip content={<CustomTooltip />} />

          {/* median (50% survival) rule */}
          <ReferenceLine y={0.5} stroke={inkAlpha(0.3)} />

          {/* CI band A */}
          <Area type="stepAfter" dataKey="hi_a" stroke="none" fill={colorA} fillOpacity={0.16} baseValue={0} isAnimationActive={false} />
          <Area type="stepAfter" dataKey="lo_a" stroke="none" fill={BG} fillOpacity={1} baseValue={0} isAnimationActive={false} />

          {/* CI band B (only when comparing) */}
          {right && <Area type="stepAfter" dataKey="hi_b" stroke="none" fill={colorB} fillOpacity={0.16} baseValue={0} isAnimationActive={false} />}
          {right && <Area type="stepAfter" dataKey="lo_b" stroke="none" fill={BG} fillOpacity={1} baseValue={0} isAnimationActive={false} />}

          {/* median verticals */}
          {right && right.median_months != null && (
            <ReferenceLine
              x={right.median_months}
              stroke={colorB}
              strokeWidth={1.5}
              strokeDasharray="3 3"
              label={medLabelRender(medLabel(right), colorB, false)}
            />
          )}
          {left.median_months != null && (
            <ReferenceLine
              x={left.median_months}
              stroke={colorA}
              strokeWidth={1.5}
              strokeDasharray="3 3"
              label={medLabelRender(medLabel(left), colorA, near)}
            />
          )}

          {/* KM curves */}
          <Line type="stepAfter" dataKey="s_a" stroke={colorA} strokeWidth={2} dot={false} isAnimationActive={false} />
          {right && <Line type="stepAfter" dataKey="s_b" stroke={colorB} strokeWidth={2} dot={false} isAnimationActive={false} />}
        </ComposedChart>
      </ResponsiveContainer>

      <p className="text-center font-mono text-[9.5px] mt-1" style={{ color: inkAlpha(0.38) }}>
        Kaplan-Meier · shaded = 95% Greenwood CI · right-censored
      </p>
    </div>
  )
}
