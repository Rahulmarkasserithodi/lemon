// Design tokens for the "Lab Ledger" (Lemon.dc.html) — light mode.
export const BG = '#f3f4f3'     // app background
export const PANEL = '#ffffff'  // white surfaces (search, dropdown, cards, tooltip, modal)
export const INK = '#1c1f21'    // primary ink: text + rules
export const ON_INK = '#f3f4f3' // text/icon on ink-filled chips & buttons
export const RUST = '#a34e33'   // worse  / shorter-lived product
export const TEAL = '#3d8a79'   // better / longer-lived product

// Ink at common opacities (kept as a helper so it reads clearly at call sites).
export const inkAlpha = (a: number) => `rgba(28,31,33,${a})`
