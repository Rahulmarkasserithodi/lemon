import { RUST } from '../theme'

/**
 * Tenure brand mark — concept 1a "The Curve Persistent": a survival curve that
 * dips once and holds. Copper by default; pass `color` for single-colour use.
 */
export default function TenureMark({
  size = 26,
  color = RUST,
}: {
  size?: number
  color?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={{ color, flex: 'none' }}
      aria-hidden="true"
    >
      <path
        d="M14,36 L36,36 Q50,36 54,50 Q58,64 74,66 L88,66"
        fill="none"
        stroke="currentColor"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="14" cy="36" r="6" fill="currentColor" />
    </svg>
  )
}
