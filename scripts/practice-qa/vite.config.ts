import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Explicit test-only entrypoint: serves the current real app, never the concept.
// A separate origin isolates localStorage/IndexedDB from normal practice data.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify('2.3.0-practice-qa'),
    'import.meta.env.VITE_FAKE_MEDIA': JSON.stringify('1'),
    'import.meta.env.VITE_GAME_TEST_INPUT': JSON.stringify('1'),
    'import.meta.env.VITE_SENTRY_DSN': JSON.stringify(''),
  },
  server: { host: '127.0.0.1', port: 5217, strictPort: true, hmr: false, watch: null },
})
