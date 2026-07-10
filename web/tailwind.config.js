/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#1a1a1a',
        border: '#2a2a2a',
        muted: '#555',
        accent: '#f5e642',    // lemon yellow
        good: '#22c55e',      // longer-lived product
        bad: '#ef4444',       // shorter-lived product
        curve: {
          a: '#60a5fa',       // blue — longer-lived
          b: '#fb923c',       // orange — shorter-lived
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
