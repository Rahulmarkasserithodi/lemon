// Design tokens for the "Lab Ledger" hero (design 1b) — dark mode.
export const BG = '#121415'     // app background (full-screen canvas)
export const PANEL = '#1b1e20'  // slightly elevated surfaces (tooltip, modal)
export const INK = '#e8e6df'    // primary light ink: text + rules
export const ON_INK = '#121415' // text/icon on ink-filled chips & buttons
export const RUST = '#d5714f'   // worse  / shorter-lived product (brightened for dark)
export const TEAL = '#57ac95'   // better / longer-lived product (brightened for dark)

// Light ink at common opacities (kept as a helper so it reads clearly at call sites).
export const inkAlpha = (a: number) => `rgba(232,230,223,${a})`
