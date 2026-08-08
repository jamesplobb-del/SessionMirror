import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss(), basicSsl()],
  server: {
    host: true,
  },
  // Strip console.* and debugger statements from the production/App Store
  // build only — the dev server (`vite`/`npm run dev`) is untouched.
  esbuild: command === 'build' ? { drop: ['console', 'debugger'] } : {},
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('framer-motion')) return 'motion'
          if (id.includes('@capacitor-community/sqlite') || id.includes('jeep-sqlite')) {
            return 'sqlite'
          }
          if (id.includes('@capacitor')) return 'capacitor'
          return 'vendor'
        },
      },
    },
  },
}))
