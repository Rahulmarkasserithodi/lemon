/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Lab Ledger (design 1b) palette — dark mode
        page: '#121415',      // full-screen canvas background
        panel: '#1b1e20',     // elevated surfaces
        ink: '#e8e6df',       // primary light text / rules
        rust: '#d5714f',      // worse / shorter-lived product
        teal: '#57ac95',      // better / longer-lived product
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
