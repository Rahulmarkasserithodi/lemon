import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// In dev the pipeline's ../data/processed is served directly via fs.allow.
// For production builds (Vercel) the build command pre-copies processed/ into
// public/ (inside web/) so Vite can always find it regardless of sandbox limits.
const isVercel = !!process.env.VERCEL
export default defineConfig({
  plugins: [react()],
  publicDir: isVercel
    ? path.resolve(__dirname, 'public')
    : path.resolve(__dirname, '../data/processed'),
  build: {
    outDir: 'dist',
    // Include the processed JSON in the build output for fully-offline demo
    assetsDir: 'assets',
  },
  server: {
    // Allow Vite to serve files outside the web/ root (needed for publicDir above)
    fs: {
      allow: ['..'],
    },
    // Proxy API calls to the local FastAPI extraction server.
    // Override the target with LEMON_API_TARGET (e.g. when port 8000 is taken).
    proxy: {
      '/api': {
        target: process.env.LEMON_API_TARGET || 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
