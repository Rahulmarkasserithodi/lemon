/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Lab Ledger (Lemon.dc.html) palette — light mode
        page: '#f3f4f3',      // canvas background
        panel: '#ffffff',     // white surfaces
        ink: '#1c1f21',       // primary text / rules
        rust: '#a34e33',      // worse / shorter-lived product
        teal: '#3d8a79',      // better / longer-lived product
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['"Source Serif 4"', 'Georgia', 'serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
}
