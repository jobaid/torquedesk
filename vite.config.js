import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Go API (cd server && go run .)
    proxy: { '/api': 'http://localhost:8080' },
  },
  preview: {
    proxy: { '/api': 'http://localhost:8080' },
  },
})
