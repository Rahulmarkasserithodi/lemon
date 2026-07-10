import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// The pipeline writes to ../data/processed/
// Serving that directory as publicDir means the frontend fetches
// /index.json, /products/{asin}.json etc. with no extra build step.
export default defineConfig({
  plugins: [react()],
  publicDir: path.resolve(__dirname, '../data/processed'),
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
  },
})
