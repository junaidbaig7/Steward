import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Read the shared project-root .env. Only VITE_* variables are exposed to the browser.
  envDir: '..',
  server: { port: 5173 },
})
