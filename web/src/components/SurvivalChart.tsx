/**
 * SurvivalChart — overlaid Kaplan-Meier step curves with Greenwood CI bands.
 *
 * Merges two KM curves onto a unified time axis (step-wise interpolation),
 * then renders CI bands (Area) + survival lines (Line) via Recharts.
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

const COLOR_A = '#60a5fa'  // blue — longer-lived (left)
const COLOR_B = '#fb923c'  // orange — shorter-lived (right)

function mergeCurves(a: ProductData['curve'], b: ProductData['curve']): MergedPoint[] {
  const times = Array.from(
    new Set([...a.map((p) => p.t), ...b.map((p) => p.t)]),
  ).sort((x, y) => x - y)

  let ai = 0, bi = 0
  return times.map((t) => {
    while (ai + 1 < a.length && a[ai + 1].t <= t) ai++
    while (bi + 1 < b.length && b[bi + 1].t <= t) bi++
    return {
      t,
      s_a: a[ai].s,  lo_a: a[ai].lo,  hi_a: a[ai].hi,
      s_b: b[bi].s,  lo_b: b[bi].lo,  hi_b: b[bi].hi,
    }
  })
}

interface Props {
  left: ProductData   // longer-lived
  right: ProductData  // shorter-lived
}

function fmt(v: number) {
  return `${Math.round(v * 100)}%`
}

export default function SurvivalChart({ left, right }: Props) {
  const data = mergeCurves(left.curve, right.curve)
  const maxT = Math.max(
    left.curve.at(-1)?.t ?? 0,
    right.curve.at(-1)?.t ?? 0,
  )

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const d = payload[0]?.payload as MergedPoint
    return (
      <div className="bg-[#111] border border-[#333] rounded px-3 py-2 text-xs space-y-1">
        <div className="text-[#888]">Month {label}</div>
        <div style={{ color: COLOR_A }}>
          {left.title.split(' ').slice(0, 4).join(' ')}: {fmt(d.s_a)}
          <span className="text-[#666] ml-1">[{fmt(d.lo_a)}–{fmt(d.hi_a)}]</span>
        </div>
        <div style={{ color: COLOR_B }}>
          {right.title.split(' ').slice(0, 4).join(' ')}: {fmt(d.s_b)}
          <span className="text-[#666] ml-1">[{fmt(d.lo_b)}–{fmt(d.hi_b)}]</span>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="flex gap-6 text-xs text-[#888] mb-3 justify-center">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-0.5" style={{ background: COLOR_A }} />
          {left.title.split(' ').slice(0, 5).join(' ')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-0.5" style={{ background: COLOR_B }} />
          {right.title.split(' ').slice(0, 5).join(' ')}
        </span>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 24, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#222" />
          <XAxis
            dataKey="t"
            type="number"
            domain={[0, maxT]}
            tickCount={8}
            stroke="#444"
            tick={{ fill: '#666', fontSize: 11 }}
            label={{ value: 'Months', position: 'insideBottom', offset: -12, fill: '#555', fontSize: 11 }}
          />
          <YAxis
            domain={[0, 1]}
            tickFormatter={fmt}
            stroke="#444"
            tick={{ fill: '#666', fontSize: 11 }}
            width={44}
            label={{ value: 'Survival', angle: -90, position: 'insideLeft', offset: 10, fill: '#555', fontSize: 11 }}
          />
          <Tooltip content={<CustomTooltip />} />

          {/* Reference line at 0.5 (median) */}
          <ReferenceLine y={0.5} stroke="#333" strokeDasharray="4 4" />

          {/* CI band A (blue) */}
          <Area
            type="stepAfter"
            dataKey="hi_a"
            stroke="none"
            fill={COLOR_A}
            fillOpacity={0.12}
            baseValue={0}
            isAnimationActive={false}
          />
          <Area
            type="stepAfter"
            dataKey="lo_a"
            stroke="none"
            fill="#0d0d0d"
            fillOpacity={1}
            baseValue={0}
            isAnimationActive={false}
          />

          {/* CI band B (orange) */}
          <Area
            type="stepAfter"
            dataKey="hi_b"
            stroke="none"
            fill={COLOR_B}
            fillOpacity={0.12}
            baseValue={0}
            isAnimationActive={false}
          />
          <Area
            type="stepAfter"
            dataKey="lo_b"
            stroke="none"
            fill="#0d0d0d"
            fillOpacity={1}
            baseValue={0}
            isAnimationActive={false}
          />

          {/* KM curves */}
          <Line
            type="stepAfter"
            dataKey="s_a"
            stroke={COLOR_A}
            strokeWidth={2.5}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="stepAfter"
            dataKey="s_b"
            stroke={COLOR_B}
            strokeWidth={2.5}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <p className="text-center text-[10px] text-[#444] mt-1">
        Kaplan-Meier estimator · shaded area = 95% Greenwood CI · right-censored
      </p>
    </div>
  )
}
